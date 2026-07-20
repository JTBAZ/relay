import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  GOAL_CYCLE_TRANSITIONS,
  GoalCycleNotFoundError,
  canTransition,
  cancelGoalCycle,
  confirmGoalCycleCompletion,
  getActiveGoalCycle,
  getGoalCycle,
  isTerminalGoalCycleState,
  listGoalCycles,
  patchGoalCycleCheckpoint,
  startGoalCycle,
  suggestGoalCycleCompletion
} from "../../src/goal-cycle/goal-cycle-service.js";
import {
  getCoachPlanCreditStatus,
  releaseCoachPlanCreditReservation,
  reserveCoachPlanCreditForCycle,
  shouldReserveCoachPlanCredit
} from "../../src/usage/coach-plan-credit-service.js";

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

function makeRow(over: Partial<CycleRow> = {}): CycleRow {
  const now = new Date("2026-07-17T16:00:00.000Z");
  return {
    id: "cycle_1",
    creatorId: "creator_a",
    state: "draft",
    phase: "goal",
    goalKind: "engagement",
    breakMode: null,
    periodKey: "2026-07",
    timeZone: "America/New_York",
    contextJson: {},
    activeScope: "active",
    version: 1,
    startIdempotencyKey: null,
    reservationRef: null,
    approvedAt: null,
    materializedAt: null,
    completionSuggestedAt: null,
    completedAt: null,
    cancelledAt: null,
    cancelReason: null,
    createdAt: now,
    updatedAt: now,
    ...over
  };
}

function createPrismaMemory() {
  const cycles: CycleRow[] = [];
  const checkpoints = new Map<
    string,
    { cycleId: string; phase: string; stateJson: unknown; version: number; updatedAt: Date }
  >();
  const progress: Array<{
    id: string;
    cycleId: string;
    sequence: number;
    phase: string;
    messageCode: string;
    metadataJson: unknown;
    createdAt: Date;
  }> = [];
  const outcomes = new Map<string, Record<string, unknown>>();
  const revisions: unknown[] = [];
  let idSeq = 1;

  const api = {
    creatorGoalCycle: {
      findFirst: vi.fn(async (args: any) => {
        const where = args?.where ?? {};
        return (
          cycles.find((c) => {
            if (where.id && c.id !== where.id) return false;
            if (where.creatorId && c.creatorId !== where.creatorId) return false;
            if (where.activeScope !== undefined && c.activeScope !== where.activeScope) return false;
            if (
              where.startIdempotencyKey !== undefined &&
              c.startIdempotencyKey !== where.startIdempotencyKey
            ) {
              return false;
            }
            return true;
          }) ?? null
        );
      }),
      findMany: vi.fn(async (args: any) => {
        let rows = cycles.filter((c) => c.creatorId === args.where.creatorId);
        rows = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        if (args.cursor?.id) {
          const idx = rows.findIndex((r) => r.id === args.cursor.id);
          rows = idx >= 0 ? rows.slice(idx + (args.skip ?? 0)) : rows;
        }
        return rows.slice(0, args.take ?? 20);
      }),
      create: vi.fn(async (args: any) => {
        const data = args.data;
        const row = makeRow({
          id: `cycle_${idSeq++}`,
          creatorId: data.creatorId,
          state: data.state,
          phase: data.phase,
          goalKind: data.goalKind,
          breakMode: data.breakMode ?? null,
          periodKey: data.periodKey,
          timeZone: data.timeZone,
          contextJson: data.contextJson ?? {},
          activeScope: data.activeScope ?? "active",
          version: data.version ?? 1,
          startIdempotencyKey: data.startIdempotencyKey ?? null
        });
        if (cycles.some((c) => c.creatorId === row.creatorId && c.activeScope === "active")) {
          throw new Error("Unique constraint failed on active_scope");
        }
        cycles.push(row);
        if (data.checkpoint?.create) {
          checkpoints.set(row.id, {
            cycleId: row.id,
            phase: data.checkpoint.create.phase,
            stateJson: data.checkpoint.create.stateJson,
            version: data.checkpoint.create.version,
            updatedAt: new Date()
          });
        }
        if (data.outcome?.create) {
          outcomes.set(row.id, { ...data.outcome.create, cycleId: row.id });
        }
        return row;
      }),
      update: vi.fn(async (args: any) => {
        const idx = cycles.findIndex((c) => c.id === args.where.id);
        if (idx < 0) throw new Error("not found");
        const next = { ...cycles[idx], ...args.data, updatedAt: new Date() };
        cycles[idx] = next;
        return next;
      }),
      updateMany: vi.fn(async (args: any) => {
        const where = args.where ?? {};
        const matches = cycles.filter((c) => {
          if (where.id && c.id !== where.id) return false;
          if (where.creatorId && c.creatorId !== where.creatorId) return false;
          if (where.version !== undefined && c.version !== where.version) return false;
          return true;
        });
        for (const row of matches) {
          const idx = cycles.findIndex((c) => c.id === row.id);
          cycles[idx] = { ...cycles[idx], ...args.data, updatedAt: new Date() };
        }
        return { count: matches.length };
      }),
      findFirstOrThrow: vi.fn(async (args: any) => {
        const row = await api.creatorGoalCycle.findFirst(args);
        if (!row) throw new Error("not found");
        return row;
      })
    },
    creatorGoalCycleCheckpoint: {
      findUnique: vi.fn(async (args: any) => checkpoints.get(args.where.cycleId) ?? null),
      upsert: vi.fn(async (args: any) => {
        const existing = checkpoints.get(args.where.cycleId);
        const next = existing
          ? { ...existing, ...args.update, updatedAt: new Date() }
          : {
              cycleId: args.create.cycleId,
              phase: args.create.phase,
              stateJson: args.create.stateJson,
              version: args.create.version,
              updatedAt: new Date()
            };
        checkpoints.set(args.where.cycleId, next);
        return next;
      })
    },
    creatorGoalCycleProgress: {
      findMany: vi.fn(async (args: any) => {
        const rows = progress
          .filter((p) => p.cycleId === args.where.cycleId)
          .sort((a, b) => a.sequence - b.sequence);
        return rows;
      }),
      findFirst: vi.fn(async (args: any) => {
        const rows = progress
          .filter((p) => p.cycleId === args.where.cycleId)
          .sort((a, b) => b.sequence - a.sequence);
        return rows[0] ?? null;
      }),
      create: vi.fn(async (args: any) => {
        const row = {
          id: `prog_${idSeq++}`,
          ...args.data,
          createdAt: new Date()
        };
        progress.push(row);
        return row;
      })
    },
    creatorGoalCycleRevision: {
      findFirst: vi.fn(async () => null)
    },
    creatorGoalCycleMaterializationReceipt: {
      findFirst: vi.fn(async () => null)
    },
    creatorGoalCycleOutcome: {
      findUnique: vi.fn(async (args: any) => outcomes.get(args.where.cycleId) ?? null),
      upsert: vi.fn(async (args: any) => {
        const existing = outcomes.get(args.where.cycleId);
        const next = existing
          ? { ...existing, ...args.update }
          : { ...args.create };
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
      findMany: vi.fn(async () => [])
    },
    creatorGoalCycleSlot: {
      findMany: vi.fn(async () => [])
    },
    post: {
      count: vi.fn(async () => 0)
    },
    $transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => fn(api))
  };

  return { api: api as any, cycles, checkpoints, progress, outcomes, revisions };
}

/** Serializes $transaction like a single-connection DB so concurrent starts contend. */
function createPrismaMemorySerialized() {
  const mem = createPrismaMemory();
  let chain: Promise<unknown> = Promise.resolve();
  mem.api.$transaction = vi.fn(async (fn: (tx: any) => Promise<unknown>) => {
    const run = chain.then(() => fn(mem.api));
    chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  });
  return mem;
}

describe("Goal Cycle transition table", () => {
  const prevEnabled = process.env.RELAY_GOAL_CYCLE_ENABLED;
  beforeEach(() => {
    process.env.RELAY_GOAL_CYCLE_ENABLED = "1";
    vi.mocked(shouldReserveCoachPlanCredit).mockReturnValue(false);
    vi.mocked(reserveCoachPlanCreditForCycle).mockReset();
    vi.mocked(releaseCoachPlanCreditReservation).mockClear();
  });
  afterEach(() => {
    if (prevEnabled === undefined) delete process.env.RELAY_GOAL_CYCLE_ENABLED;
    else process.env.RELAY_GOAL_CYCLE_ENABLED = prevEnabled;
  });
  it("keeps terminal states closed and allows suggest → confirm", () => {
    expect(isTerminalGoalCycleState("completed")).toBe(true);
    expect(isTerminalGoalCycleState("cancelled")).toBe(true);
    expect(canTransition("active", "completion_suggested")).toBe(true);
    expect(canTransition("completion_suggested", "completed")).toBe(true);
    expect(canTransition("completed", "draft")).toBe(false);
    expect(GOAL_CYCLE_TRANSITIONS.draft).toContain("cancelled");
  });
});

describe("startGoalCycle", () => {
  beforeEach(() => {
    process.env.RELAY_GOAL_CYCLE_ENABLED = "1";
    vi.mocked(shouldReserveCoachPlanCredit).mockReturnValue(false);
  });

  it("creates a draft active cycle and rejects a second active start", async () => {
    const { api } = createPrismaMemory();
    const first = await startGoalCycle(api, "creator_a", {
      goal_kind: "engagement",
      time_zone: "America/New_York",
      context: { topic: "sketches" },
      now: new Date("2026-07-17T16:00:00.000Z")
    });
    expect(first.state).toBe("draft");
    expect(first.phase).toBe("goal");
    expect(first.period_key).toBe("2026-07");
    expect(first.time_zone).toBe("America/New_York");

    await expect(
      startGoalCycle(api, "creator_a", { goal_kind: "views" })
    ).rejects.toMatchObject({
      name: "GoalCycleContractError",
      code: "GOAL_CYCLE_ACTIVE_EXISTS"
    });
  });

  it("returns the same cycle on identical idempotency key", async () => {
    const { api } = createPrismaMemory();
    const a = await startGoalCycle(api, "creator_a", {
      goal_kind: "engagement",
      idempotency_key: "start-1"
    });
    const b = await startGoalCycle(api, "creator_a", {
      goal_kind: "engagement",
      idempotency_key: "start-1"
    });
    expect(b.cycle_id).toBe(a.cycle_id);
  });

  it("requires break_mode for break goals", async () => {
    const { api } = createPrismaMemory();
    await expect(startGoalCycle(api, "creator_a", { goal_kind: "break" })).rejects.toBeInstanceOf(
      GoalCycleContractError
    );
    const silence = await startGoalCycle(api, "creator_a", {
      goal_kind: "break",
      break_mode: "complete_silence"
    });
    expect(silence.break_mode).toBe("complete_silence");
    expect(reserveCoachPlanCreditForCycle).not.toHaveBeenCalled();
  });

  it("reserves a credit for paid starts and persists reservation_ref", async () => {
    const { api } = createPrismaMemory();
    vi.mocked(shouldReserveCoachPlanCredit).mockReturnValue(true);
    vi.mocked(getCoachPlanCreditStatus).mockResolvedValue({
      enabled: true,
      available: 0,
      reserved: 1,
      included_per_period: null,
      period_started_at: null,
      period_ends_at: null,
      next_grant_at: null,
      topups_available: false
    });
    vi.mocked(reserveCoachPlanCreditForCycle).mockResolvedValue({
      status: {
        enabled: true,
        available: 0,
        reserved: 1,
        included_per_period: null,
        period_started_at: null,
        period_ends_at: null,
        next_grant_at: null,
        topups_available: false
      },
      reservation: {
        reservation_key: "cpc_res_cycle_1",
        cycle_id: "cycle_1",
        status: "reserved",
        amount: 1,
        reserved_at: "2026-07-17T16:00:00.000Z",
        settled_at: null,
        expires_at: "2026-07-24T16:00:00.000Z",
        version: 1
      },
      idempotent: false
    });
    const started = await startGoalCycle(api, "creator_a", { goal_kind: "engagement" });
    expect(reserveCoachPlanCreditForCycle).toHaveBeenCalled();
    expect(started.credit?.reserved).toBe(1);
  });

  it("rejects disabled starts", async () => {
    delete process.env.RELAY_GOAL_CYCLE_ENABLED;
    const { api } = createPrismaMemory();
    await expect(startGoalCycle(api, "creator_a", { goal_kind: "engagement" })).rejects.toMatchObject(
      { code: "GOAL_CYCLE_INVALID_STATE" }
    );
  });
});

describe("checkpoint / cancel / completion", () => {
  beforeEach(() => {
    process.env.RELAY_GOAL_CYCLE_ENABLED = "1";
    vi.mocked(shouldReserveCoachPlanCredit).mockReturnValue(false);
  });

  it("patches with version concurrency and appends progress", async () => {
    const { api } = createPrismaMemory();
    const started = await startGoalCycle(api, "creator_a", { goal_kind: "engagement" });
    const patched = await patchGoalCycleCheckpoint(api, "creator_a", started.cycle_id, {
      expected_version: 1,
      phase: "context",
      state: "researching",
      context: { note: "hello" },
      progress_message_code: "history_loaded"
    });
    expect(patched.version).toBe(2);
    expect(patched.state).toBe("researching");
    expect(patched.phase).toBe("context");
    expect(patched.progress[0]?.message_code).toBe("history_loaded");

    await expect(
      patchGoalCycleCheckpoint(api, "creator_a", started.cycle_id, {
        expected_version: 1,
        phase: "research"
      })
    ).rejects.toMatchObject({ code: "GOAL_CYCLE_VERSION_CONFLICT" });
  });

  it("cancels and clears active scope so a later cycle can start", async () => {
    const { api, cycles } = createPrismaMemory();
    const started = await startGoalCycle(api, "creator_a", { goal_kind: "engagement" });
    const cancelled = await cancelGoalCycle(api, "creator_a", started.cycle_id, "changed mind");
    expect(cancelled.state).toBe("cancelled");
    expect(cycles[0].activeScope).toBeNull();

    const next = await startGoalCycle(api, "creator_a", {
      goal_kind: "views",
      now: new Date("2026-07-20T12:00:00.000Z")
    });
    expect(next.cycle_id).not.toBe(started.cycle_id);
  });

  it("suggests then confirms completion and frees active scope", async () => {
    const { api, cycles } = createPrismaMemory();
    const started = await startGoalCycle(api, "creator_a", { goal_kind: "engagement" });
    // Force to active for suggestion path
    cycles[0].state = "active";
    cycles[0].phase = "active";
    cycles[0].version = 3;

    const suggested = await suggestGoalCycleCompletion(api, "creator_a", started.cycle_id, {
      force: true
    });
    expect(suggested.state).toBe("completion_suggested");
    expect(suggested.outcome).not.toBeNull();
    const confirmed = await confirmGoalCycleCompletion(api, "creator_a", started.cycle_id);
    expect(confirmed.state).toBe("completed");
    expect(cycles[0].activeScope).toBeNull();

    const again = await startGoalCycle(api, "creator_a", { goal_kind: "engagement" });
    expect(again.state).toBe("draft");
  });

  it("hydrates get/list and 404s cross-creator ids", async () => {
    const { api } = createPrismaMemory();
    const started = await startGoalCycle(api, "creator_a", { goal_kind: "engagement" });
    const active = await getActiveGoalCycle(api, "creator_a");
    expect(active?.cycle_id).toBe(started.cycle_id);
    const listed = await listGoalCycles(api, "creator_a", { limit: 10 });
    expect(listed.items).toHaveLength(1);
    await expect(getGoalCycle(api, "creator_b", started.cycle_id)).rejects.toBeInstanceOf(
      GoalCycleNotFoundError
    );
  });

  it("rejects illegal transitions", async () => {
    const { api } = createPrismaMemory();
    const started = await startGoalCycle(api, "creator_a", { goal_kind: "engagement" });
    await expect(
      patchGoalCycleCheckpoint(api, "creator_a", started.cycle_id, {
        expected_version: 1,
        state: "completed"
      })
    ).rejects.toMatchObject({ code: "GOAL_CYCLE_INVALID_STATE" });
  });
});

describe("Goal Cycle concurrency (in-memory serialization)", () => {
  beforeEach(() => {
    process.env.RELAY_GOAL_CYCLE_ENABLED = "1";
    vi.mocked(shouldReserveCoachPlanCredit).mockReturnValue(false);
  });

  it("parallel starts leave exactly one active cycle", async () => {
    const { api, cycles } = createPrismaMemorySerialized();
    const settled = await Promise.allSettled([
      startGoalCycle(api, "creator_a", { goal_kind: "engagement" }),
      startGoalCycle(api, "creator_a", { goal_kind: "views" }),
      startGoalCycle(api, "creator_a", { goal_kind: "paid_support" })
    ]);
    const ok = settled.filter((r) => r.status === "fulfilled");
    const bad = settled.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(bad).toHaveLength(2);
    expect(cycles.filter((c) => c.activeScope === "active")).toHaveLength(1);
    for (const r of bad) {
      if (r.status === "rejected") {
        expect(r.reason).toMatchObject({ code: "GOAL_CYCLE_ACTIVE_EXISTS" });
      }
    }
  });

  it("parallel checkpoint patches with same expected_version yield one winner", async () => {
    const { api } = createPrismaMemorySerialized();
    const started = await startGoalCycle(api, "creator_a", { goal_kind: "engagement" });
    const settled = await Promise.allSettled([
      patchGoalCycleCheckpoint(api, "creator_a", started.cycle_id, {
        expected_version: 1,
        phase: "context",
        state: "researching",
        context: { lane: "a" }
      }),
      patchGoalCycleCheckpoint(api, "creator_a", started.cycle_id, {
        expected_version: 1,
        phase: "research",
        state: "researching",
        context: { lane: "b" }
      })
    ]);
    expect(settled.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((r) => r.status === "rejected")).toHaveLength(1);
    const detail = await getGoalCycle(api, "creator_a", started.cycle_id);
    expect(detail.version).toBe(2);
  });
});
