import { describe, expect, it, vi } from "vitest";
import { GoalCycleContractError } from "../../src/goal-cycle/contracts.js";
import {
  acceptGoalCycleLearning,
  buildLearningProposalFromSnapshot,
  consumeAcceptedLearningSeed,
  getGoalCycleLearningProposal,
  normalizeGoalCycleReflection,
  peekAcceptedLearningSeed,
  proposeGoalCycleLearning,
  rejectGoalCycleLearning,
  saveGoalCycleReflection
} from "../../src/goal-cycle/outcomes/goal-cycle-learning-service.js";
import type { GoalCycleOutcomeSnapshot } from "../../src/goal-cycle/outcomes/goal-cycle-outcome-service.js";

function snap(
  over: Partial<GoalCycleOutcomeSnapshot> & Pick<GoalCycleOutcomeSnapshot, "goal_kind">
): GoalCycleOutcomeSnapshot {
  return {
    snapshot_version: 1,
    cycle_id: "cycle_learn",
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
    completion: { eligible: true, kind: "complete", reason: "met" },
    source_links: ["/studio/analytics"],
    calculated_at: "2026-07-17T16:00:00.000Z",
    ...over
  };
}

describe("buildLearningProposalFromSnapshot", () => {
  it("suggests target raise when engagement met", () => {
    const proposal = buildLearningProposalFromSnapshot(
      snap({
        goal_kind: "engagement",
        actual: {
          deterministic_label: "120",
          deterministic_value: 120,
          estimated_label: null,
          estimated_value: null
        }
      }),
      { proposalId: "glp_test" }
    );
    expect(proposal.status).toBe("suggested");
    expect(proposal.changes.some((c) => c.field === "target")).toBe(true);
    expect(proposal.explanation).toMatch(/met/i);
    expect(proposal.evidence_refs).toContain("/studio/analytics");
  });

  it("never treats estimated paid support as met-target raise", () => {
    const proposal = buildLearningProposalFromSnapshot(
      snap({
        goal_kind: "paid_support",
        actual: {
          deterministic_label: null,
          deterministic_value: null,
          estimated_label: "lift 4",
          estimated_value: 4
        },
        target: { label: "Paid", value: 2, unit: "events" }
      })
    );
    expect(proposal.changes.every((c) => c.field !== "target")).toBe(true);
    expect(proposal.changes.some((c) => c.field === "destination_mix")).toBe(true);
    expect(proposal.explanation).toMatch(/estimated/i);
  });

  it("suggests gentle return after silence", () => {
    const proposal = buildLearningProposalFromSnapshot(
      snap({
        goal_kind: "break",
        break_mode: "complete_silence",
        target: { label: "Silence", value: 1, unit: "interval" }
      })
    );
    expect(proposal.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "goal", to: "engagement" }),
        expect.objectContaining({ field: "cadence", to: "gentle_return" })
      ])
    );
  });

  it("rejects invalid reflection length via normalize", () => {
    expect(normalizeGoalCycleReflection("  hi  ")).toBe("hi");
    expect(normalizeGoalCycleReflection("   ")).toBeNull();
    expect(() => normalizeGoalCycleReflection("x".repeat(2001))).toThrow(GoalCycleContractError);
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
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  materializedAt: Date | null;
};

function createLearningPrisma(initial?: Partial<CycleRow>) {
  const now = new Date("2026-07-17T16:00:00.000Z");
  const cycles: CycleRow[] = [
    {
      id: "cycle_learn",
      creatorId: "creator_a",
      state: "completed",
      phase: "completion",
      goalKind: "engagement",
      breakMode: null,
      periodKey: "2026-07",
      timeZone: "America/New_York",
      contextJson: { target_value: 100, actual_engagement: 120 },
      activeScope: null,
      version: 4,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
      materializedAt: now,
      ...initial
    }
  ];
  const outcomes = new Map<string, Record<string, unknown>>();

  const api: any = {
    creatorGoalCycle: {
      findFirst: vi.fn(async (args: any) => {
        const where = args?.where ?? {};
        return (
          cycles.find((c) => {
            if (where.id && c.id !== where.id) return false;
            if (where.creatorId && c.creatorId !== where.creatorId) return false;
            return true;
          }) ?? null
        );
      }),
      findMany: vi.fn(async (args: any) => {
        const where = args?.where ?? {};
        let rows = cycles.filter((c) => {
          if (where.creatorId && c.creatorId !== where.creatorId) return false;
          if (where.state && c.state !== where.state) return false;
          return true;
        });
        rows = [...rows].sort((a, b) => {
          const at = a.completedAt?.getTime() ?? 0;
          const bt = b.completedAt?.getTime() ?? 0;
          return bt - at;
        });
        const take = args?.take ?? rows.length;
        return rows.slice(0, take).map((c) => ({ id: c.id }));
      })
    },
    creatorGoalCycleOutcome: {
      findUnique: vi.fn(async (args: any) => outcomes.get(args.where.cycleId) ?? null),
      upsert: vi.fn(async (args: any) => {
        const existing = outcomes.get(args.where.cycleId);
        const next = existing ? { ...existing, ...args.update } : { ...args.create };
        outcomes.set(args.where.cycleId, next);
        return next;
      })
    },
    postbotTask: { findMany: vi.fn(async () => []) },
    creatorGoalCycleSlot: { findMany: vi.fn(async () => []) },
    post: { count: vi.fn(async () => 0) },
    $transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => fn(api))
  };

  return { api, cycles, outcomes };
}

describe("reflection + accept/reject learning (VS9-T03)", () => {
  it("saves reflection, proposes, accepts seed, reject leaves no seed", async () => {
    const { api, outcomes } = createLearningPrisma();

    const saved = await saveGoalCycleReflection(
      api,
      "creator_a",
      "cycle_learn",
      "  Liked the cadence  "
    );
    expect(saved.reflection).toBe("Liked the cadence");
    expect(outcomes.get("cycle_learn")?.reflection).toBe("Liked the cadence");

    const proposed = await proposeGoalCycleLearning(api, "creator_a", "cycle_learn", {
      now: new Date("2026-07-17T16:00:00.000Z")
    });
    expect(proposed.status).toBe("suggested");
    expect(proposed.changes.length).toBeGreaterThan(0);
    expect(proposed.explanation).toMatch(/reflection/i);

    const rejected = await rejectGoalCycleLearning(api, "creator_a", "cycle_learn");
    expect(rejected.status).toBe("rejected");
    expect(asBag(outcomes.get("cycle_learn")?.targetJson).seed).toBeNull();
    expect(await peekAcceptedLearningSeed(api, "creator_a")).toBeNull();

    // Re-propose after reject, then accept
    const again = await proposeGoalCycleLearning(api, "creator_a", "cycle_learn");
    expect(again.status).toBe("suggested");
    const accepted = await acceptGoalCycleLearning(api, "creator_a", "cycle_learn");
    expect(accepted.status).toBe("accepted");

    const seed = await peekAcceptedLearningSeed(api, "creator_a");
    expect(seed?.proposal_id).toBe(accepted.proposal_id);
    expect(seed?.consumed_at).toBeNull();

    const consumed = await consumeAcceptedLearningSeed(
      api,
      "creator_a",
      "cycle_learn",
      accepted.proposal_id
    );
    expect(consumed?.consumed_at).toBeTruthy();
    expect(await peekAcceptedLearningSeed(api, "creator_a")).toBeNull();
  });

  it("blocks learning while cycle is still active", async () => {
    const { api } = createLearningPrisma({ state: "active", phase: "active", completedAt: null });
    await expect(
      saveGoalCycleReflection(api, "creator_a", "cycle_learn", "too early")
    ).rejects.toMatchObject({ code: "GOAL_CYCLE_INVALID_STATE" });
  });

  it("accept/reject require suggested status", async () => {
    const { api } = createLearningPrisma();
    await expect(acceptGoalCycleLearning(api, "creator_a", "cycle_learn")).rejects.toMatchObject({
      code: "GOAL_CYCLE_INVALID_STATE"
    });
  });

  it("get returns persisted proposal", async () => {
    const { api } = createLearningPrisma();
    await proposeGoalCycleLearning(api, "creator_a", "cycle_learn");
    const got = await getGoalCycleLearningProposal(api, "creator_a", "cycle_learn");
    expect(got?.status).toBe("suggested");
    expect(got?.source_cycle_id).toBe("cycle_learn");
  });
});

function asBag(value: unknown): { seed?: unknown } {
  if (!value || typeof value !== "object") return {};
  return value as { seed?: unknown };
}
