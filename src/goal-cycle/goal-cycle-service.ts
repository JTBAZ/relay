/**
 * Goal Cycle lifecycle service (VS1-T02).
 * Routes are registered in VS1-T03.
 */

import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { creatorLocalPeriodKey, resolvePostingGoalTimezone } from "../autopost/posting-goal-service.js";
import {
  GOAL_CYCLE_BOUNDED_TEXT_MAX,
  GOAL_CYCLE_MAX_QUESTIONS,
  GoalCycleContractError,
  getGoalCycleFeatureFlags,
  isGoalCycleBreakMode,
  isGoalCycleGoalKind,
  isGoalCyclePhase,
  isGoalCycleState,
  type GoalCycleBreakMode,
  type GoalCycleDetail,
  type GoalCycleGoalKind,
  type GoalCyclePhase,
  type GoalCycleState,
  type GoalCycleSummary
} from "./contracts.js";
import {
  asContextRecord,
  assertKnownEnums,
  findActiveGoalCycle,
  findGoalCycleByIdempotency,
  findGoalCycleForCreator,
  hydrateGoalCycleDetail,
  insertGoalCycle,
  mapGoalCycleSummary,
  type GoalCycleRow
} from "./goal-cycle-store.js";
import {
  CoachPlanCreditError,
  getCoachPlanCreditStatus,
  releaseCoachPlanCreditReservation,
  reserveCoachPlanCreditForCycle,
  shouldReserveCoachPlanCredit
} from "../usage/coach-plan-credit-service.js";
import {
  assertCanSuggestCompletion,
  outcomeSummaryFromSnapshot,
  refreshGoalCycleOutcomeSnapshot,
  type GoalCycleOutcomeSnapshot
} from "./outcomes/goal-cycle-outcome-service.js";

const TERMINAL_STATES = new Set<GoalCycleState>(["completed", "cancelled", "failed"]);

/** Allowed state transitions for the core lifecycle (planner/materialization may narrow further). */
export const GOAL_CYCLE_TRANSITIONS: Record<GoalCycleState, readonly GoalCycleState[]> = {
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

export class GoalCycleNotFoundError extends Error {
  public override readonly name = "GoalCycleNotFoundError";
  public constructor(message = "Goal Cycle not found.") {
    super(message);
  }
}

export type StartGoalCycleInput = {
  goal_kind: GoalCycleGoalKind;
  break_mode?: GoalCycleBreakMode | null;
  time_zone?: string | null;
  context?: Record<string, unknown> | null;
  idempotency_key?: string | null;
  now?: Date;
};

export type PatchGoalCycleCheckpointInput = {
  expected_version: number;
  phase?: GoalCyclePhase;
  state?: GoalCycleState;
  context?: Record<string, unknown> | null;
  progress_message_code?: string | null;
};

export type ListGoalCyclesResult = {
  items: GoalCycleSummary[];
  next_cursor: string | null;
};

function boundedContext(raw: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const context = asContextRecord(raw ?? {});
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (typeof value === "string") {
      out[key] = value.slice(0, GOAL_CYCLE_BOUNDED_TEXT_MAX);
    } else if (
      value === null ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      out[key] = value;
    } else if (
      (key === "linked_destinations" || key === "unlinked_destinations") &&
      Array.isArray(value)
    ) {
      out[key] = value.map(String).slice(0, 16);
    } else if (key === "planner_questions" && Array.isArray(value)) {
      // VS5: allow 0–2 structured clarification questions in checkpoint context.
      out[key] = value.slice(0, GOAL_CYCLE_MAX_QUESTIONS).map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return null;
        const q = item as Record<string, unknown>;
        const options = Array.isArray(q.options) ? q.options.map(String).slice(0, 6) : [];
        return {
          id: typeof q.id === "string" ? q.id.slice(0, 64) : "q",
          prompt:
            typeof q.prompt === "string" ? q.prompt.slice(0, GOAL_CYCLE_BOUNDED_TEXT_MAX) : "",
          options,
          bounded_text:
            typeof q.bounded_text === "string"
              ? q.bounded_text.slice(0, GOAL_CYCLE_BOUNDED_TEXT_MAX)
              : null,
          answer:
            typeof q.answer === "string" ? q.answer.slice(0, GOAL_CYCLE_BOUNDED_TEXT_MAX) : null
        };
      }).filter(Boolean);
    }
  }
  return out;
}

function validateStartInput(input: StartGoalCycleInput): {
  goalKind: GoalCycleGoalKind;
  breakMode: GoalCycleBreakMode | null;
  timeZone: string;
  context: Record<string, unknown>;
  idempotencyKey: string | null;
} {
  if (!isGoalCycleGoalKind(input.goal_kind)) {
    throw new GoalCycleContractError("GOAL_CYCLE_PLAN_INVALID", "Invalid goal_kind.", [
      { field: "goal_kind", issue: "invalid" }
    ]);
  }
  let breakMode: GoalCycleBreakMode | null = input.break_mode ?? null;
  if (input.goal_kind === "break") {
    if (!breakMode || !isGoalCycleBreakMode(breakMode)) {
      throw new GoalCycleContractError("GOAL_CYCLE_PLAN_INVALID", "break_mode is required for break goals.", [
        { field: "break_mode", issue: "required" }
      ]);
    }
  } else if (breakMode != null) {
    throw new GoalCycleContractError("GOAL_CYCLE_PLAN_INVALID", "break_mode is only valid for break goals.", [
      { field: "break_mode", issue: "unexpected" }
    ]);
  } else {
    breakMode = null;
  }

  const idem =
    typeof input.idempotency_key === "string" && input.idempotency_key.trim()
      ? input.idempotency_key.trim().slice(0, 128)
      : null;

  return {
    goalKind: input.goal_kind,
    breakMode,
    timeZone: resolvePostingGoalTimezone(input.time_zone),
    context: boundedContext(input.context),
    idempotencyKey: idem
  };
}

function assertTransition(from: GoalCycleState, to: GoalCycleState): void {
  const allowed = GOAL_CYCLE_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new GoalCycleContractError(
      "GOAL_CYCLE_INVALID_STATE",
      `Cannot transition from ${from} to ${to}.`,
      [
        { field: "state", issue: "invalid_transition" },
        { field: "from", issue: from },
        { field: "to", issue: to }
      ]
    );
  }
}

function mapCreditError(err: unknown): never {
  if (err instanceof CoachPlanCreditError) {
    throw new GoalCycleContractError(err.code, err.message, err.details);
  }
  throw err;
}

async function attachCreditStatus(
  prisma: PrismaClient,
  creatorId: string,
  detail: GoalCycleDetail
): Promise<GoalCycleDetail> {
  try {
    const credit = await getCoachPlanCreditStatus(prisma, creatorId);
    return { ...detail, credit };
  } catch {
    return detail;
  }
}

async function releaseCycleReservationIfAny(
  prisma: PrismaClient,
  creatorId: string,
  row: GoalCycleRow,
  reason: string
): Promise<void> {
  if (!row.reservationRef) return;
  try {
    await releaseCoachPlanCreditReservation(prisma, {
      creatorId,
      cycleId: row.id,
      reason,
      idempotencyKey: `release:${row.id}:${reason}`
    });
  } catch (err) {
    if (err instanceof CoachPlanCreditError && err.code === "GOAL_CYCLE_INVALID_STATE") {
      return;
    }
    if (err instanceof CoachPlanCreditError && err.code === "GOAL_CYCLE_NOT_FOUND") {
      return;
    }
    mapCreditError(err);
  }
}

export async function startGoalCycle(
  prisma: PrismaClient,
  creatorId: string,
  input: StartGoalCycleInput
): Promise<GoalCycleDetail> {
  const id = creatorId.trim();
  if (!getGoalCycleFeatureFlags().enabled) {
    throw new GoalCycleContractError(
      "GOAL_CYCLE_INVALID_STATE",
      "Goal Cycle is not enabled.",
      [{ field: "enabled", issue: "disabled" }]
    );
  }
  const parsed = validateStartInput(input);
  const now = input.now ?? new Date();
  const periodKey = creatorLocalPeriodKey(now, parsed.timeZone);

  if (parsed.idempotencyKey) {
    const existingByKey = await findGoalCycleByIdempotency(prisma, id, parsed.idempotencyKey);
    if (existingByKey) {
      assertKnownEnums(existingByKey);
      return attachCreditStatus(prisma, id, await hydrateGoalCycleDetail(prisma, existingByKey));
    }
  }

  const active = await findActiveGoalCycle(prisma, id);
  if (active) {
    throw new GoalCycleContractError(
      "GOAL_CYCLE_ACTIVE_EXISTS",
      "Another Goal Cycle is already active.",
      [{ field: "cycle_id", issue: active.id }]
    );
  }

  let row: GoalCycleRow;
  try {
    row = await prisma.$transaction(async (tx) => {
      const again = await findActiveGoalCycle(tx, id);
      if (again) {
        throw new GoalCycleContractError(
          "GOAL_CYCLE_ACTIVE_EXISTS",
          "Another Goal Cycle is already active.",
          [{ field: "cycle_id", issue: again.id }]
        );
      }
      if (parsed.idempotencyKey) {
        const byKey = await findGoalCycleByIdempotency(tx, id, parsed.idempotencyKey);
        if (byKey) return byKey;
      }
      return insertGoalCycle(tx, {
        creatorId: id,
        state: "draft",
        phase: "goal",
        goalKind: parsed.goalKind,
        breakMode: parsed.breakMode,
        periodKey,
        timeZone: parsed.timeZone,
        contextJson: parsed.context,
        startIdempotencyKey: parsed.idempotencyKey
      });
    });
  } catch (err) {
    if (err instanceof GoalCycleContractError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    if (/unique|active_scope|Unique constraint/i.test(message)) {
      throw new GoalCycleContractError(
        "GOAL_CYCLE_ACTIVE_EXISTS",
        "Another Goal Cycle is already active.",
        [{ field: "active_scope", issue: "conflict" }]
      );
    }
    throw err;
  }

  const needsCredit = shouldReserveCoachPlanCredit({
    goal_kind: parsed.goalKind,
    break_mode: parsed.breakMode
  });

  if (needsCredit) {
    try {
      const reserved = await reserveCoachPlanCreditForCycle(prisma, {
        creatorId: id,
        cycleId: row.id,
        idempotencyKey: `reserve:${row.id}`,
        now
      });
      row = await prisma.creatorGoalCycle.update({
        where: { id: row.id },
        data: { reservationRef: reserved.reservation?.reservation_key ?? `cpc_res_${row.id}` }
      });
    } catch (err) {
      await prisma.creatorGoalCycle
        .update({
          where: { id: row.id },
          data: {
            state: "cancelled",
            activeScope: null,
            cancelledAt: new Date(),
            cancelReason: "no_credit",
            version: { increment: 1 }
          }
        })
        .catch(() => undefined);
      mapCreditError(err);
    }
  }

  return attachCreditStatus(prisma, id, await hydrateGoalCycleDetail(prisma, row));
}

export async function getActiveGoalCycle(
  prisma: PrismaClient,
  creatorId: string
): Promise<GoalCycleDetail | null> {
  const row = await findActiveGoalCycle(prisma, creatorId.trim());
  if (!row) return null;
  assertKnownEnums(row);
  return attachCreditStatus(prisma, creatorId.trim(), await hydrateGoalCycleDetail(prisma, row));
}

export async function getGoalCycle(
  prisma: PrismaClient,
  creatorId: string,
  cycleId: string
): Promise<GoalCycleDetail> {
  const row = await findGoalCycleForCreator(prisma, creatorId.trim(), cycleId.trim());
  if (!row) throw new GoalCycleNotFoundError();
  assertKnownEnums(row);
  return attachCreditStatus(prisma, creatorId.trim(), await hydrateGoalCycleDetail(prisma, row));
}

export async function listGoalCycles(
  prisma: PrismaClient,
  creatorId: string,
  args: { cursor?: string | null; limit?: number } = {}
): Promise<ListGoalCyclesResult> {
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 50);
  const rows = await prisma.creatorGoalCycle.findMany({
    where: { creatorId: creatorId.trim() },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(args.cursor
      ? {
          cursor: { id: args.cursor },
          skip: 1
        }
      : {})
  });
  const page = rows.slice(0, limit);
  const next = rows.length > limit ? page[page.length - 1]?.id ?? null : null;
  return {
    items: page.map(mapGoalCycleSummary),
    next_cursor: next
  };
}

export async function patchGoalCycleCheckpoint(
  prisma: PrismaClient,
  creatorId: string,
  cycleId: string,
  input: PatchGoalCycleCheckpointInput
): Promise<GoalCycleDetail> {
  const id = creatorId.trim();
  const cid = cycleId.trim();
  if (!Number.isInteger(input.expected_version) || input.expected_version < 1) {
    throw new GoalCycleContractError("GOAL_CYCLE_VERSION_CONFLICT", "expected_version is required.", [
      { field: "expected_version", issue: "required" }
    ]);
  }

  const detail = await prisma.$transaction(async (tx) => {
    const row = await findGoalCycleForCreator(tx, id, cid);
    if (!row) throw new GoalCycleNotFoundError();
    assertKnownEnums(row);
    if (TERMINAL_STATES.has(row.state as GoalCycleState)) {
      throw new GoalCycleContractError(
        "GOAL_CYCLE_INVALID_STATE",
        "Cannot patch a terminal Goal Cycle.",
        [{ field: "state", issue: row.state }]
      );
    }
    if (row.version !== input.expected_version) {
      throw new GoalCycleContractError(
        "GOAL_CYCLE_VERSION_CONFLICT",
        "Goal Cycle version conflict.",
        [
          { field: "expected_version", issue: String(input.expected_version) },
          { field: "current_version", issue: String(row.version) }
        ]
      );
    }

    let nextState = row.state as GoalCycleState;
    let nextPhase = row.phase as GoalCyclePhase;
    if (input.state != null) {
      if (!isGoalCycleState(input.state)) {
        throw new GoalCycleContractError("GOAL_CYCLE_INVALID_STATE", "Invalid state.", [
          { field: "state", issue: "invalid" }
        ]);
      }
      if (input.state !== nextState) {
        assertTransition(nextState, input.state);
        nextState = input.state;
      }
    }
    if (input.phase != null) {
      if (!isGoalCyclePhase(input.phase)) {
        throw new GoalCycleContractError("GOAL_CYCLE_INVALID_STATE", "Invalid phase.", [
          { field: "phase", issue: "invalid" }
        ]);
      }
      nextPhase = input.phase;
    }

    const nextContext =
      input.context !== undefined
        ? { ...asContextRecord(row.contextJson), ...boundedContext(input.context) }
        : asContextRecord(row.contextJson);

    const nextVersion = row.version + 1;
    const checkpointJson = {
      phase: nextPhase,
      state: nextState,
      context: nextContext
    } as Prisma.InputJsonValue;

    const bumped = await tx.creatorGoalCycle.updateMany({
      where: {
        id: row.id,
        creatorId: id,
        version: input.expected_version
      },
      data: {
        state: nextState,
        phase: nextPhase,
        contextJson: nextContext as Prisma.InputJsonValue,
        version: nextVersion
      }
    });
    if (bumped.count !== 1) {
      throw new GoalCycleContractError(
        "GOAL_CYCLE_VERSION_CONFLICT",
        "Goal Cycle version conflict.",
        [
          { field: "expected_version", issue: String(input.expected_version) },
          { field: "current_version", issue: "stale_or_concurrent" }
        ]
      );
    }

    const updated = await tx.creatorGoalCycle.findFirstOrThrow({ where: { id: row.id } });

    await tx.creatorGoalCycleCheckpoint.upsert({
      where: { cycleId: row.id },
      create: {
        cycleId: row.id,
        phase: nextPhase,
        stateJson: checkpointJson,
        version: nextVersion
      },
      update: {
        phase: nextPhase,
        stateJson: checkpointJson,
        version: nextVersion
      }
    });

    if (input.progress_message_code?.trim()) {
      const last = await tx.creatorGoalCycleProgress.findFirst({
        where: { cycleId: row.id },
        orderBy: { sequence: "desc" }
      });
      const sequence = (last?.sequence ?? 0) + 1;
      await tx.creatorGoalCycleProgress.create({
        data: {
          cycleId: row.id,
          sequence,
          phase: nextPhase,
          messageCode: input.progress_message_code.trim().slice(0, 64),
          metadataJson: { retryable: false } as Prisma.InputJsonValue
        }
      });
    }

    return hydrateGoalCycleDetail(tx, updated);
  });

  if (detail.state === "failed") {
    const failedRow = await findGoalCycleForCreator(prisma, id, cid);
    if (failedRow) await releaseCycleReservationIfAny(prisma, id, failedRow, "failed");
  }
  return attachCreditStatus(prisma, id, detail);
}

export async function cancelGoalCycle(
  prisma: PrismaClient,
  creatorId: string,
  cycleId: string,
  reason?: string | null
): Promise<GoalCycleDetail> {
  const id = creatorId.trim();
  const updated = await prisma.$transaction(async (tx) => {
    const row = await findGoalCycleForCreator(tx, id, cycleId.trim());
    if (!row) throw new GoalCycleNotFoundError();
    assertKnownEnums(row);
    const state = row.state as GoalCycleState;
    if (TERMINAL_STATES.has(state)) {
      throw new GoalCycleContractError(
        "GOAL_CYCLE_INVALID_STATE",
        "Goal Cycle is already terminal.",
        [{ field: "state", issue: state }]
      );
    }
    assertTransition(state, "cancelled");
    return tx.creatorGoalCycle.update({
      where: { id: row.id },
      data: {
        state: "cancelled",
        activeScope: null,
        cancelledAt: new Date(),
        cancelReason: reason?.trim().slice(0, GOAL_CYCLE_BOUNDED_TEXT_MAX) || null,
        version: row.version + 1
      }
    });
  });
  await releaseCycleReservationIfAny(prisma, id, updated, "cancelled");
  return attachCreditStatus(prisma, id, await hydrateGoalCycleDetail(prisma, updated));
}

/** Internal / service path — does not terminalize. Refreshes outcome snapshot first. */
export async function suggestGoalCycleCompletion(
  prisma: PrismaClient,
  creatorId: string,
  cycleId: string,
  opts: { allowReview?: boolean; force?: boolean; now?: Date } = {}
): Promise<GoalCycleDetail> {
  const snapshot = await refreshGoalCycleOutcomeSnapshot(prisma, creatorId, cycleId, {
    now: opts.now
  });
  assertCanSuggestCompletion(snapshot, {
    allowReview: opts.allowReview,
    force: opts.force
  });

  return prisma.$transaction(async (tx) => {
    const row = await findGoalCycleForCreator(tx, creatorId.trim(), cycleId.trim());
    if (!row) throw new GoalCycleNotFoundError();
    assertKnownEnums(row);
    const state = row.state as GoalCycleState;
    if (state === "completion_suggested") {
      return hydrateGoalCycleDetail(tx, row);
    }
    if (state !== "active") {
      throw new GoalCycleContractError(
        "GOAL_CYCLE_INVALID_STATE",
        "Completion can only be suggested from active.",
        [{ field: "state", issue: state }]
      );
    }
    assertTransition(state, "completion_suggested");
    const updated = await tx.creatorGoalCycle.update({
      where: { id: row.id },
      data: {
        state: "completion_suggested",
        phase: "completion",
        completionSuggestedAt: new Date(),
        version: row.version + 1
      }
    });
    const summary = outcomeSummaryFromSnapshot(snapshot);
    await tx.creatorGoalCycleOutcome.upsert({
      where: { cycleId: row.id },
      create: {
        cycleId: row.id,
        targetJson: { snapshot, summary } as object,
        actualJson: snapshot.actual as object,
        suggestedCompletion: true,
        confidence: snapshot.confidence,
        freshnessSeconds: snapshot.freshness_seconds
      },
      update: {
        suggestedCompletion: true,
        confidence: snapshot.confidence,
        freshnessSeconds: snapshot.freshness_seconds,
        targetJson: { snapshot, summary } as object,
        actualJson: snapshot.actual as object
      }
    });
    return hydrateGoalCycleDetail(tx, updated);
  });
}

/** Creator rejects suggestion — return to active (no terminalize). */
export async function dismissGoalCycleCompletionSuggestion(
  prisma: PrismaClient,
  creatorId: string,
  cycleId: string
): Promise<GoalCycleDetail> {
  return prisma.$transaction(async (tx) => {
    const row = await findGoalCycleForCreator(tx, creatorId.trim(), cycleId.trim());
    if (!row) throw new GoalCycleNotFoundError();
    assertKnownEnums(row);
    const state = row.state as GoalCycleState;
    if (state === "active") {
      return hydrateGoalCycleDetail(tx, row);
    }
    if (state !== "completion_suggested") {
      throw new GoalCycleContractError(
        "GOAL_CYCLE_INVALID_STATE",
        "Dismiss requires completion_suggested.",
        [{ field: "state", issue: state }]
      );
    }
    assertTransition(state, "active");
    const updated = await tx.creatorGoalCycle.update({
      where: { id: row.id },
      data: {
        state: "active",
        phase: "active",
        completionSuggestedAt: null,
        version: row.version + 1
      }
    });
    await tx.creatorGoalCycleOutcome.updateMany({
      where: { cycleId: row.id },
      data: { suggestedCompletion: false }
    });
    return hydrateGoalCycleDetail(tx, updated);
  });
}

export type { GoalCycleOutcomeSnapshot };

export async function confirmGoalCycleCompletion(
  prisma: PrismaClient,
  creatorId: string,
  cycleId: string
): Promise<GoalCycleDetail> {
  return prisma.$transaction(async (tx) => {
    const row = await findGoalCycleForCreator(tx, creatorId.trim(), cycleId.trim());
    if (!row) throw new GoalCycleNotFoundError();
    assertKnownEnums(row);
    const state = row.state as GoalCycleState;
    if (state === "completed") {
      return hydrateGoalCycleDetail(tx, row);
    }
    if (state !== "completion_suggested") {
      throw new GoalCycleContractError(
        "GOAL_CYCLE_INVALID_STATE",
        "Completion confirm requires completion_suggested.",
        [{ field: "state", issue: state }]
      );
    }
    assertTransition(state, "completed");
    const updated = await tx.creatorGoalCycle.update({
      where: { id: row.id },
      data: {
        state: "completed",
        phase: "completion",
        activeScope: null,
        completedAt: new Date(),
        version: row.version + 1
      }
    });
    await tx.creatorGoalCycleOutcome.upsert({
      where: { cycleId: row.id },
      create: {
        cycleId: row.id,
        targetJson: { goal_kind: row.goalKind },
        suggestedCompletion: true,
        confirmedAt: new Date(),
        confidence: "unknown"
      },
      update: {
        suggestedCompletion: true,
        confirmedAt: new Date()
      }
    });
    return hydrateGoalCycleDetail(tx, updated);
  });
}

/** Test helper — expose transition map without importing private table. */
export function canTransition(from: GoalCycleState, to: GoalCycleState): boolean {
  return (GOAL_CYCLE_TRANSITIONS[from] ?? []).includes(to);
}

export function isTerminalGoalCycleState(state: GoalCycleState): boolean {
  return TERMINAL_STATES.has(state);
}

export type { GoalCycleRow, GoalCycleSummary };
