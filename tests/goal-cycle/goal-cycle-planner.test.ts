/**
 * VS5-T03 — Initial planner flow (questions + generate) against in-memory Prisma.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/ai/ai-service.js", () => ({
  generateText: vi.fn()
}));

vi.mock("../../src/usage/coach-plan-credit-service.js", () => ({
  shouldReserveCoachPlanCredit: vi.fn((input: { goal_kind: string; break_mode?: string | null }) => {
    return !(input.goal_kind === "break" && input.break_mode === "complete_silence");
  }),
  reserveCoachPlanCreditForCycle: vi.fn(async () => ({
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
    reservation: { reservation_key: "cpc_res_test", status: "reserved" },
    idempotent: false
  })),
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

import { generateText } from "../../src/ai/ai-service.js";
import { DREAM_FLOW_FIXTURE } from "../../src/goal-cycle/fixtures/dream-flow.js";
import {
  answerPlannerQuestions,
  applyManualPlanEdit,
  buildDeterministicPlannerQuestions,
  generateInitialGoalCyclePlan,
  proposePlannerQuestions,
  reviseGoalCyclePlan,
  dreamFactPackForPlannerTests
} from "../../src/goal-cycle/planner/goal-cycle-planner-service.js";
import { GOAL_CYCLE_PLANNER_PROMPT_VERSION } from "../../src/goal-cycle/planner/planner-prompts.js";
import { validatePlannerPlan } from "../../src/goal-cycle/planner/plan-schema.js";
import { buildDeterministicPlanFallback } from "../../src/goal-cycle/planner/deterministic-plan-fallback.js";
import { buildGoalCycleFactPackFromDreamFixture } from "../../src/goal-cycle/planner/goal-cycle-fact-pack.js";
import { GoalCycleContractError, GOAL_CYCLE_MAX_QUESTIONS } from "../../src/goal-cycle/contracts.js";
import {
  CoachPlanCreditError,
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
    id: "cycle_plan_1",
    creatorId: "creator_planner",
    state: "draft",
    phase: "goal",
    goalKind: "engagement",
    breakMode: null,
    periodKey: "2026-07",
    timeZone: "America/New_York",
    contextJson: {
      topic: "character sketch warmups",
      linked_destinations: ["patreon", "x"],
      unlinked_destinations: ["deviantart"]
    },
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

function createPlannerPrisma(seed: CycleRow) {
  const cycles: CycleRow[] = [{ ...seed }];
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
  const revisions: Array<{
    id: string;
    cycleId: string;
    ordinal: number;
    kind: string;
    requestSummaryJson: unknown;
    responseSummaryJson: unknown;
    planJson: unknown;
  }> = [];
  let idSeq = 1;

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
      findFirstOrThrow: vi.fn(async (args: any) => {
        const row = await api.creatorGoalCycle.findFirst(args);
        if (!row) throw new Error("not found");
        return row;
      }),
      update: vi.fn(async (args: any) => {
        const idx = cycles.findIndex((c) => c.id === args.where.id);
        if (idx < 0) throw new Error("not found");
        cycles[idx] = { ...cycles[idx], ...args.data, updatedAt: new Date() };
        return cycles[idx];
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
      findMany: vi.fn(async (args: any) =>
        progress
          .filter((p) => p.cycleId === args.where.cycleId)
          .sort((a, b) => a.sequence - b.sequence)
      ),
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
      findFirst: vi.fn(async (args: any) => {
        const rows = revisions
          .filter((r) => r.cycleId === args.where.cycleId)
          .sort((a, b) => b.ordinal - a.ordinal);
        return rows[0] ?? null;
      }),
      findMany: vi.fn(async (args: any) => {
        let rows = revisions.filter((r) => r.cycleId === args.where.cycleId);
        if (args.where?.kind) {
          rows = rows.filter((r) => r.kind === args.where.kind);
        }
        return rows.sort((a, b) => a.ordinal - b.ordinal).slice(0, args.take ?? 100);
      }),
      create: vi.fn(async (args: any) => {
        const row = {
          id: `rev_${idSeq++}`,
          ...args.data
        };
        revisions.push(row);
        return row;
      })
    },
    creatorGoalCycleMaterializationReceipt: {
      findFirst: vi.fn(async () => null)
    },
    creatorGoalCycleOutcome: {
      upsert: vi.fn(async () => ({}))
    },
    $transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => fn(api))
  };

  return { api, cycles, progress, revisions };
}

describe("VS5-T03 planner initial flow", () => {
  const prevEnabled = process.env.RELAY_GOAL_CYCLE_ENABLED;
  const prevAi = process.env.RELAY_GOAL_CYCLE_AI_ENABLED;

  beforeEach(() => {
    process.env.RELAY_GOAL_CYCLE_ENABLED = "1";
    delete process.env.RELAY_GOAL_CYCLE_AI_ENABLED;
    vi.mocked(generateText).mockReset();
    vi.mocked(reserveCoachPlanCreditForCycle).mockClear();
  });

  afterEach(() => {
    if (prevEnabled === undefined) delete process.env.RELAY_GOAL_CYCLE_ENABLED;
    else process.env.RELAY_GOAL_CYCLE_ENABLED = prevEnabled;
    if (prevAi === undefined) delete process.env.RELAY_GOAL_CYCLE_AI_ENABLED;
    else process.env.RELAY_GOAL_CYCLE_AI_ENABLED = prevAi;
  });

  it("exports prompt version and builds at most two deterministic questions", () => {
    expect(GOAL_CYCLE_PLANNER_PROMPT_VERSION).toBe("goal-cycle-planner-prompt-v1");
    const qs = buildDeterministicPlannerQuestions(dreamFactPackForPlannerTests());
    expect(qs.length).toBeGreaterThan(0);
    expect(qs.length).toBeLessThanOrEqual(2);
  });

  it("complete silence: no credit, no AI, zero-slot fallback Plan", async () => {
    const { api, progress, revisions } = createPlannerPrisma(
      makeRow({
        id: "cycle_silence",
        goalKind: "break",
        breakMode: "complete_silence"
      })
    );

    const result = await generateInitialGoalCyclePlan(api, {
      creatorId: "creator_planner",
      cycleId: "cycle_silence",
      idempotencyKey: "silence_plan_1",
      expectedVersion: 1
    });

    expect(result.plan.slots).toHaveLength(0);
    expect(result.fallback).toBe(true);
    expect(result.ai_used).toBe(false);
    expect(result.cycle.state).toBe("review");
    expect(generateText).not.toHaveBeenCalled();
    expect(shouldReserveCoachPlanCredit({ goal_kind: "break", break_mode: "complete_silence" })).toBe(
      false
    );
    expect(reserveCoachPlanCreditForCycle).not.toHaveBeenCalled();
    expect(progress.some((p) => p.messageCode === "fallback_ready")).toBe(true);
    expect(revisions).toHaveLength(1);
    expect(revisions[0]?.kind).toBe("initial");
  });

  it("uses AI plan when valid JSON is returned", async () => {
    process.env.RELAY_GOAL_CYCLE_AI_ENABLED = "1";
    const pack = dreamFactPackForPlannerTests();
    vi.mocked(generateText).mockResolvedValue({
      ok: true,
      text: JSON.stringify({ plan: DREAM_FLOW_FIXTURE.sample_plan }),
      provider: "mock",
      model: "mock",
      tier: "cheap",
      usage: { input_tokens: 10, output_tokens: 20 }
    });

    const { api } = createPlannerPrisma(makeRow({ id: "cycle_ai" }));
    const result = await generateInitialGoalCyclePlan(api, {
      creatorId: "creator_planner",
      cycleId: "cycle_ai",
      idempotencyKey: "ai_plan_1",
      expectedVersion: 1,
      factPack: pack,
      skipQuestions: true
    });

    expect(result.ai_used).toBe(true);
    expect(result.fallback).toBe(false);
    expect(result.plan.slots.length).toBe(3);
    expect(vi.mocked(generateText).mock.calls[0]?.[0]?.metadata?.feature).toBe(
      "goal_cycle_planner"
    );
    expect(reserveCoachPlanCreditForCycle).toHaveBeenCalled();
  });

  it("falls back when AI returns malformed JSON", async () => {
    process.env.RELAY_GOAL_CYCLE_AI_ENABLED = "1";
    vi.mocked(generateText).mockResolvedValue({
      ok: true,
      text: "{not-json",
      provider: "mock",
      model: "mock",
      tier: "cheap"
    });

    const { api, progress } = createPlannerPrisma(makeRow({ id: "cycle_bad_ai" }));
    const result = await generateInitialGoalCyclePlan(api, {
      creatorId: "creator_planner",
      cycleId: "cycle_bad_ai",
      idempotencyKey: "bad_ai_1",
      expectedVersion: 1,
      factPack: dreamFactPackForPlannerTests(),
      skipQuestions: true
    });

    expect(result.fallback).toBe(true);
    expect(result.ai_used).toBe(false);
    expect(result.plan.slots.length).toBeGreaterThan(0);
    expect(progress.some((p) => p.messageCode === "fallback_ready")).toBe(true);
  });

  it("retries with the same idempotency key return the stored Plan", async () => {
    const { api, revisions } = createPlannerPrisma(makeRow({ id: "cycle_idem" }));
    const first = await generateInitialGoalCyclePlan(api, {
      creatorId: "creator_planner",
      cycleId: "cycle_idem",
      idempotencyKey: "idem_plan_key",
      expectedVersion: 1,
      factPack: dreamFactPackForPlannerTests(),
      skipQuestions: true,
      forceFallback: true
    });
    expect(first.idempotent).toBe(false);
    expect(revisions).toHaveLength(1);

    const second = await generateInitialGoalCyclePlan(api, {
      creatorId: "creator_planner",
      cycleId: "cycle_idem",
      idempotencyKey: "idem_plan_key",
      expectedVersion: first.cycle.version,
      factPack: dreamFactPackForPlannerTests(),
      skipQuestions: true,
      forceFallback: true
    });
    expect(second.idempotent).toBe(true);
    expect(second.plan).toEqual(first.plan);
    expect(revisions).toHaveLength(1);
  });

  it("proposes and answers at most two questions before generate", async () => {
    const { api, cycles } = createPlannerPrisma(makeRow({ id: "cycle_q" }));

    const proposed = await proposePlannerQuestions(api, {
      creatorId: "creator_planner",
      cycleId: "cycle_q",
      idempotencyKey: "q_round_1",
      expectedVersion: 1,
      factPack: dreamFactPackForPlannerTests(),
      deterministicOnly: true
    });
    expect(proposed.questions.length).toBeGreaterThan(0);
    expect(proposed.questions.length).toBeLessThanOrEqual(2);
    expect(proposed.cycle.state).toBe("questions");
    expect(proposed.questions.every((q) => q.answer == null)).toBe(true);

    const answers = proposed.questions.map((q) => ({
      id: q.id,
      answer: q.options[0]!
    }));
    const answered = await answerPlannerQuestions(api, {
      creatorId: "creator_planner",
      cycleId: "cycle_q",
      expectedVersion: proposed.cycle.version,
      answers
    });
    const stored = (answered.context.planner_questions as Array<{ answer: string | null }>) ?? [];
    expect(stored.every((q) => typeof q.answer === "string")).toBe(true);

    const plan = await generateInitialGoalCyclePlan(api, {
      creatorId: "creator_planner",
      cycleId: "cycle_q",
      idempotencyKey: "plan_after_q",
      expectedVersion: answered.version,
      factPack: dreamFactPackForPlannerTests(),
      forceFallback: true
    });
    expect(plan.cycle.state).toBe("review");
    expect(plan.plan.slots.length).toBeGreaterThan(0);
    expect(cycles[0]?.contextJson.planner_questions).toBeTruthy();
  });
});

describe("VS5-T04 planner revisions + manual edits", () => {
  const prevEnabled = process.env.RELAY_GOAL_CYCLE_ENABLED;
  const prevAi = process.env.RELAY_GOAL_CYCLE_AI_ENABLED;

  beforeEach(() => {
    process.env.RELAY_GOAL_CYCLE_ENABLED = "1";
    delete process.env.RELAY_GOAL_CYCLE_AI_ENABLED;
    vi.mocked(generateText).mockReset();
    vi.mocked(reserveCoachPlanCreditForCycle).mockClear();
  });

  afterEach(() => {
    if (prevEnabled === undefined) delete process.env.RELAY_GOAL_CYCLE_ENABLED;
    else process.env.RELAY_GOAL_CYCLE_ENABLED = prevEnabled;
    if (prevAi === undefined) delete process.env.RELAY_GOAL_CYCLE_AI_ENABLED;
    else process.env.RELAY_GOAL_CYCLE_AI_ENABLED = prevAi;
  });

  it("allows two AI revisions and rejects a third without charging", async () => {
    const { api, revisions } = createPlannerPrisma(makeRow({ id: "cycle_rev" }));
    const pack = dreamFactPackForPlannerTests();

    const initial = await generateInitialGoalCyclePlan(api, {
      creatorId: "creator_planner",
      cycleId: "cycle_rev",
      idempotencyKey: "rev_initial",
      expectedVersion: 1,
      factPack: pack,
      skipQuestions: true,
      forceFallback: true
    });

    const r1 = await reviseGoalCyclePlan(api, {
      creatorId: "creator_planner",
      cycleId: "cycle_rev",
      idempotencyKey: "rev_ai_1",
      expectedVersion: initial.cycle.version,
      revision_note: "Softer captions please.",
      factPack: pack,
      forceFallback: true
    });
    expect(r1.ai_revision_count).toBe(1);
    expect(r1.plan.ai_revision_count).toBe(1);
    expect(revisions.filter((r) => r.kind === "ai_revision")).toHaveLength(1);
    expect(reserveCoachPlanCreditForCycle).toHaveBeenCalledTimes(1); // initial only

    const r2 = await reviseGoalCyclePlan(api, {
      creatorId: "creator_planner",
      cycleId: "cycle_rev",
      idempotencyKey: "rev_ai_2",
      expectedVersion: r1.cycle.version,
      revision_note: "Swap the second slot to carousel.",
      factPack: pack,
      forceFallback: true
    });
    expect(r2.ai_revision_count).toBe(2);
    expect(revisions.filter((r) => r.kind === "ai_revision")).toHaveLength(2);

    await expect(
      reviseGoalCyclePlan(api, {
        creatorId: "creator_planner",
        cycleId: "cycle_rev",
        idempotencyKey: "rev_ai_3",
        expectedVersion: r2.cycle.version,
        revision_note: "One more change.",
        factPack: pack,
        forceFallback: true
      })
    ).rejects.toBeInstanceOf(GoalCycleContractError);

    expect(revisions.filter((r) => r.kind === "ai_revision")).toHaveLength(2);
    // Still only the initial generate reserved credit — third revise did not charge.
    expect(reserveCoachPlanCreditForCycle).toHaveBeenCalledTimes(1);
  });

  it("manual edits validate without consuming AI revision budget", async () => {
    const { api, revisions } = createPlannerPrisma(makeRow({ id: "cycle_manual" }));
    const pack = dreamFactPackForPlannerTests();

    const initial = await generateInitialGoalCyclePlan(api, {
      creatorId: "creator_planner",
      cycleId: "cycle_manual",
      idempotencyKey: "manual_initial",
      expectedVersion: 1,
      factPack: pack,
      skipQuestions: true,
      forceFallback: true
    });

    const revised = await reviseGoalCyclePlan(api, {
      creatorId: "creator_planner",
      cycleId: "cycle_manual",
      idempotencyKey: "manual_ai_1",
      expectedVersion: initial.cycle.version,
      revision_note: "Tighten titles.",
      factPack: pack,
      forceFallback: true
    });
    expect(revised.ai_revision_count).toBe(1);

    const editedPlan = {
      ...revised.plan,
      rationale: "Creator-edited rationale for the Plan.",
      slots: revised.plan.slots.map((s, i) =>
        i === 0 ? { ...s, title: "Edited warm-up sketch" } : s
      )
    };

    const manual = await applyManualPlanEdit(api, {
      creatorId: "creator_planner",
      cycleId: "cycle_manual",
      idempotencyKey: "manual_edit_1",
      expectedVersion: revised.cycle.version,
      plan: editedPlan,
      factPack: pack
    });

    expect(manual.plan.ai_revision_count).toBe(1);
    expect(manual.plan.slots[0]?.title).toBe("Edited warm-up sketch");
    expect(revisions.some((r) => r.kind === "manual_edit")).toBe(true);
    expect(revisions.filter((r) => r.kind === "ai_revision")).toHaveLength(1);

    // Second AI revision still allowed after manual edit.
    const r2 = await reviseGoalCyclePlan(api, {
      creatorId: "creator_planner",
      cycleId: "cycle_manual",
      idempotencyKey: "manual_ai_2",
      expectedVersion: manual.cycle.version,
      revision_note: "Final AI polish.",
      factPack: pack,
      forceFallback: true
    });
    expect(r2.ai_revision_count).toBe(2);
  });

  it("AI revision idempotent retry returns stored revision", async () => {
    const { api, revisions } = createPlannerPrisma(makeRow({ id: "cycle_rev_idem" }));
    const pack = dreamFactPackForPlannerTests();

    const initial = await generateInitialGoalCyclePlan(api, {
      creatorId: "creator_planner",
      cycleId: "cycle_rev_idem",
      idempotencyKey: "idem_rev_initial",
      expectedVersion: 1,
      factPack: pack,
      skipQuestions: true,
      forceFallback: true
    });

    const first = await reviseGoalCyclePlan(api, {
      creatorId: "creator_planner",
      cycleId: "cycle_rev_idem",
      idempotencyKey: "idem_rev_key",
      expectedVersion: initial.cycle.version,
      revision_note: "Warm tone.",
      factPack: pack,
      forceFallback: true
    });
    const second = await reviseGoalCyclePlan(api, {
      creatorId: "creator_planner",
      cycleId: "cycle_rev_idem",
      idempotencyKey: "idem_rev_key",
      expectedVersion: first.cycle.version,
      revision_note: "Warm tone.",
      factPack: pack,
      forceFallback: true
    });
    expect(second.idempotent).toBe(true);
    expect(second.plan).toEqual(first.plan);
    expect(revisions.filter((r) => r.kind === "ai_revision")).toHaveLength(1);
  });

  it("failed AI revision does not consume a revision round", async () => {
    process.env.RELAY_GOAL_CYCLE_AI_ENABLED = "1";
    vi.mocked(generateText).mockResolvedValue({
      ok: true,
      text: "{bad",
      provider: "mock",
      model: "mock",
      tier: "cheap"
    });

    const { api, revisions } = createPlannerPrisma(makeRow({ id: "cycle_rev_fail" }));
    const pack = dreamFactPackForPlannerTests();
    const initial = await generateInitialGoalCyclePlan(api, {
      creatorId: "creator_planner",
      cycleId: "cycle_rev_fail",
      idempotencyKey: "fail_initial",
      expectedVersion: 1,
      factPack: pack,
      skipQuestions: true,
      forceFallback: true
    });

    await expect(
      reviseGoalCyclePlan(api, {
        creatorId: "creator_planner",
        cycleId: "cycle_rev_fail",
        idempotencyKey: "fail_rev_1",
        expectedVersion: initial.cycle.version,
        revision_note: "Try a change.",
        factPack: pack
      })
    ).rejects.toBeInstanceOf(GoalCycleContractError);

    expect(revisions.filter((r) => r.kind === "ai_revision")).toHaveLength(0);
    expect(vi.mocked(generateText).mock.calls[0]?.[0]?.metadata?.feature).toBe(
      "goal_cycle_planner_revision"
    );
  });
});

describe("VS5-T06 bounded / failure behavior", () => {
  const prevEnabled = process.env.RELAY_GOAL_CYCLE_ENABLED;
  const prevAi = process.env.RELAY_GOAL_CYCLE_AI_ENABLED;

  beforeEach(() => {
    process.env.RELAY_GOAL_CYCLE_ENABLED = "1";
    delete process.env.RELAY_GOAL_CYCLE_AI_ENABLED;
    vi.mocked(generateText).mockReset();
    vi.mocked(reserveCoachPlanCreditForCycle).mockReset();
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
      reservation: { reservation_key: "cpc_res_test", status: "reserved" },
      idempotent: false
    } as never);
  });

  afterEach(() => {
    if (prevEnabled === undefined) delete process.env.RELAY_GOAL_CYCLE_ENABLED;
    else process.env.RELAY_GOAL_CYCLE_ENABLED = prevEnabled;
    if (prevAi === undefined) delete process.env.RELAY_GOAL_CYCLE_AI_ENABLED;
    else process.env.RELAY_GOAL_CYCLE_AI_ENABLED = prevAi;
  });

  it("rejects ninth slot, unlinked destination, and hallucinated evidence", () => {
    const pack = dreamFactPackForPlannerTests();
    const base = buildDeterministicPlanFallback({ factPack: pack });

    expect(() =>
      validatePlannerPlan(
        {
          ...base,
          slots: [
            ...base.slots,
            ...Array.from({ length: 8 }, (_, i) => ({
              ...base.slots[0]!,
              id: `slot_extra_${i}`
            }))
          ]
        },
        { factPack: pack }
      )
    ).toThrow(/8 slots|LIMIT/i);

    expect(() =>
      validatePlannerPlan(
        {
          ...base,
          slots: base.slots.map((s, i) =>
            i === 0 ? { ...s, destination_ids: ["deviantart"] } : s
          )
        },
        { factPack: pack }
      )
    ).toThrow(GoalCycleContractError);

    expect(() =>
      validatePlannerPlan(
        {
          ...base,
          slots: base.slots.map((s, i) =>
            i === 0 ? { ...s, evidence_refs: ["ev_hallucinated_metric"] } : s
          )
        },
        { factPack: pack }
      )
    ).toThrow(/evidence/i);
  });

  it("caps questions at two and covers all rest branches", async () => {
    const qs = buildDeterministicPlannerQuestions(dreamFactPackForPlannerTests());
    expect(qs.length).toBeLessThanOrEqual(GOAL_CYCLE_MAX_QUESTIONS);
    const lead = qs.find((q) => q.id === "q_lead_format");
    expect(lead?.options).toEqual(
      expect.arrayContaining(["Single image", "Text", "Poll"])
    );

    const restQs = buildDeterministicPlannerQuestions(
      buildGoalCycleFactPackFromDreamFixture(undefined, {
        goal_kind: "break",
        break_mode: "active_rest"
      })
    );
    const restLead = restQs.find((q) => q.id === "q_lead_format");
    expect(restLead?.options).toEqual(
      expect.arrayContaining(["Text", "Poll", "Sketch / journal"])
    );
    expect(restLead!.options.length).toBeLessThanOrEqual(6);

    const silence = buildDeterministicPlanFallback({
      factPack: buildGoalCycleFactPackFromDreamFixture(undefined, {
        goal_kind: "break",
        break_mode: "complete_silence"
      }),
      goal_kind: "break",
      break_mode: "complete_silence"
    });
    expect(silence.slots).toHaveLength(0);

    const upkeep = buildDeterministicPlanFallback({
      factPack: buildGoalCycleFactPackFromDreamFixture(undefined, {
        goal_kind: "break",
        break_mode: "social_upkeep"
      }),
      goal_kind: "break",
      break_mode: "social_upkeep"
    });
    expect(upkeep.slots.every((s) => /upkeep/i.test(s.format))).toBe(true);

    const rest = buildDeterministicPlanFallback({
      factPack: buildGoalCycleFactPackFromDreamFixture(undefined, {
        goal_kind: "break",
        break_mode: "active_rest"
      }),
      goal_kind: "break",
      break_mode: "active_rest"
    });
    expect(rest.slots.length).toBeGreaterThan(0);
    expect(rest.slots.length).toBeLessThanOrEqual(4);
  });

  it("maps zero credit to GOAL_CYCLE_NO_CREDIT without writing a plan", async () => {
    vi.mocked(reserveCoachPlanCreditForCycle).mockRejectedValueOnce(
      new CoachPlanCreditError("GOAL_CYCLE_NO_CREDIT", "No Coach Plan credit available.", [
        { field: "credit", issue: "insufficient" }
      ])
    );

    const { api, revisions } = createPlannerPrisma(makeRow({ id: "cycle_nocredit" }));
    await expect(
      generateInitialGoalCyclePlan(api, {
        creatorId: "creator_planner",
        cycleId: "cycle_nocredit",
        idempotencyKey: "nocredit_1",
        expectedVersion: 1,
        factPack: dreamFactPackForPlannerTests(),
        skipQuestions: true,
        forceFallback: true
      })
    ).rejects.toMatchObject({ code: "GOAL_CYCLE_NO_CREDIT" });
    expect(revisions).toHaveLength(0);
  });

  it("redacts usage metadata to feature + creatorId only", async () => {
    process.env.RELAY_GOAL_CYCLE_AI_ENABLED = "1";
    vi.mocked(generateText).mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        plan: buildDeterministicPlanFallback({ factPack: dreamFactPackForPlannerTests() })
      }),
      provider: "mock",
      model: "mock",
      tier: "cheap",
      usage: { input_tokens: 11, output_tokens: 22 }
    });

    const { api } = createPlannerPrisma(makeRow({ id: "cycle_meta" }));
    await generateInitialGoalCyclePlan(api, {
      creatorId: "creator_planner",
      cycleId: "cycle_meta",
      idempotencyKey: "meta_1",
      expectedVersion: 1,
      factPack: dreamFactPackForPlannerTests(),
      skipQuestions: true
    });

    const meta = vi.mocked(generateText).mock.calls[0]?.[0]?.metadata ?? {};
    expect(Object.keys(meta).sort()).toEqual(["creatorId", "feature"]);
    expect(JSON.stringify(meta)).not.toMatch(/prompt|token|patron|system/i);
  });

  it("concurrent same idempotency key does not duplicate revisions", async () => {
    const { api, revisions } = createPlannerPrisma(makeRow({ id: "cycle_race" }));
    const pack = dreamFactPackForPlannerTests();

    // Seed one plan first so both retries hit the idempotent path after first completes.
    const first = await generateInitialGoalCyclePlan(api, {
      creatorId: "creator_planner",
      cycleId: "cycle_race",
      idempotencyKey: "race_key",
      expectedVersion: 1,
      factPack: pack,
      skipQuestions: true,
      forceFallback: true
    });

    const parallel = await Promise.all([
      generateInitialGoalCyclePlan(api, {
        creatorId: "creator_planner",
        cycleId: "cycle_race",
        idempotencyKey: "race_key",
        expectedVersion: first.cycle.version,
        factPack: pack,
        skipQuestions: true,
        forceFallback: true
      }),
      generateInitialGoalCyclePlan(api, {
        creatorId: "creator_planner",
        cycleId: "cycle_race",
        idempotencyKey: "race_key",
        expectedVersion: first.cycle.version,
        factPack: pack,
        skipQuestions: true,
        forceFallback: true
      })
    ]);

    expect(parallel.every((r) => r.idempotent)).toBe(true);
    expect(revisions).toHaveLength(1);
  });
});
