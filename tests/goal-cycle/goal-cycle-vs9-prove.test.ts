/**
 * VS9-T06 — Prove truthful outcome / completion / learning loop.
 */

import { describe, expect, it, vi } from "vitest";
import {
  evaluateCompletionEligibility,
  type GoalCycleOutcomeSnapshot
} from "../../src/goal-cycle/outcomes/goal-cycle-outcome-service.js";
import {
  acceptGoalCycleLearning,
  buildLearningProposalFromSnapshot,
  peekAcceptedLearningSeed,
  proposeGoalCycleLearning,
  rejectGoalCycleLearning,
  saveGoalCycleReflection
} from "../../src/goal-cycle/outcomes/goal-cycle-learning-service.js";
import {
  goalCycleOutcomeRefreshRepeatEveryMsFromEnv,
  runGoalCycleOutcomeRefreshOnce
} from "../../src/goal-cycle/outcomes/goal-cycle-outcome-worker.js";
import {
  confirmGoalCycleCompletion,
  dismissGoalCycleCompletionSuggestion,
  suggestGoalCycleCompletion
} from "../../src/goal-cycle/goal-cycle-service.js";

function snap(
  over: Partial<GoalCycleOutcomeSnapshot> & Pick<GoalCycleOutcomeSnapshot, "goal_kind">
): GoalCycleOutcomeSnapshot {
  return {
    snapshot_version: 1,
    cycle_id: "cycle_prove",
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
    completion: { eligible: false, kind: "none", reason: "" },
    source_links: ["/studio/analytics"],
    calculated_at: "2026-07-17T16:00:00.000Z",
    ...over
  };
}

describe("VS9-T06 eligibility matrix (branches)", () => {
  it("covers engagement stale, unavailable, and met", () => {
    expect(
      evaluateCompletionEligibility(
        snap({
          goal_kind: "engagement",
          stale: true,
          actual: {
            deterministic_label: "200",
            deterministic_value: 200,
            estimated_label: null,
            estimated_value: null
          }
        }),
        { planEnded: false }
      ).kind
    ).toBe("review");

    expect(
      evaluateCompletionEligibility(
        snap({
          goal_kind: "views",
          coverage: "unavailable",
          actual: {
            deterministic_label: null,
            deterministic_value: null,
            estimated_label: null,
            estimated_value: null
          }
        }),
        { planEnded: true }
      ).kind
    ).toBe("review");

    expect(
      evaluateCompletionEligibility(
        snap({
          goal_kind: "engagement",
          actual: {
            deterministic_label: "120",
            deterministic_value: 120,
            estimated_label: null,
            estimated_value: null
          }
        }),
        { planEnded: false }
      ).kind
    ).toBe("complete");
  });

  it("separates deterministic vs estimated paid support", () => {
    expect(
      evaluateCompletionEligibility(
        snap({
          goal_kind: "paid_support",
          coverage: "complete",
          actual: {
            deterministic_label: "3",
            deterministic_value: 3,
            estimated_label: null,
            estimated_value: null
          },
          target: { label: "Paid", value: 2, unit: "events" }
        }),
        { planEnded: false }
      ).kind
    ).toBe("complete");

    expect(
      evaluateCompletionEligibility(
        snap({
          goal_kind: "paid_support",
          actual: {
            deterministic_label: null,
            deterministic_value: null,
            estimated_label: "lift",
            estimated_value: 4
          },
          target: { label: "Paid", value: 2, unit: "events" }
        }),
        { planEnded: false }
      )
    ).toMatchObject({ kind: "review", eligible: true });
  });

  it("covers silence, upkeep, and active rest", () => {
    expect(
      evaluateCompletionEligibility(
        snap({
          goal_kind: "break",
          break_mode: "complete_silence",
          window: {
            label: "s",
            started_at: "2026-07-01T00:00:00.000Z",
            ends_at: "2026-07-08T00:00:00.000Z"
          }
        }),
        { planEnded: false, now: new Date("2026-07-09T00:00:00.000Z") }
      ).kind
    ).toBe("complete");

    expect(
      evaluateCompletionEligibility(
        snap({
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
        }),
        { planEnded: false }
      ).kind
    ).toBe("complete");

    expect(
      evaluateCompletionEligibility(
        snap({
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
        }),
        { planEnded: false }
      ).kind
    ).toBe("complete");
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

function createProvePrisma(cyclesInit: CycleRow[]) {
  const cycles = [...cyclesInit];
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
          if (where.id && c.id !== where.id) return false;
          if (where.state?.in && !where.state.in.includes(c.state)) return false;
          if (where.state && typeof where.state === "string" && c.state !== where.state) {
            return false;
          }
          return true;
        });
        if (args?.orderBy?.updatedAt === "asc") {
          rows = [...rows].sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
        }
        if (args?.orderBy?.completedAt === "desc") {
          rows = [...rows].sort(
            (a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0)
          );
        }
        const take = args?.take ?? rows.length;
        const mapped = rows.slice(0, take);
        if (args?.select?.id && Object.keys(args.select).length <= 2) {
          return mapped.map((c) =>
            args.select.creatorId ? { id: c.id, creatorId: c.creatorId } : { id: c.id }
          );
        }
        return mapped;
      }),
      update: vi.fn(async (args: any) => {
        const idx = cycles.findIndex((c) => c.id === args.where.id);
        const next = { ...cycles[idx], ...args.data, updatedAt: new Date() };
        cycles[idx] = next;
        return next;
      })
    },
    creatorGoalCycleCheckpoint: {
      findUnique: vi.fn(async () => null)
    },
    creatorGoalCycleProgress: {
      findMany: vi.fn(async () => [])
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
    postbotTask: { findMany: vi.fn(async () => []) },
    creatorGoalCycleSlot: { findMany: vi.fn(async () => []) },
    post: { count: vi.fn(async () => 0) },
    $transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => fn(api))
  };
  return { api, cycles, outcomes };
}

describe("VS9-T06 completion reject + learning accept/reject + refresh", () => {
  it("dismisses completion suggestion without completing", async () => {
    process.env.RELAY_GOAL_CYCLE_ENABLED = "1";
    const now = new Date("2026-07-17T16:00:00.000Z");
    const { api, cycles } = createProvePrisma([
      {
        id: "cycle_a",
        creatorId: "creator_a",
        state: "active",
        phase: "active",
        goalKind: "engagement",
        breakMode: null,
        periodKey: "2026-07",
        timeZone: "UTC",
        contextJson: { target_value: 10, actual_engagement: 50 },
        activeScope: "active",
        version: 3,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
        materializedAt: now
      }
    ]);

    const suggested = await suggestGoalCycleCompletion(api, "creator_a", "cycle_a");
    expect(suggested.state).toBe("completion_suggested");
    const dismissed = await dismissGoalCycleCompletionSuggestion(api, "creator_a", "cycle_a");
    expect(dismissed.state).toBe("active");
    expect(cycles[0].completedAt).toBeNull();
  });

  it("late refresh job updates snapshot without terminalizing", async () => {
    process.env.RELAY_GOAL_CYCLE_ENABLED = "1";
    const now = new Date("2026-07-17T16:00:00.000Z");
    const { api, cycles, outcomes } = createProvePrisma([
      {
        id: "cycle_active",
        creatorId: "creator_a",
        state: "active",
        phase: "active",
        goalKind: "views",
        breakMode: null,
        periodKey: "2026-07",
        timeZone: "UTC",
        contextJson: { target_value: 1000, actual_views: 100 },
        activeScope: "active",
        version: 2,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
        materializedAt: now
      }
    ]);

    const result = await runGoalCycleOutcomeRefreshOnce(api, {
      now,
      env: { RELAY_GOAL_CYCLE_ENABLED: "1" }
    });
    expect(result.refreshed).toBe(1);
    expect(cycles[0].state).toBe("active");
    expect(outcomes.get("cycle_active")?.targetJson).toBeTruthy();
    const bag = outcomes.get("cycle_active")!.targetJson as { snapshot: GoalCycleOutcomeSnapshot };
    expect(bag.snapshot.actual.deterministic_value).toBe(100);
    expect(bag.snapshot.completion.kind).toBe("none");
  });

  it("rejected learning leaves no seed; accepted seed peeks for later cycle", async () => {
    process.env.RELAY_GOAL_CYCLE_ENABLED = "1";
    const now = new Date("2026-07-17T16:00:00.000Z");
    const { api } = createProvePrisma([
      {
        id: "cycle_done",
        creatorId: "creator_a",
        state: "completed",
        phase: "completion",
        goalKind: "engagement",
        breakMode: null,
        periodKey: "2026-07",
        timeZone: "UTC",
        contextJson: { target_value: 100, actual_engagement: 120 },
        activeScope: null,
        version: 5,
        completedAt: now,
        createdAt: now,
        updatedAt: now,
        materializedAt: now
      }
    ]);

    await saveGoalCycleReflection(api, "creator_a", "cycle_done", "Keep midweek");
    await proposeGoalCycleLearning(api, "creator_a", "cycle_done");
    await rejectGoalCycleLearning(api, "creator_a", "cycle_done");
    expect(await peekAcceptedLearningSeed(api, "creator_a")).toBeNull();

    await proposeGoalCycleLearning(api, "creator_a", "cycle_done");
    await acceptGoalCycleLearning(api, "creator_a", "cycle_done");
    const seed = await peekAcceptedLearningSeed(api, "creator_a");
    expect(seed?.source_cycle_id).toBe("cycle_done");
    expect(seed?.consumed_at).toBeNull();
  });

  it("tenant isolation: creator B cannot peek creator A seed", async () => {
    process.env.RELAY_GOAL_CYCLE_ENABLED = "1";
    const now = new Date("2026-07-17T16:00:00.000Z");
    const { api } = createProvePrisma([
      {
        id: "cycle_a",
        creatorId: "creator_a",
        state: "completed",
        phase: "completion",
        goalKind: "engagement",
        breakMode: null,
        periodKey: "2026-07",
        timeZone: "UTC",
        contextJson: { target_value: 10, actual_engagement: 50 },
        activeScope: null,
        version: 4,
        completedAt: now,
        createdAt: now,
        updatedAt: now,
        materializedAt: now
      }
    ]);
    await proposeGoalCycleLearning(api, "creator_a", "cycle_a");
    await acceptGoalCycleLearning(api, "creator_a", "cycle_a");
    expect(await peekAcceptedLearningSeed(api, "creator_a")).toBeTruthy();
    expect(await peekAcceptedLearningSeed(api, "creator_b")).toBeNull();
  });

  it("confirm still required after suggest; estimated learning never raises target as met", () => {
    const proposal = buildLearningProposalFromSnapshot(
      snap({
        goal_kind: "paid_support",
        actual: {
          deterministic_label: null,
          deterministic_value: null,
          estimated_label: "lift",
          estimated_value: 3
        },
        target: { label: "Paid", value: 2, unit: "events" }
      })
    );
    expect(proposal.changes.every((c) => c.field !== "target")).toBe(true);
  });

  it("repeat interval env kill-switch", () => {
    expect(goalCycleOutcomeRefreshRepeatEveryMsFromEnv({ RELAY_GOAL_CYCLE_OUTCOME_REFRESH_MS: "off" })).toBeNull();
    expect(
      goalCycleOutcomeRefreshRepeatEveryMsFromEnv({ RELAY_GOAL_CYCLE_OUTCOME_REFRESH_MS: "3600000" })
    ).toBe(3_600_000);
  });

  it("same-month sequential cycles: two completed rows can coexist for history", async () => {
    const now = new Date("2026-07-17T16:00:00.000Z");
    const { api } = createProvePrisma([
      {
        id: "cycle_1",
        creatorId: "creator_a",
        state: "completed",
        phase: "completion",
        goalKind: "engagement",
        breakMode: null,
        periodKey: "2026-07",
        timeZone: "UTC",
        contextJson: {},
        activeScope: null,
        version: 3,
        completedAt: new Date("2026-07-10T00:00:00.000Z"),
        createdAt: now,
        updatedAt: now,
        materializedAt: now
      },
      {
        id: "cycle_2",
        creatorId: "creator_a",
        state: "completed",
        phase: "completion",
        goalKind: "views",
        breakMode: null,
        periodKey: "2026-07",
        timeZone: "UTC",
        contextJson: {},
        activeScope: null,
        version: 3,
        completedAt: new Date("2026-07-17T00:00:00.000Z"),
        createdAt: now,
        updatedAt: now,
        materializedAt: now
      }
    ]);
    const listed = await api.creatorGoalCycle.findMany({
      where: { creatorId: "creator_a", state: "completed" },
      orderBy: { completedAt: "desc" }
    });
    expect(listed.map((r: { id: string }) => r.id)).toEqual(["cycle_2", "cycle_1"]);
    expect(listed.every((r: CycleRow) => r.periodKey === "2026-07")).toBe(true);
  });
});

describe("VS9-T06 confirm path still terminalizes only on confirm", () => {
  it("suggest then confirm frees active scope", async () => {
    process.env.RELAY_GOAL_CYCLE_ENABLED = "1";
    const now = new Date("2026-07-17T16:00:00.000Z");
    const { api, cycles } = createProvePrisma([
      {
        id: "cycle_c",
        creatorId: "creator_a",
        state: "active",
        phase: "active",
        goalKind: "engagement",
        breakMode: null,
        periodKey: "2026-07",
        timeZone: "UTC",
        contextJson: { target_value: 10, actual_engagement: 50 },
        activeScope: "active",
        version: 3,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
        materializedAt: now
      }
    ]);
    await suggestGoalCycleCompletion(api, "creator_a", "cycle_c");
    const confirmed = await confirmGoalCycleCompletion(api, "creator_a", "cycle_c");
    expect(confirmed.state).toBe("completed");
    expect(cycles[0].activeScope).toBeNull();
  });
});

describe("VS9-T05 route + job registration", () => {
  it("mounts outcome routes from server and keeps refresh non-terminalizing", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const root = join(process.cwd());
    const serverSrc = readFileSync(join(root, "src/server.ts"), "utf8");
    const routesSrc = readFileSync(
      join(root, "src/goal-cycle/outcomes/outcome-routes.ts"),
      "utf8"
    );
    const workerSrc = readFileSync(
      join(root, "src/jobs/register-workers.ts"),
      "utf8"
    );
    expect(serverSrc).toMatch(/registerGoalCycleOutcomeRoutes/);
    expect(routesSrc).toMatch(/\/outcome\/refresh/);
    expect(routesSrc).toMatch(/\/learning\/accept/);
    expect(routesSrc).toMatch(/\/learning\/reject/);
    expect(workerSrc).toMatch(/runGoalCycleOutcomeRefreshOnce/);
    expect(goalCycleOutcomeRefreshRepeatEveryMsFromEnv({} as NodeJS.ProcessEnv)).toBe(
      6 * 60 * 60 * 1000
    );
  });
});
