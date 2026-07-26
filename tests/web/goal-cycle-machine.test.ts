import { describe, expect, it } from "vitest";
import {
  GOAL_CYCLE_UI_STATE_TRANSITIONS,
  canNavigateToPhase,
  canTransitionGoalCycleState,
  createInitialGoalCycleMachineState,
  deriveGoalCycleEntryCta,
  isEditablePlanningCycle,
  isTerminalGoalCycleState,
  reduceGoalCycleMachine
} from "../../web/app/components/goal-cycle/goal-cycle-machine";
import { GOAL_CYCLE_RESUME_DETAIL_FIXTURE } from "../../web/lib/goal-cycle-api-fixtures";
import type { GoalCycleDetail } from "../../web/lib/goal-cycle-types";

function detail(
  patch: Partial<GoalCycleDetail> = {}
): GoalCycleDetail {
  return { ...GOAL_CYCLE_RESUME_DETAIL_FIXTURE, ...patch };
}

describe("goal-cycle-machine", () => {
  it("starts idle with drawer closed and no invented phase", () => {
    const state = createInitialGoalCycleMachineState();
    expect(state.status).toBe("idle");
    expect(state.drawerOpen).toBe(false);
    expect(state.cycle).toBeNull();
    expect(state.uiPhase).toBeNull();
  });

  it("loads active cycle and resumes draft context from server", () => {
    let state = createInitialGoalCycleMachineState();
    state = reduceGoalCycleMachine(state, { type: "LOAD_START" });
    expect(state.status).toBe("loading");
    expect(state.pendingMutation).toBe("load");

    const cycle = detail();
    state = reduceGoalCycleMachine(state, { type: "LOAD_SUCCESS", cycle });
    expect(state.status).toBe("ready");
    expect(state.cycle?.cycle_id).toBe(cycle.cycle_id);
    expect(state.uiPhase).toBe(cycle.phase);
    expect(state.draftContext).toEqual(cycle.context);
    expect(state.pendingMutation).toBeNull();
  });

  it("LOAD_SUCCESS with null cycle sets empty ready + goal uiPhase", () => {
    let state = createInitialGoalCycleMachineState();
    state = reduceGoalCycleMachine(state, { type: "LOAD_START" });
    state = reduceGoalCycleMachine(state, { type: "LOAD_SUCCESS", cycle: null });
    expect(state.status).toBe("ready");
    expect(state.cycle).toBeNull();
    expect(state.uiPhase).toBe("goal");
    expect(state.draftContext).toEqual({});
  });

  it("START_SUCCESS opens drawer for a new cycle", () => {
    let state = createInitialGoalCycleMachineState();
    const cycle = detail({ state: "draft", phase: "goal", version: 1 });
    state = reduceGoalCycleMachine(state, { type: "START_SUCCESS", cycle });
    expect(state.drawerOpen).toBe(true);
    expect(state.status).toBe("ready");
    expect(state.uiPhase).toBe("goal");
  });

  it("CLOSE keeps cycle for resume; REOPEN restores drawer", () => {
    let state = createInitialGoalCycleMachineState();
    state = reduceGoalCycleMachine(state, {
      type: "START_SUCCESS",
      cycle: detail()
    });
    state = reduceGoalCycleMachine(state, { type: "CLOSE" });
    expect(state.drawerOpen).toBe(false);
    expect(state.cycle).not.toBeNull();
    expect(state.status).toBe("ready");
    expect(state.cycle?.state).not.toBe("cancelled");

    state = reduceGoalCycleMachine(state, { type: "REOPEN" });
    expect(state.drawerOpen).toBe(true);
    expect(state.cycle?.cycle_id).toBe(GOAL_CYCLE_RESUME_DETAIL_FIXTURE.cycle_id);
  });

  it("records load error and RETRY clears retryable errors", () => {
    let state = createInitialGoalCycleMachineState();
    state = reduceGoalCycleMachine(state, { type: "LOAD_START" });
    state = reduceGoalCycleMachine(state, {
      type: "LOAD_ERROR",
      code: "NETWORK",
      message: "offline",
      retryable: true
    });
    expect(state.status).toBe("error");
    expect(state.lastError?.retryable).toBe(true);
    expect(state.lastFailedEvent).toEqual({ type: "LOAD_START" });

    state = reduceGoalCycleMachine(state, { type: "RETRY" });
    expect(state.status).toBe("idle");
    expect(state.lastError).toBeNull();
  });

  it("VERSION_CONFLICT does not invent a new committed phase", () => {
    let state = createInitialGoalCycleMachineState();
    const cycle = detail({ phase: "research", state: "researching" });
    state = reduceGoalCycleMachine(state, { type: "LOAD_SUCCESS", cycle });
    state = reduceGoalCycleMachine(state, {
      type: "MUTATION_PENDING",
      mutation: "checkpoint"
    });
    state = reduceGoalCycleMachine(state, {
      type: "VERSION_CONFLICT",
      message: "stale"
    });
    expect(state.status).toBe("version_conflict");
    expect(state.cycle?.phase).toBe("research");
    expect(state.uiPhase).toBe("research");
    expect(state.lastError?.code).toBe("GOAL_CYCLE_VERSION_CONFLICT");
  });

  it("MUTATION_SUCCESS syncs server checkpoint into uiPhase and draft", () => {
    let state = createInitialGoalCycleMachineState();
    state = reduceGoalCycleMachine(state, {
      type: "LOAD_SUCCESS",
      cycle: detail({ phase: "goal", state: "draft", context: { a: 1 } })
    });
    state = reduceGoalCycleMachine(state, {
      type: "MUTATION_PENDING",
      mutation: "checkpoint"
    });
    const next = detail({
      phase: "context",
      state: "draft",
      version: 2,
      context: { a: 1, b: 2 }
    });
    state = reduceGoalCycleMachine(state, { type: "MUTATION_SUCCESS", cycle: next });
    expect(state.status).toBe("ready");
    expect(state.uiPhase).toBe("context");
    expect(state.draftContext).toEqual({ a: 1, b: 2 });
    expect(state.cycle?.version).toBe(2);
  });

  it("MUTATION_SUCCESS preserves logistics/approval UI lead when server stays on revisions", () => {
    let state = createInitialGoalCycleMachineState();
    state = reduceGoalCycleMachine(state, {
      type: "LOAD_SUCCESS",
      cycle: detail({ phase: "revisions", state: "review" })
    });
    state = reduceGoalCycleMachine(state, {
      type: "REQUEST_PHASE",
      phase: "logistics"
    });
    expect(state.uiPhase).toBe("logistics");

    state = reduceGoalCycleMachine(state, {
      type: "MUTATION_PENDING",
      mutation: "manual_edit"
    });
    state = reduceGoalCycleMachine(state, {
      type: "MUTATION_SUCCESS",
      cycle: detail({ phase: "revisions", state: "review", version: 9 })
    });
    expect(state.uiPhase).toBe("logistics");
    expect(state.cycle?.phase).toBe("revisions");

    state = reduceGoalCycleMachine(state, {
      type: "REQUEST_PHASE",
      phase: "approval"
    });
    expect(state.uiPhase).toBe("approval");
  });

  it("ignores nested MUTATION_PENDING while already mutating", () => {
    let state = createInitialGoalCycleMachineState();
    state = reduceGoalCycleMachine(state, {
      type: "LOAD_SUCCESS",
      cycle: detail()
    });
    state = reduceGoalCycleMachine(state, {
      type: "MUTATION_PENDING",
      mutation: "first"
    });
    const nested = reduceGoalCycleMachine(state, {
      type: "MUTATION_PENDING",
      mutation: "second"
    });
    expect(nested).toEqual(state);
    expect(nested.pendingMutation).toBe("first");
  });

  it("REQUEST_PHASE allows back-nav and one step ahead; rejects illegal jumps", () => {
    let state = createInitialGoalCycleMachineState();
    state = reduceGoalCycleMachine(state, {
      type: "LOAD_SUCCESS",
      cycle: detail({ phase: "research", state: "researching" })
    });

    state = reduceGoalCycleMachine(state, {
      type: "REQUEST_PHASE",
      phase: "goal"
    });
    expect(state.uiPhase).toBe("goal");
    expect(state.cycle?.phase).toBe("research");

    state = reduceGoalCycleMachine(state, {
      type: "REQUEST_PHASE",
      phase: "questions"
    });
    expect(state.uiPhase).toBe("questions");

    const blocked = reduceGoalCycleMachine(state, {
      type: "REQUEST_PHASE",
      phase: "approval"
    });
    expect(blocked.uiPhase).toBe("questions");
    expect(blocked.cycle?.phase).toBe("research");
  });

  it("rejects phase navigation and draft edits on terminal cycles", () => {
    const cancelled = detail({ state: "cancelled", phase: "goal" });
    expect(isTerminalGoalCycleState(cancelled.state)).toBe(true);
    expect(isEditablePlanningCycle(cancelled)).toBe(false);
    expect(canNavigateToPhase(cancelled, "context")).toBe(false);

    let state = createInitialGoalCycleMachineState();
    state = reduceGoalCycleMachine(state, {
      type: "LOAD_SUCCESS",
      cycle: cancelled
    });
    const afterDraft = reduceGoalCycleMachine(state, {
      type: "SET_DRAFT_CONTEXT",
      patch: { notes: "nope" }
    });
    expect(afterDraft.draftContext).toEqual(cancelled.context);
    const afterPhase = reduceGoalCycleMachine(state, {
      type: "REQUEST_PHASE",
      phase: "context"
    });
    expect(afterPhase.uiPhase).toBe("goal");
  });

  it("mirrors server transition table and entry CTAs", () => {
    expect(canTransitionGoalCycleState("draft", "researching")).toBe(true);
    expect(canTransitionGoalCycleState("draft", "active")).toBe(false);
    expect(GOAL_CYCLE_UI_STATE_TRANSITIONS.completed).toEqual([]);
    expect(deriveGoalCycleEntryCta(null)).toBe("plan_this_month");
    expect(deriveGoalCycleEntryCta(detail())).toBe("resume_plan");
    expect(
      deriveGoalCycleEntryCta(detail({ state: "completion_suggested" }))
    ).toBe("review_completion");
    expect(deriveGoalCycleEntryCta(detail({ state: "cancelled" }))).toBe(
      "plan_this_month"
    );
  });
});
