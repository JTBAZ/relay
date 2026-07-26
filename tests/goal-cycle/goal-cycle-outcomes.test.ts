import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/usage/coach-plan-credit-service.js", () => ({
  shouldReserveCoachPlanCredit: vi.fn(() => false),
  reserveCoachPlanCreditForCycle: vi.fn(),
  releaseCoachPlanCreditReservation: vi.fn(async () => ({
    status: {
      enabled: true,
      available: 1,
      reserved: 0,
      included_per_period: null,
      period_started_at: null,
      period_ends_at: null,
      next_grant_at: null,
      topups_available: false
    },
    reservation: null,
    idempotent: true
  })),
  getCoachPlanCreditStatus: vi.fn(async () => ({
    enabled: true,
    available: 1,
    reserved: 0,
    included_per_period: null,
    period_started_at: null,
    period_ends_at: null,
    next_grant_at: null,
    topups_available: false
  })),
  CoachPlanCreditError: class CoachPlanCreditError extends Error {
    public constructor(
      public code: string,
      message: string,
      public details: Array<{ field: string; issue: string }> = []
    ) {
      super(message);
      this.name = "CoachPlanCreditError";
    }
  }
}));

import { GoalCycleContractError } from "../../src/goal-cycle/contracts.js";
import {
  assertCanSuggestCompletion,
  evaluateCompletionEligibility,
  outcomeSummaryFromSnapshot,
  refreshGoalCycleOutcomeSnapshot,
  type GoalCycleOutcomeSnapshot
} from "../../src/goal-cycle/outcomes/goal-cycle-outcome-service.js";
import {
  cancelGoalCycle,
  confirmGoalCycleCompletion,
  dismissGoalCycleCompletionSuggestion,
  startGoalCycle,
  suggestGoalCycleCompletion
} from "../../src/goal-cycle/goal-cycle-service.js";

const FIXED_NOW = new Date("2026-07-17T16:00:00.000Z");

function baseSnapshot(
  over: Partial<GoalCycleOutcomeSnapshot> & {
    goal_kind: GoalCycleOutcomeSnapshot["goal_kind"];
  }
): Omit<GoalCycleOutcomeSnapshot, "completion"> {
  return {
    snapshot_version: 1,
    cycle_id: "cycle_x",
    break_mode: null,
    window: { label: "2026-07", started_at: null, ends_at: null },
    target: { label: "Target", value: 100, unit: "units" },
    actual: {
      deterministic_label: null,
      deterministic_value: null,
      estimated_label: null,
      estimated_value: null
    },
    baseline: {},
    coverage: "partial",
    freshness_seconds: 0,
    confidence: "medium",
    stale: false,
    stale_after_seconds: 48 * 3600,
    task_completion: {
      required: 0,
      done: 0,
      skipped: 0,
      pending: 0,
      all_terminal: true,
      any_publish_done: false
    },
    publish_completion: { planned: 0, published: 0 },
    source_links: [],
    calculated_at: "2026-07-17T16:00:00.000Z",
    ...over
  };
}

describe("evaluateCompletionEligibility", () => {
  it("completes engagement/views when deterministic target met and not stale", () => {
    const snap = baseSnapshot({
      goal_kind: "engagement",
      actual: {
        deterministic_label: "120",
        deterministic_value: 120,
        estimated_label: null,
        estimated_value: null
      }
    });
    expect(evaluateCompletionEligibility(snap, { planEnded: false })).toEqual({
      eligible: true,
      kind: "complete",
      reason: expect.stringContaining("met")
    });
  });

  it("blocks stale engagement metrics from auto-complete", () => {
    const snap = baseSnapshot({
      goal_kind: "views",
      stale: true,
      actual: {
        deterministic_label: "2000",
        deterministic_value: 2000,
        estimated_label: null,
        estimated_value: null
      },
      target: { label: "Views", value: 1000, unit: "views" }
    });
    const result = evaluateCompletionEligibility(snap, { planEnded: false });
    expect(result.kind).toBe("review");
    expect(result.eligible).toBe(false);
  });

  it("suggests review when plan ended without meeting metric", () => {
    const snap = baseSnapshot({
      goal_kind: "engagement",
      actual: {
        deterministic_label: "10",
        deterministic_value: 10,
        estimated_label: null,
        estimated_value: null
      }
    });
    expect(evaluateCompletionEligibility(snap, { planEnded: true }).kind).toBe("review");
  });

  it("paid support: estimated alone is review, never complete", () => {
    const snap = baseSnapshot({
      goal_kind: "paid_support",
      actual: {
        deterministic_label: null,
        deterministic_value: null,
        estimated_label: "lift 3",
        estimated_value: 3
      },
      target: { label: "Paid", value: 2, unit: "events" }
    });
    const result = evaluateCompletionEligibility(snap, { planEnded: false });
    expect(result).toMatchObject({ eligible: true, kind: "review" });
    expect(result.reason).toMatch(/Estimated/i);
  });

  it("paid support: deterministic target met is complete", () => {
    const snap = baseSnapshot({
      goal_kind: "paid_support",
      coverage: "complete",
      actual: {
        deterministic_label: "3 events",
        deterministic_value: 3,
        estimated_label: null,
        estimated_value: null
      },
      target: { label: "Paid", value: 2, unit: "events" }
    });
    expect(evaluateCompletionEligibility(snap, { planEnded: false }).kind).toBe("complete");
  });

  it("complete silence completes after ends_at", () => {
    const snap = baseSnapshot({
      goal_kind: "break",
      break_mode: "complete_silence",
      window: {
        label: "silence",
        started_at: "2026-07-01T00:00:00.000Z",
        ends_at: "2026-07-10T00:00:00.000Z"
      },
      target: { label: "Silence", value: 1, unit: "interval" }
    });
    expect(
      evaluateCompletionEligibility(snap, {
        planEnded: false,
        now: new Date("2026-07-11T00:00:00.000Z")
      }).kind
    ).toBe("complete");
    expect(
      evaluateCompletionEligibility(snap, {
        planEnded: false,
        now: new Date("2026-07-05T00:00:00.000Z")
      }).kind
    ).toBe("none");
  });

  it("social upkeep completes when all tasks terminal including zero-task", () => {
    const zero = baseSnapshot({
      goal_kind: "break",
      break_mode: "social_upkeep",
      task_completion: {
        required: 0,
        done: 0,
        skipped: 0,
        pending: 0,
        all_terminal: true,
        any_publish_done: false
      }
    });
    expect(evaluateCompletionEligibility(zero, { planEnded: false }).kind).toBe("complete");

    const pending = baseSnapshot({
      goal_kind: "break",
      break_mode: "social_upkeep",
      task_completion: {
        required: 2,
        done: 1,
        skipped: 0,
        pending: 1,
        all_terminal: false,
        any_publish_done: false
      }
    });
    expect(evaluateCompletionEligibility(pending, { planEnded: false }).kind).toBe("none");
    expect(evaluateCompletionEligibility(pending, { planEnded: true }).kind).toBe("review");
  });

  it("active rest requires one publish done and all terminal", () => {
    const ok = baseSnapshot({
      goal_kind: "break",
      break_mode: "active_rest",
      task_completion: {
        required: 2,
        done: 1,
        skipped: 1,
        pending: 0,
        all_terminal: true,
        any_publish_done: true
      }
    });
    expect(evaluateCompletionEligibility(ok, { planEnded: false }).kind).toBe("complete");

    const noPublish = baseSnapshot({
      goal_kind: "break",
      break_mode: "active_rest",
      task_completion: {
        required: 2,
        done: 0,
        skipped: 2,
        pending: 0,
        all_terminal: true,
        any_publish_done: false
      }
    });
    expect(evaluateCompletionEligibility(noPublish, { planEnded: false }).kind).toBe("none");
  });
});

describe("assertCanSuggestCompletion", () => {
  it("allows complete, review only with allowReview, and force", () => {
    const complete = {
      ...baseSnapshot({ goal_kind: "engagement" }),
      completion: { eligible: true, kind: "complete" as const, reason: "met" }
    };
    expect(() => assertCanSuggestCompletion(complete)).not.toThrow();

    const review = {
      ...baseSnapshot({ goal_kind: "engagement" }),
      completion: { eligible: true, kind: "review" as const, reason: "ended" }
    };
    expect(() => assertCanSuggestCompletion(review)).toThrow(GoalCycleContractError);
    expect(() => assertCanSuggestCompletion(review, { allowReview: true })).not.toThrow();

    const none = {
      ...baseSnapshot({ goal_kind: "engagement" }),
      completion: { eligible: false, kind: "none" as const, reason: "not yet" }
    };
    expect(() => assertCanSuggestCompletion(none, { force: true })).not.toThrow();
  });

  it("labels paid-support attribution on summary", () => {
    const snap: GoalCycleOutcomeSnapshot = {
      ...baseSnapshot({
        goal_kind: "paid_support",
        actual: {
          deterministic_label: null,
          deterministic_value: null,
          estimated_label: "lift",
          estimated_value: 2
        }
      }),
      completion: { eligible: true, kind: "review", reason: "estimated" }
    };
    expect(outcomeSummaryFromSnapshot(snap).attribution).toBe("estimated");
  });
});

type CycleRow = {
  id: string;
  creatorId: string;
  state: string;
  phase: string;
  goalKind: string;
  breakMode: string | null;
  periodKey: string;
  timeZone: string;
  contextJson: Record<string, unknown>;
  activeScope: string | null;
  version: number;
  startIdempotencyKey: string | null;
  reservationRef: string | null;
  approvedAt: Date | null;
  materializedAt: Date | null;
  completionSuggestedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function createOutcomePrisma(tasks: Array<{ status: string; action: string }> = []) {
  const cycles: CycleRow[] = [];
  const outcomes = new Map<string, Record<string, unknown>>();
  const checkpoints = new Map<string, unknown>();
  const progress: unknown[] = [];
  let idSeq = 1;
  const now = new Date("2026-07-17T16:00:00.000Z");

  const api: any = {
    creatorGoalCycle: {
      findFirst: vi.fn(async (args: any) => {
        const where = args?.where ?? {};
        return (
          cycles.find((c) => {
            if (where.id && c.id !== where.id) return false;
            if (where.creatorId && c.creatorId !== where.creatorId) return false;
            if (where.activeScope !== undefined && c.activeScope !== where.activeScope) {
              return false;
            }
            return true;
          }) ?? null
        );
      }),
      create: vi.fn(async (args: any) => {
        const row: CycleRow = {
          id: `cycle_${idSeq++}`,
          creatorId: args.data.creatorId,
          state: args.data.state,
          phase: args.data.phase,
          goalKind: args.data.goalKind,
          breakMode: args.data.breakMode ?? null,
          periodKey: args.data.periodKey,
          timeZone: args.data.timeZone,
          contextJson: args.data.contextJson ?? {},
          activeScope: args.data.activeScope ?? "active",
          version: args.data.version ?? 1,
          startIdempotencyKey: args.data.startIdempotencyKey ?? null,
          reservationRef: args.data.reservationRef ?? null,
          approvedAt: null,
          materializedAt: null,
          completionSuggestedAt: null,
          completedAt: null,
          cancelledAt: null,
          cancelReason: null,
          createdAt: now,
          updatedAt: now
        };
        cycles.push(row);
        return row;
      }),
      update: vi.fn(async (args: any) => {
        const idx = cycles.findIndex((c) => c.id === args.where.id);
        const next = { ...cycles[idx], ...args.data, updatedAt: new Date() };
        cycles[idx] = next;
        return next;
      }),
      updateMany: vi.fn(async () => ({ count: 0 })),
      findFirstOrThrow: vi.fn(async (args: any) => {
        const row = await api.creatorGoalCycle.findFirst(args);
        if (!row) throw new Error("not found");
        return row;
      })
    },
    creatorGoalCycleCheckpoint: {
      findUnique: vi.fn(async (args: any) => checkpoints.get(args.where.cycleId) ?? null),
      upsert: vi.fn(async (args: any) => {
        const next = {
          cycleId: args.create?.cycleId ?? args.where.cycleId,
          phase: args.create?.phase ?? args.update?.phase,
          stateJson: args.create?.stateJson ?? args.update?.stateJson,
          version: args.create?.version ?? args.update?.version ?? 1,
          updatedAt: new Date()
        };
        checkpoints.set(next.cycleId, next);
        return next;
      })
    },
    creatorGoalCycleProgress: {
      findMany: vi.fn(async () => progress),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async (args: any) => {
        const row = { id: `prog_${idSeq++}`, ...args.data, createdAt: new Date() };
        progress.push(row);
        return row;
      })
    },
    creatorGoalCycleRevision: { findFirst: vi.fn(async () => null) },
    creatorGoalCycleMaterializationReceipt: { findFirst: vi.fn(async () => null) },
    creatorGoalCycleOutcome: {
      findUnique: vi.fn(async (args: any) => outcomes.get(args.where.cycleId) ?? null),
      upsert: vi.fn(async (args: any) => {
        const existing = outcomes.get(args.where.cycleId);
        const next = existing ? { ...existing, ...args.update } : { ...args.create };
        outcomes.set(args.where.cycleId, next);
        return next;
      }),
      updateMany: vi.fn(async (args: any) => {
        const existing = outcomes.get(args.where.cycleId);
        if (!existing) return { count: 0 };
        outcomes.set(args.where.cycleId, { ...existing, ...args.data });
        return { count: 1 };
      })
    },
    postbotTask: {
      findMany: vi.fn(async () => tasks)
    },
    creatorGoalCycleSlot: {
      findMany: vi.fn(async () => [])
    },
    post: { count: vi.fn(async () => 0) },
    $transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => fn(api))
  };

  return { api, cycles, outcomes };
}

describe("refresh + suggest/confirm/dismiss (VS9-T01/T02)", () => {
  beforeEach(() => {
    process.env.RELAY_GOAL_CYCLE_ENABLED = "1";
  });

  it("refreshes snapshot and gates suggest until target met", async () => {
    const { api, cycles } = createOutcomePrisma();
    const started = await startGoalCycle(api, "creator_a", {
      goal_kind: "engagement",
      context: { target_value: 100, actual_engagement: 40 },
      now: FIXED_NOW
    });
    cycles[0].state = "active";
    cycles[0].phase = "active";

    const snap = await refreshGoalCycleOutcomeSnapshot(api, "creator_a", started.cycle_id);
    expect(snap.completion.kind).toBe("none");
    expect(snap.actual.deterministic_value).toBe(40);

    await expect(
      suggestGoalCycleCompletion(api, "creator_a", started.cycle_id)
    ).rejects.toMatchObject({ code: "GOAL_CYCLE_INVALID_STATE" });

    cycles[0].contextJson = { target_value: 100, actual_engagement: 120 };
    const suggested = await suggestGoalCycleCompletion(api, "creator_a", started.cycle_id);
    expect(suggested.state).toBe("completion_suggested");
    expect(suggested.outcome?.confidence).toBe("medium");

    const dismissed = await dismissGoalCycleCompletionSuggestion(
      api,
      "creator_a",
      started.cycle_id
    );
    expect(dismissed.state).toBe("active");

    const suggestedAgain = await suggestGoalCycleCompletion(api, "creator_a", started.cycle_id);
    const confirmed = await confirmGoalCycleCompletion(api, "creator_a", suggestedAgain.cycle_id);
    expect(confirmed.state).toBe("completed");
  });

  it("allowReview suggests review when plan ended short of target", async () => {
    const { api, cycles } = createOutcomePrisma();
    const started = await startGoalCycle(api, "creator_a", {
      goal_kind: "views",
      context: {
        target_value: 1000,
        actual_views: 200,
        plan_ends_at: "2026-07-01T00:00:00.000Z",
        metric_freshness_seconds: 60
      },
      now: FIXED_NOW
    });
    cycles[0].state = "active";
    cycles[0].phase = "active";

    await expect(
      suggestGoalCycleCompletion(api, "creator_a", started.cycle_id)
    ).rejects.toMatchObject({ code: "GOAL_CYCLE_INVALID_STATE" });

    const suggested = await suggestGoalCycleCompletion(api, "creator_a", started.cycle_id, {
      allowReview: true,
      now: FIXED_NOW
    });
    expect(suggested.state).toBe("completion_suggested");
  });

  it("silence break becomes eligible after interval", async () => {
    const { api, cycles } = createOutcomePrisma();
    const started = await startGoalCycle(api, "creator_a", {
      goal_kind: "break",
      break_mode: "complete_silence",
      context: {
        silence_started_at: "2026-07-01T00:00:00.000Z",
        silence_days: 7
      },
      now: new Date("2026-07-01T12:00:00.000Z")
    });
    cycles[0].state = "active";
    cycles[0].phase = "active";

    await expect(
      suggestGoalCycleCompletion(api, "creator_a", started.cycle_id, {
        now: new Date("2026-07-03T00:00:00.000Z")
      })
    ).rejects.toMatchObject({ code: "GOAL_CYCLE_INVALID_STATE" });

    const suggested = await suggestGoalCycleCompletion(api, "creator_a", started.cycle_id, {
      now: new Date("2026-07-10T00:00:00.000Z")
    });
    expect(suggested.state).toBe("completion_suggested");
  });

  it("cancel from completion_suggested does not auto-complete", async () => {
    const { api, cycles } = createOutcomePrisma();
    const started = await startGoalCycle(api, "creator_a", {
      goal_kind: "engagement",
      context: { target_value: 10, actual_engagement: 50 },
      now: FIXED_NOW
    });
    cycles[0].state = "active";
    cycles[0].phase = "active";
    await suggestGoalCycleCompletion(api, "creator_a", started.cycle_id);
    const cancelled = await cancelGoalCycle(api, "creator_a", started.cycle_id, "stop");
    expect(cancelled.state).toBe("cancelled");
  });
});
