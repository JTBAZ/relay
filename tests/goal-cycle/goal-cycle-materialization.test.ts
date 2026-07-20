/**
 * VS7-T01 unpublished semantics + VS7-T02 materializer characterization/service tests.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DRAFT_PUBLISHED_AT } from "../../src/autopost/posting-goal-service.js";
import { RELAY_DRAFT_EPOCH_SENTINEL } from "../../src/relay/create-relay-post.js";
import {
  GoalCycleContractError,
  type GoalCyclePlan
} from "../../src/goal-cycle/contracts.js";

const root = join(process.cwd());

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

vi.mock("../../src/relay/create-relay-post.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../src/relay/create-relay-post.js")>();
  return {
    ...mod,
    createRelayPostTransaction: vi.fn()
  };
});

vi.mock("../../src/usage/coach-plan-credit-service.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../src/usage/coach-plan-credit-service.js")>();
  return {
    ...mod,
    shouldReserveCoachPlanCredit: vi.fn(mod.shouldReserveCoachPlanCredit),
    consumeCoachPlanCreditReservationInTx: vi.fn()
  };
});

vi.mock("../../src/usage/coach-plan-credit-store.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../src/usage/coach-plan-credit-store.js")>();
  return {
    ...mod,
    ensureCreditWallet: vi.fn(async () => ({ creatorId: "creator_a", availableCredits: 0, reservedCredits: 1 }))
  };
});

import { createRelayPostTransaction } from "../../src/relay/create-relay-post.js";
import {
  consumeCoachPlanCreditReservationInTx,
  shouldReserveCoachPlanCredit
} from "../../src/usage/coach-plan-credit-service.js";
import {
  approveAndMaterialize,
  assertLinkedDestinations,
  buildSilenceReceipt
} from "../../src/goal-cycle/materialization/goal-cycle-materialization-service.js";

const mockedCreateRelayPost = vi.mocked(createRelayPostTransaction);
const mockedConsume = vi.mocked(consumeCoachPlanCreditReservationInTx);
const mockedShouldReserve = vi.mocked(shouldReserveCoachPlanCredit);

function validSlot(overrides: Partial<GoalCyclePlan["slots"][number]> = {}) {
  return {
    id: "slot_1",
    intent: "engagement_hook",
    format: "image_post",
    title: "Sketch drop",
    draft_body: "A short caption",
    destination_ids: ["patreon"],
    scheduled_local: "2026-07-20T19:00:00",
    scheduled_utc: "2026-07-20T23:00:00.000Z",
    time_zone: "America/New_York",
    media_state: "missing" as const,
    evidence_refs: ["ev_history_1"],
    ...overrides
  };
}

function validPlan(overrides: Partial<GoalCyclePlan> = {}): GoalCyclePlan {
  return {
    version: 1,
    rationale: "Start with one strong piece.",
    slots: [validSlot()],
    questions_asked: [],
    ai_revision_count: 0,
    evidence_summary: "Using creator history only.",
    warnings: [],
    logistics: {
      time_zone: "America/New_York",
      linked_destination_ids: ["patreon"],
      notes: null
    },
    ...overrides
  };
}

describe("VS7-T01 unpublished post semantics", () => {
  it("schema locks PostPublishState and nullable publishedAt", () => {
    const schema = readSrc("prisma/schema.prisma");
    expect(schema).toMatch(/enum PostPublishState\s*\{[\s\S]*draft[\s\S]*published/);
    expect(schema).toMatch(/publishState\s+PostPublishState/);
    expect(schema).toMatch(/publishedAt\s+DateTime\?/);
  });

  it("migration backfills published default and nulls epoch drafts", () => {
    const sql = readSrc(
      "prisma/migrations/20260717220000_post_publish_state/migration.sql"
    );
    expect(sql).toMatch(/CREATE TYPE "PostPublishState"/);
    expect(sql).toMatch(/ADD COLUMN "publish_state"/);
    expect(sql).toMatch(/DEFAULT 'published'/);
    expect(sql).toMatch(/SET "publish_state" = 'draft'/);
    expect(sql).toMatch(/ALTER COLUMN "published_at" DROP NOT NULL/);
    expect(sql).toMatch(/SET "published_at" = NULL/);
    expect(sql).toMatch(/1970-01-01/);
  });

  it("createRelayPostTransaction writes draft without epoch sentinel", () => {
    const src = readSrc("src/relay/create-relay-post.ts");
    expect(src).toMatch(/publishState = PostPublishState\.draft/);
    expect(src).toMatch(/publishedAt = null/);
    expect(src).not.toMatch(/publishedAt = DRAFT_PUBLISHED_AT/);
    expect(RELAY_DRAFT_EPOCH_SENTINEL.getTime()).toBe(0);
    expect(DRAFT_PUBLISHED_AT.getTime()).toBe(0);
  });

  it("posting-goal monthly counts require published state", () => {
    const src = readSrc("src/autopost/posting-goal-service.ts");
    expect(src).toMatch(/publishState:\s*PostPublishState\.published/);
    expect(src).toMatch(/not:\s*null/);
  });
});

describe("VS7-T02 materializer characterization", () => {
  it("persists receipt model + unique (cycle, approval_key)", () => {
    const schema = readSrc("prisma/schema.prisma");
    expect(schema).toMatch(/model CreatorGoalCycleMaterializationReceipt/);
    expect(schema).toMatch(/@@unique\(\[cycleId, approvalKey\]\)/);
    const sql = readSrc(
      "prisma/migrations/20260717230000_goal_cycle_materialization_receipts/migration.sql"
    );
    expect(sql).toMatch(/creator_goal_cycle_materialization_receipts/);
    expect(sql).toMatch(/cycle_id_approval_key/);
  });

  it("joins createRelayPostTransaction to outer tx and skips publish side-effects", () => {
    const src = readSrc("src/relay/create-relay-post.ts");
    expect(src).toMatch(/opts\?: \{ tx\?: Prisma\.TransactionClient \}/);
    expect(src).toMatch(/opts\?\.tx/);
    expect(src).toMatch(/input\.publish && !opts\?\.tx/);
  });

  it("silence receipt is zero-slot", () => {
    const receipt = buildSilenceReceipt("cyc_1", "appr_1", new Date("2026-07-17T12:00:00.000Z"));
    expect(receipt.slots).toEqual([]);
    expect(receipt.status).toBe("materialized");
  });

  it("rejects destinations outside logistics.linked_destination_ids", () => {
    expect(() =>
      assertLinkedDestinations(validPlan(), [validSlot({ destination_ids: ["x"] })])
    ).toThrow(
      expect.objectContaining({
        name: "GoalCycleContractError",
        code: "GOAL_CYCLE_DESTINATION_UNLINKED"
      })
    );
  });
});

type CycleRow = {
  id: string;
  creatorId: string;
  state: string;
  phase: string;
  goalKind: string;
  breakMode: string | null;
  version: number;
  timeZone: string;
  contextJson: Record<string, unknown>;
  reservationRef: string | null;
  approvedAt: Date | null;
  materializedAt: Date | null;
};

function createMaterializationMemory(seed: {
  cycle: CycleRow;
  plan: GoalCyclePlan | null;
  existingReceipt?: { approvalKey: string; receipt: Record<string, unknown> };
}) {
  const receipts: Array<{
    id: string;
    cycleId: string;
    approvalKey: string;
    receiptJson: Record<string, unknown>;
    materializedAt: Date;
  }> = seed.existingReceipt
    ? [
        {
          id: "rcpt_existing",
          cycleId: seed.cycle.id,
          approvalKey: seed.existingReceipt.approvalKey,
          receiptJson: seed.existingReceipt.receipt,
          materializedAt: new Date("2026-07-17T11:00:00.000Z")
        }
      ]
    : [];
  const slots: unknown[] = [];
  let planSeq = 0;
  let variantSeq = 0;
  let taskSeq = 0;
  const cycle = { ...seed.cycle };

  const api: any = {
    $queryRawUnsafe: vi.fn(async () => [{ id: cycle.id }]),
    creatorGoalCycle: {
      findFirst: vi.fn(async (args: any) => {
        if (args.where.id === cycle.id && args.where.creatorId === cycle.creatorId) {
          return { ...cycle };
        }
        return null;
      }),
      update: vi.fn(async (args: any) => {
        const data = { ...args.data };
        if (data.version && typeof data.version === "object" && "increment" in data.version) {
          cycle.version += Number(data.version.increment) || 0;
          delete data.version;
        }
        Object.assign(cycle, data);
        return { ...cycle };
      })
    },
    creatorGoalCycleRevision: {
      findFirst: vi.fn(async () =>
        seed.plan
          ? { planJson: seed.plan, ordinal: 1, cycleId: cycle.id }
          : null
      )
    },
    creatorGoalCycleMaterializationReceipt: {
      findUnique: vi.fn(async (args: any) => {
        const key = args.where.cycleId_approvalKey;
        return (
          receipts.find(
            (r) => r.cycleId === key.cycleId && r.approvalKey === key.approvalKey
          ) ?? null
        );
      }),
      findFirst: vi.fn(async (args: any) => {
        const rows = receipts.filter((r) => r.cycleId === args.where.cycleId);
        return rows[rows.length - 1] ?? null;
      }),
      create: vi.fn(async (args: any) => {
        const row = {
          id: `rcpt_${receipts.length + 1}`,
          ...args.data
        };
        receipts.push(row);
        return row;
      })
    },
    creatorGoalCycleSlot: {
      upsert: vi.fn(async (args: any) => {
        slots.push({ ...args.create, ...args.update });
        return args.create;
      })
    },
    postDistributionPlan: {
      create: vi.fn(async (args: any) => {
        planSeq += 1;
        return { id: `plan_${planSeq}`, ...args.data };
      })
    },
    postDistributionVariant: {
      create: vi.fn(async (args: any) => {
        variantSeq += 1;
        return { id: `var_${variantSeq}`, ...args.data };
      })
    },
    postbotTask: {
      create: vi.fn(async (args: any) => {
        taskSeq += 1;
        return { id: `task_${taskSeq}`, ...args.data };
      })
    },
    $transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => fn(api))
  };

  return { api, cycle, receipts, slots };
}

describe("VS7-T02 approveAndMaterialize", () => {
  const prevEnabled = process.env.RELAY_GOAL_CYCLE_ENABLED;
  const prevMat = process.env.RELAY_GOAL_CYCLE_MATERIALIZATION_ENABLED;

  beforeEach(() => {
    process.env.RELAY_GOAL_CYCLE_ENABLED = "1";
    process.env.RELAY_GOAL_CYCLE_MATERIALIZATION_ENABLED = "1";
    mockedCreateRelayPost.mockReset();
    mockedConsume.mockReset();
    mockedShouldReserve.mockReset();
    mockedShouldReserve.mockReturnValue(true);
    mockedConsume.mockResolvedValue({
      status: {
        enabled: true,
        available: 0,
        reserved: 0,
        included_per_period: null,
        period_started_at: null,
        period_ends_at: null,
        next_grant_at: null,
        topups_available: false
      },
      reservation: null,
      idempotent: false
    } as any);
    mockedCreateRelayPost.mockImplementation(async (_prisma, postId) => ({
      post: {
        id: postId,
        campaignId: "camp_1",
        creatorId: "creator_a",
        source: "RELAY",
        isPublic: true,
        requiredTierId: null
      },
      version: {
        id: "ver_1",
        versionSeq: 1,
        upstreamRevision: "relay:v1:1",
        title: "Sketch drop",
        description: null,
        publishedAt: null,
        tagIds: [],
        tierIds: [],
        mediaIds: []
      }
    }));
  });

  afterEach(() => {
    if (prevEnabled === undefined) delete process.env.RELAY_GOAL_CYCLE_ENABLED;
    else process.env.RELAY_GOAL_CYCLE_ENABLED = prevEnabled;
    if (prevMat === undefined) delete process.env.RELAY_GOAL_CYCLE_MATERIALIZATION_ENABLED;
    else process.env.RELAY_GOAL_CYCLE_MATERIALIZATION_ENABLED = prevMat;
  });

  it("materializes one new-post slot graph and consumes credit", async () => {
    const { api, cycle, receipts, slots } = createMaterializationMemory({
      cycle: {
        id: "cyc_1",
        creatorId: "creator_a",
        state: "review",
        phase: "approval",
        goalKind: "engagement",
        breakMode: null,
        version: 3,
        timeZone: "America/New_York",
        contextJson: {},
        reservationRef: "cpc_res_1",
        approvedAt: null,
        materializedAt: null
      },
      plan: validPlan()
    });

    const result = await approveAndMaterialize(api, {
      creatorId: "creator_a",
      cycleId: "cyc_1",
      expectedVersion: 3,
      approvalKey: "appr_1"
    });

    expect(result.idempotent).toBe(false);
    expect(result.receipt.slots).toHaveLength(1);
    expect(result.receipt.slots[0]).toMatchObject({
      slot_id: "slot_1",
      mode: "new_post",
      distribution_plan_id: "plan_1",
      variant_ids: ["var_1"],
      task_ids: ["task_1"],
      rail_event_ids: ["task_1"]
    });
    expect(result.receipt.slots[0]!.post_id).toMatch(/^relay_p_/);
    expect(mockedCreateRelayPost).toHaveBeenCalledWith(
      api,
      expect.stringMatching(/^relay_p_/),
      expect.objectContaining({ publish: false, publishedAtInput: null }),
      expect.objectContaining({ tx: api })
    );
    expect(mockedConsume).toHaveBeenCalledWith(
      api,
      expect.objectContaining({
        creatorId: "creator_a",
        cycleId: "cyc_1",
        approvalKey: "appr_1"
      })
    );
    expect(receipts).toHaveLength(1);
    expect(slots).toHaveLength(1);
    expect(cycle.state).toBe("active");
    expect(cycle.phase).toBe("active");
  });

  it("returns stored receipt on duplicate approval_key", async () => {
    const stored = {
      cycle_id: "cyc_1",
      approval_key: "appr_dup",
      status: "materialized" as const,
      materialized_at: "2026-07-17T11:00:00.000Z",
      slots: []
    };
    const { api } = createMaterializationMemory({
      cycle: {
        id: "cyc_1",
        creatorId: "creator_a",
        state: "active",
        phase: "active",
        goalKind: "engagement",
        breakMode: null,
        version: 9,
        timeZone: "America/New_York",
        contextJson: {},
        reservationRef: "cpc_res_1",
        approvedAt: new Date(),
        materializedAt: new Date()
      },
      plan: validPlan(),
      existingReceipt: { approvalKey: "appr_dup", receipt: stored }
    });

    const result = await approveAndMaterialize(api, {
      creatorId: "creator_a",
      cycleId: "cyc_1",
      expectedVersion: 9,
      approvalKey: "appr_dup"
    });
    expect(result.idempotent).toBe(true);
    expect(result.receipt).toEqual(stored);
    expect(mockedCreateRelayPost).not.toHaveBeenCalled();
    expect(mockedConsume).not.toHaveBeenCalled();
  });

  it("writes zero-slot silence receipt without credit consume", async () => {
    mockedShouldReserve.mockReturnValue(false);
    const { api, cycle, receipts } = createMaterializationMemory({
      cycle: {
        id: "cyc_silence",
        creatorId: "creator_a",
        state: "review",
        phase: "approval",
        goalKind: "break",
        breakMode: "complete_silence",
        version: 1,
        timeZone: "America/New_York",
        contextJson: {},
        reservationRef: null,
        approvedAt: null,
        materializedAt: null
      },
      plan: validPlan({ slots: [] })
    });

    const result = await approveAndMaterialize(api, {
      creatorId: "creator_a",
      cycleId: "cyc_silence",
      expectedVersion: 1,
      approvalKey: "appr_silence"
    });

    expect(result.receipt.slots).toEqual([]);
    expect(mockedConsume).not.toHaveBeenCalled();
    expect(mockedCreateRelayPost).not.toHaveBeenCalled();
    expect(receipts).toHaveLength(1);
    expect(cycle.state).toBe("active");
    expect(cycle.contextJson.reminder_suppression_until).toEqual(expect.any(String));
  });

  it("throws VERSION_CONFLICT when expectedVersion mismatches", async () => {
    const { api } = createMaterializationMemory({
      cycle: {
        id: "cyc_1",
        creatorId: "creator_a",
        state: "review",
        phase: "approval",
        goalKind: "engagement",
        breakMode: null,
        version: 5,
        timeZone: "America/New_York",
        contextJson: {},
        reservationRef: "cpc_res_1",
        approvedAt: null,
        materializedAt: null
      },
      plan: validPlan()
    });

    await expect(
      approveAndMaterialize(api, {
        creatorId: "creator_a",
        cycleId: "cyc_1",
        expectedVersion: 4,
        approvalKey: "appr_v"
      })
    ).rejects.toMatchObject({
      name: "GoalCycleContractError",
      code: "GOAL_CYCLE_VERSION_CONFLICT"
    });
  });

  it("throws DESTINATION_UNLINKED inside the transaction path", async () => {
    const { api } = createMaterializationMemory({
      cycle: {
        id: "cyc_1",
        creatorId: "creator_a",
        state: "review",
        phase: "approval",
        goalKind: "engagement",
        breakMode: null,
        version: 2,
        timeZone: "America/New_York",
        contextJson: {},
        reservationRef: "cpc_res_1",
        approvedAt: null,
        materializedAt: null
      },
      plan: validPlan({
        slots: [validSlot({ destination_ids: ["x"] })],
        logistics: {
          time_zone: "America/New_York",
          linked_destination_ids: ["patreon"],
          notes: null
        }
      })
    });

    await expect(
      approveAndMaterialize(api, {
        creatorId: "creator_a",
        cycleId: "cyc_1",
        expectedVersion: 2,
        approvalKey: "appr_bad_dest"
      })
    ).rejects.toMatchObject({
      name: "GoalCycleContractError",
      code: "GOAL_CYCLE_DESTINATION_UNLINKED"
    });
    expect(mockedCreateRelayPost).not.toHaveBeenCalled();
    expect(mockedConsume).not.toHaveBeenCalled();
  });

  it("rolls back credit consume failure without writing a receipt", async () => {
    const { CoachPlanCreditError } = await import(
      "../../src/usage/coach-plan-credit-service.js"
    );
    mockedConsume.mockRejectedValueOnce(
      new CoachPlanCreditError("GOAL_CYCLE_NO_CREDIT", "No credit.", [
        { field: "available", issue: "zero" }
      ])
    );
    const { api, receipts, cycle } = createMaterializationMemory({
      cycle: {
        id: "cyc_credit_fail",
        creatorId: "creator_a",
        state: "review",
        phase: "approval",
        goalKind: "engagement",
        breakMode: null,
        version: 1,
        timeZone: "America/New_York",
        contextJson: {},
        reservationRef: "cpc_res_1",
        approvedAt: null,
        materializedAt: null
      },
      plan: validPlan()
    });

    // In-memory $transaction does not roll back; assert we surface the mapped error.
    await expect(
      approveAndMaterialize(api, {
        creatorId: "creator_a",
        cycleId: "cyc_credit_fail",
        expectedVersion: 1,
        approvalKey: "appr_credit_fail"
      })
    ).rejects.toMatchObject({
      name: "GoalCycleContractError",
      code: "GOAL_CYCLE_NO_CREDIT"
    });
    // Real DB rolls back; memory mock may have side effects — receipt insert happens after consume.
    expect(receipts).toHaveLength(0);
    expect(cycle.state).not.toBe("active");
  });

  it("materializes eight slots within GOAL_CYCLE_MAX_SLOTS", async () => {
    const slots = Array.from({ length: 8 }, (_, i) =>
      validSlot({ id: `slot_${i + 1}`, title: `Post ${i + 1}` })
    );
    const { api, receipts } = createMaterializationMemory({
      cycle: {
        id: "cyc_8",
        creatorId: "creator_a",
        state: "review",
        phase: "approval",
        goalKind: "engagement",
        breakMode: null,
        version: 1,
        timeZone: "America/New_York",
        contextJson: {},
        reservationRef: "cpc_res_1",
        approvedAt: null,
        materializedAt: null
      },
      plan: validPlan({ slots })
    });

    const result = await approveAndMaterialize(api, {
      creatorId: "creator_a",
      cycleId: "cyc_8",
      expectedVersion: 1,
      approvalKey: "appr_8"
    });
    expect(result.receipt.slots).toHaveLength(8);
    expect(mockedCreateRelayPost).toHaveBeenCalledTimes(8);
    expect(receipts).toHaveLength(1);
  });

  it("social_upkeep with zero slots writes empty receipt and still consumes credit", async () => {
    const { api } = createMaterializationMemory({
      cycle: {
        id: "cyc_upkeep",
        creatorId: "creator_a",
        state: "review",
        phase: "approval",
        goalKind: "break",
        breakMode: "social_upkeep",
        version: 1,
        timeZone: "America/New_York",
        contextJson: {},
        reservationRef: "cpc_res_1",
        approvedAt: null,
        materializedAt: null
      },
      plan: validPlan({ slots: [] })
    });

    const result = await approveAndMaterialize(api, {
      creatorId: "creator_a",
      cycleId: "cyc_upkeep",
      expectedVersion: 1,
      approvalKey: "appr_upkeep"
    });
    expect(result.receipt.slots).toEqual([]);
    expect(mockedConsume).toHaveBeenCalled();
    expect(mockedCreateRelayPost).not.toHaveBeenCalled();
  });
});

describe("VS7-T03 repair diagnosis", () => {
  it("flags partial graphs as unsafe to re-approve", async () => {
    const { diagnoseOrRepairMaterialization } = await import(
      "../../src/goal-cycle/materialization/goal-cycle-materialization-repair.js"
    );
    const cycle = {
      id: "cyc_partial",
      creatorId: "creator_a",
      state: "materializing",
      phase: "approval",
      goalKind: "engagement",
      breakMode: null,
      version: 4,
      timeZone: "America/New_York",
      contextJson: {},
      reservationRef: "cpc_res_1",
      approvedAt: new Date(),
      materializedAt: null
    };
    const api: any = {
      creatorGoalCycle: {
        findFirst: vi.fn(async () => cycle)
      },
      creatorGoalCycleMaterializationReceipt: {
        findUnique: vi.fn(async () => null),
        findFirst: vi.fn(async () => null),
        create: vi.fn()
      },
      creatorGoalCycleSlot: {
        findMany: vi.fn(async () => [
          {
            slotKey: "slot_1",
            status: "materialized",
            downstreamPostId: "relay_p_1",
            downstreamPlanId: null,
            downstreamVariantIds: [],
            downstreamTaskIds: [],
            rank: 0
          }
        ])
      },
      post: { findFirst: vi.fn(async () => ({ id: "relay_p_1" })) },
      postDistributionPlan: { findFirst: vi.fn(async () => null) },
      postDistributionVariant: { findFirst: vi.fn(async () => null) },
      postbotTask: { findFirst: vi.fn(async () => null) },
      $transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => fn(api))
    };

    const report = await diagnoseOrRepairMaterialization(api, {
      creatorId: "creator_a",
      cycleId: "cyc_partial"
    });
    expect(report.status).toBe("partial");
    expect(report.can_safely_retry_approve).toBe(false);
    expect(api.creatorGoalCycleMaterializationReceipt.create).not.toHaveBeenCalled();
  });

  it("reconstructs receipt from complete unreceipted graph when repair=true", async () => {
    const { diagnoseOrRepairMaterialization } = await import(
      "../../src/goal-cycle/materialization/goal-cycle-materialization-repair.js"
    );
    const cycle = {
      id: "cyc_complete",
      creatorId: "creator_a",
      state: "materializing",
      phase: "approval",
      goalKind: "engagement",
      breakMode: null,
      version: 4,
      timeZone: "America/New_York",
      contextJson: {},
      reservationRef: "cpc_res_1",
      approvedAt: new Date(),
      materializedAt: null
    };
    const receipts: unknown[] = [];
    const api: any = {
      creatorGoalCycle: {
        findFirst: vi.fn(async () => cycle),
        update: vi.fn(async (args: any) => {
          Object.assign(cycle, args.data);
          return cycle;
        })
      },
      creatorGoalCycleMaterializationReceipt: {
        findUnique: vi.fn(async () => null),
        findFirst: vi.fn(async () => null),
        create: vi.fn(async (args: any) => {
          receipts.push(args.data);
          return args.data;
        })
      },
      creatorGoalCycleSlot: {
        findMany: vi.fn(async () => [
          {
            slotKey: "slot_1",
            status: "materialized",
            downstreamPostId: "relay_p_1",
            downstreamPlanId: "plan_1",
            downstreamVariantIds: ["var_1"],
            downstreamTaskIds: ["task_1"],
            rank: 0
          }
        ])
      },
      post: { findFirst: vi.fn(async () => ({ id: "relay_p_1" })) },
      postDistributionPlan: { findFirst: vi.fn(async () => ({ id: "plan_1" })) },
      postDistributionVariant: { findFirst: vi.fn(async () => ({ id: "var_1" })) },
      postbotTask: { findFirst: vi.fn(async () => ({ id: "task_1" })) },
      $transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => fn(api))
    };

    const report = await diagnoseOrRepairMaterialization(api, {
      creatorId: "creator_a",
      cycleId: "cyc_complete",
      approvalKey: "appr_repair",
      repair: true
    });
    expect(report.status).toBe("healthy");
    expect(report.receipt?.approval_key).toBe("appr_repair");
    expect(receipts).toHaveLength(1);
    expect(api.creatorGoalCycleMaterializationReceipt.create).toHaveBeenCalled();
  });
});

describe("VS7-T03 materialization routes characterization", () => {
  it("registers approve + repair paths", () => {
    const src = readSrc("src/goal-cycle/materialization/materialization-routes.ts");
    expect(src).toMatch(/\/api\/v1\/creator\/goal-cycles\/:id\/approve/);
    expect(src).toMatch(/\/api\/v1\/creator\/goal-cycles\/:id\/materialization\/repair/);
    expect(src).toMatch(/registerGoalCycleMaterializationRoutes/);
    const server = readSrc("src/server.ts");
    expect(server).toMatch(/registerGoalCycleMaterializationRoutes/);
  });
});
