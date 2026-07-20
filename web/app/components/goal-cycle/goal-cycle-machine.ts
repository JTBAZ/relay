/**
 * Goal Cycle UI state machine (VS6-T01).
 * Pure reducer — no React, no fetch. Server checkpoint is authoritative after mutations.
 */

import type {
  GoalCycleDetail,
  GoalCyclePhase,
  GoalCycleState
} from "@/lib/goal-cycle-types";

export const GOAL_CYCLE_TERMINAL_STATES = new Set<GoalCycleState>([
  "completed",
  "cancelled",
  "failed"
]);

/** Mirror of server lifecycle transitions — local UI may not invent others. */
export const GOAL_CYCLE_UI_STATE_TRANSITIONS: Record<
  GoalCycleState,
  readonly GoalCycleState[]
> = {
  draft: ["researching", "questions", "review", "cancelled", "failed"],
  researching: ["questions", "review", "cancelled", "failed"],
  questions: ["review", "cancelled", "failed"],
  review: ["approved", "cancelled", "failed"],
  approved: ["materializing", "cancelled", "failed"],
  materializing: ["active", "failed"],
  active: ["completion_suggested", "cancelled", "failed"],
  completion_suggested: ["completed", "active", "cancelled"],
  completed: [],
  cancelled: [],
  failed: []
};

/** Planning phases the Dream drawer may show (pre-approval). */
export const GOAL_CYCLE_PLANNING_PHASES: readonly GoalCyclePhase[] = [
  "goal",
  "context",
  "research",
  "questions",
  "revisions",
  "logistics",
  "approval"
] as const;

export type GoalCycleUiStatus =
  | "idle"
  | "loading"
  | "ready"
  | "mutating"
  | "error"
  | "version_conflict";

export type GoalCycleMachineError = {
  code: string;
  message: string;
  retryable: boolean;
};

export type GoalCycleMachineState = {
  status: GoalCycleUiStatus;
  /** Drawer/panel open — close does not cancel the cycle. */
  drawerOpen: boolean;
  /** Last known server cycle (null = no active / empty). */
  cycle: GoalCycleDetail | null;
  /**
   * Local presentation phase. Must stay within canNavigateToPhase(server).
   * Never written back as a committed checkpoint by this machine alone.
   */
  uiPhase: GoalCyclePhase | null;
  /** Optimistic field edits; never invents committed phase/state. */
  draftContext: Record<string, unknown>;
  lastError: GoalCycleMachineError | null;
  pendingMutation: string | null;
  /** Last event that failed — used by RETRY. */
  lastFailedEvent: GoalCycleMachineEvent | null;
};

export type GoalCycleMachineEvent =
  | { type: "LOAD_START" }
  | { type: "LOAD_SUCCESS"; cycle: GoalCycleDetail | null }
  | { type: "LOAD_ERROR"; code: string; message: string; retryable?: boolean }
  | { type: "START_SUCCESS"; cycle: GoalCycleDetail }
  | { type: "SYNC_FROM_SERVER"; cycle: GoalCycleDetail }
  | { type: "MUTATION_PENDING"; mutation: string }
  | { type: "MUTATION_SUCCESS"; cycle: GoalCycleDetail }
  | {
      type: "MUTATION_ERROR";
      code: string;
      message: string;
      retryable?: boolean;
      failedEvent?: GoalCycleMachineEvent;
    }
  | { type: "VERSION_CONFLICT"; message?: string; failedEvent?: GoalCycleMachineEvent }
  | { type: "RETRY" }
  | { type: "CLEAR_ERROR" }
  | { type: "OPEN" }
  | { type: "CLOSE" }
  | { type: "REOPEN" }
  | { type: "SET_DRAFT_CONTEXT"; patch: Record<string, unknown> }
  | { type: "REQUEST_PHASE"; phase: GoalCyclePhase };

export function createInitialGoalCycleMachineState(): GoalCycleMachineState {
  return {
    status: "idle",
    drawerOpen: false,
    cycle: null,
    uiPhase: null,
    draftContext: {},
    lastError: null,
    pendingMutation: null,
    lastFailedEvent: null
  };
}

export function isTerminalGoalCycleState(state: GoalCycleState): boolean {
  return GOAL_CYCLE_TERMINAL_STATES.has(state);
}

export function canTransitionGoalCycleState(
  from: GoalCycleState,
  to: GoalCycleState
): boolean {
  if (from === to) return true;
  return GOAL_CYCLE_UI_STATE_TRANSITIONS[from].includes(to);
}

export function isEditablePlanningCycle(cycle: GoalCycleDetail | null): boolean {
  if (!cycle) return false;
  if (isTerminalGoalCycleState(cycle.state)) return false;
  return (
    cycle.state === "draft" ||
    cycle.state === "researching" ||
    cycle.state === "questions" ||
    cycle.state === "review"
  );
}

/**
 * Whether the UI may navigate to a planning phase given the server checkpoint.
 * Back-navigation within already-reached phases is allowed; forward jumps past
 * the server phase are rejected. Local uiPhase may lead by at most one step.
 */
export function canNavigateToPhase(
  cycle: GoalCycleDetail | null,
  target: GoalCyclePhase,
  currentUiPhase?: GoalCyclePhase | null
): boolean {
  if (!cycle) return target === "goal";
  if (isTerminalGoalCycleState(cycle.state)) return false;
  if (!GOAL_CYCLE_PLANNING_PHASES.includes(target)) {
    // Post-approval phases are view-only from server sync, not local requests.
    return cycle.phase === target;
  }
  if (!isEditablePlanningCycle(cycle) && cycle.state !== "approved") {
    return cycle.phase === target;
  }

  const order = GOAL_CYCLE_PLANNING_PHASES;
  const serverIdx = order.indexOf(cycle.phase as (typeof order)[number]);
  const uiIdx =
    currentUiPhase != null
      ? order.indexOf(currentUiPhase as (typeof order)[number])
      : -1;
  const targetIdx = order.indexOf(target);
  if (targetIdx < 0) return false;
  const reachedIdx = Math.max(serverIdx, uiIdx);
  // Allow current and earlier phases; one step ahead only when still editable.
  if (reachedIdx < 0) return targetIdx === 0;
  if (targetIdx <= reachedIdx) return true;
  return isEditablePlanningCycle(cycle) && targetIdx === reachedIdx + 1;
}

function asError(
  code: string,
  message: string,
  retryable: boolean
): GoalCycleMachineError {
  return { code, message, retryable };
}

/**
 * Reduce Goal Cycle UI machine. Illegal REQUEST_PHASE leaves state unchanged
 * (callers should check canNavigateToPhase first).
 */
export function reduceGoalCycleMachine(
  state: GoalCycleMachineState,
  event: GoalCycleMachineEvent
): GoalCycleMachineState {
  switch (event.type) {
    case "LOAD_START":
      return {
        ...state,
        status: "loading",
        lastError: null,
        pendingMutation: "load",
        lastFailedEvent: null
      };

    case "LOAD_SUCCESS":
      return {
        ...state,
        status: "ready",
        cycle: event.cycle,
        uiPhase: event.cycle?.phase ?? "goal",
        draftContext: event.cycle ? { ...event.cycle.context } : {},
        lastError: null,
        pendingMutation: null,
        lastFailedEvent: null
      };

    case "LOAD_ERROR":
      return {
        ...state,
        status: "error",
        lastError: asError(
          event.code,
          event.message,
          event.retryable ?? true
        ),
        pendingMutation: null,
        lastFailedEvent: { type: "LOAD_START" }
      };

    case "START_SUCCESS":
      return {
        ...state,
        status: "ready",
        drawerOpen: true,
        cycle: event.cycle,
        uiPhase: event.cycle.phase,
        draftContext: { ...event.cycle.context },
        lastError: null,
        pendingMutation: null,
        lastFailedEvent: null
      };

    case "SYNC_FROM_SERVER":
      return {
        ...state,
        status: state.status === "mutating" ? "ready" : state.status === "idle" ? "ready" : state.status,
        cycle: event.cycle,
        uiPhase: event.cycle.phase,
        draftContext: { ...event.cycle.context },
        lastError: null,
        pendingMutation: null,
        lastFailedEvent: null
      };

    case "MUTATION_PENDING":
      if (state.status === "mutating") {
        // Ignore nested pending — keep first mutation label.
        return state;
      }
      return {
        ...state,
        status: "mutating",
        pendingMutation: event.mutation,
        lastError: null
      };

    case "MUTATION_SUCCESS": {
      // Manual-edit / planner checkpoints often stay on server phase "revisions"
      // while the Dream UI legitimately leads into logistics → approval. Do not
      // clobber that lead or Continue/Review loop forever.
      const order = GOAL_CYCLE_PLANNING_PHASES;
      const serverPhase = event.cycle.phase;
      const serverIdx = order.indexOf(serverPhase as (typeof order)[number]);
      const uiIdx =
        state.uiPhase != null
          ? order.indexOf(state.uiPhase as (typeof order)[number])
          : -1;
      const keepLocalLead =
        uiIdx > serverIdx &&
        state.uiPhase != null &&
        canNavigateToPhase(event.cycle, state.uiPhase, state.uiPhase);
      return {
        ...state,
        status: "ready",
        cycle: event.cycle,
        uiPhase: keepLocalLead ? state.uiPhase : serverPhase,
        draftContext: { ...event.cycle.context },
        lastError: null,
        pendingMutation: null,
        lastFailedEvent: null
      };
    }

    case "MUTATION_ERROR":
      return {
        ...state,
        status: "error",
        lastError: asError(
          event.code,
          event.message,
          event.retryable ?? true
        ),
        pendingMutation: null,
        lastFailedEvent: event.failedEvent ?? state.lastFailedEvent
      };

    case "VERSION_CONFLICT":
      return {
        ...state,
        status: "version_conflict",
        lastError: asError(
          "GOAL_CYCLE_VERSION_CONFLICT",
          event.message ?? "Goal Cycle version conflict.",
          true
        ),
        pendingMutation: null,
        lastFailedEvent: event.failedEvent ?? state.lastFailedEvent
      };

    case "RETRY":
      if (!state.lastError?.retryable) return state;
      // Clear error and signal caller to re-dispatch lastFailedEvent externally.
      return {
        ...state,
        status: state.cycle ? "ready" : "idle",
        lastError: null,
        pendingMutation: null
      };

    case "CLEAR_ERROR":
      return {
        ...state,
        status: state.cycle ? "ready" : "idle",
        lastError: null,
        lastFailedEvent: null
      };

    case "OPEN":
      return { ...state, drawerOpen: true };

    case "CLOSE":
      return {
        ...state,
        drawerOpen: false,
        // Closing never cancels; keep cycle + draft for resume.
        status:
          state.status === "mutating" || state.status === "loading"
            ? state.status
            : state.cycle
              ? "ready"
              : state.status
      };

    case "REOPEN":
      return {
        ...state,
        drawerOpen: true,
        status: state.cycle ? "ready" : state.status
      };

    case "SET_DRAFT_CONTEXT":
      if (!isEditablePlanningCycle(state.cycle)) return state;
      return {
        ...state,
        draftContext: { ...state.draftContext, ...event.patch }
      };

    case "REQUEST_PHASE": {
      if (!canNavigateToPhase(state.cycle, event.phase, state.uiPhase)) {
        return state;
      }
      return {
        ...state,
        uiPhase: event.phase
      };
    }

    default:
      return state;
  }
}

/** Entry CTA derived from server hydration (for launcher — VS6-T05). */
export type GoalCycleEntryCta =
  | "plan_this_month"
  | "resume_plan"
  | "review_completion";

export function deriveGoalCycleEntryCta(
  cycle: GoalCycleDetail | null
): GoalCycleEntryCta {
  if (!cycle) return "plan_this_month";
  if (cycle.state === "completion_suggested" || cycle.state === "completed") {
    return "review_completion";
  }
  if (isTerminalGoalCycleState(cycle.state)) return "plan_this_month";
  if (
    cycle.state === "draft" ||
    cycle.state === "researching" ||
    cycle.state === "questions" ||
    cycle.state === "review"
  ) {
    return "resume_plan";
  }
  if (
    cycle.state === "approved" ||
    cycle.state === "materializing" ||
    cycle.state === "active"
  ) {
    return "resume_plan";
  }
  return "plan_this_month";
}
