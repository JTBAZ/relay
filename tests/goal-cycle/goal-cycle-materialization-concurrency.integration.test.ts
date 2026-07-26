/**
 * VS7-T05 — materialization atomicity / idempotency against a real DB when available.
 *
 * Skips when DATABASE_URL is missing or receipt table is absent.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GoalCycleContractError } from "../../src/goal-cycle/contracts.js";
import { hydrateGoalCycleDetail } from "../../src/goal-cycle/goal-cycle-store.js";
import { diagnoseOrRepairMaterialization } from "../../src/goal-cycle/materialization/goal-cycle-materialization-repair.js";
import { approveAndMaterialize } from "../../src/goal-cycle/materialization/goal-cycle-materialization-service.js";
import { prisma } from "../../src/lib/db.js";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
const RUN_ID = randomUUID().slice(0, 8);
const CREATOR = `gc_mat_${RUN_ID}`;

let tablesReady = false;
let skipReason = "not checked";
let campaignId: string | null = null;

const prevEnabled = process.env.RELAY_GOAL_CYCLE_ENABLED;
const prevMat = process.env.RELAY_GOAL_CYCLE_MATERIALIZATION_ENABLED;

async function wipe(): Promise<void> {
  await prisma.creatorGoalCycle.deleteMany({ where: { creatorId: CREATOR } });
  await prisma.post.deleteMany({
    where: { creatorId: CREATOR, id: { startsWith: "relay_p_" } }
  });
}

function samplePlan(overrides?: {
  linked?: string[];
  slotDestinations?: string[];
  slots?: unknown[];
}) {
  const linked = overrides?.linked ?? ["patreon"];
  const slotDestinations = overrides?.slotDestinations ?? linked;
  return {
    version: 1,
    rationale: "concurrency fixture",
    slots:
      overrides?.slots ??
      [
        {
          id: "slot_1",
          intent: "engagement_hook",
          format: "image_post",
          title: "Concurrency sketch",
          draft_body: "caption",
          destination_ids: slotDestinations,
          scheduled_local: "2026-07-20T19:00:00",
          scheduled_utc: "2026-07-20T23:00:00.000Z",
          time_zone: "America/New_York",
          media_state: "missing",
          evidence_refs: []
        }
      ],
    questions_asked: [],
    ai_revision_count: 0,
    evidence_summary: "fixture",
    warnings: [],
    logistics: {
      time_zone: "America/New_York",
      linked_destination_ids: linked,
      notes: null
    }
  };
}

async function seedReviewCycle(opts?: {
  goalKind?: string;
  breakMode?: string | null;
  plan?: ReturnType<typeof samplePlan>;
  reservation?: boolean;
}): Promise<{ cycleId: string; version: number }> {
  const goalKind = opts?.goalKind ?? "engagement";
  const breakMode = opts?.breakMode ?? null;
  const needsReservation =
    opts?.reservation !== false &&
    !(goalKind === "break" && breakMode === "complete_silence");

  if (needsReservation) {
    await prisma.coachPlanCreditWallet.upsert({
      where: { creatorId: CREATOR },
      create: { creatorId: CREATOR, availableCredits: 0, reservedCredits: 1 },
      update: { availableCredits: 0, reservedCredits: 1 }
    });
  }

  const cycle = await prisma.creatorGoalCycle.create({
    data: {
      creatorId: CREATOR,
      state: "review",
      phase: "approval",
      goalKind,
      breakMode,
      periodKey: "2026-07",
      timeZone: "America/New_York",
      contextJson: {},
      activeScope: "active",
      version: 1,
      reservationRef: null,
      checkpoint: {
        create: {
          phase: "approval",
          stateJson: { phase: "approval", state: "review" },
          version: 1
        }
      },
      outcome: {
        create: {
          targetJson: { goal_kind: goalKind },
          confidence: "unknown",
          suggestedCompletion: false
        }
      },
      revisions: {
        create: {
          ordinal: 1,
          kind: "initial",
          requestSummary: {},
          responseSummary: {},
          planJson: (opts?.plan ?? samplePlan()) as object
        }
      }
    }
  });

  if (needsReservation) {
    const reservationKey = `cpc_res_${cycle.id}`;
    await prisma.coachPlanCreditReservation.create({
      data: {
        creatorId: CREATOR,
        cycleId: cycle.id,
        reservationKey,
        status: "reserved",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        version: 1
      }
    });
    await prisma.creatorGoalCycle.update({
      where: { id: cycle.id },
      data: { reservationRef: reservationKey }
    });
  }

  return { cycleId: cycle.id, version: cycle.version };
}

describe.skipIf(!hasDatabaseUrl)("VS7-T05 materialization concurrency (real DB)", () => {
  beforeAll(async () => {
    process.env.RELAY_GOAL_CYCLE_ENABLED = "1";
    process.env.RELAY_GOAL_CYCLE_MATERIALIZATION_ENABLED = "1";

    const receiptTable = await prisma.$queryRawUnsafe<Array<{ t: string | null }>>(
      "SELECT to_regclass('public.creator_goal_cycle_materialization_receipts')::text AS t"
    );
    tablesReady = Boolean(receiptTable[0]?.t);
    skipReason = tablesReady
      ? ""
      : "materialization receipts table missing — apply 20260717230000 migration";

    if (!tablesReady) return;

    const existing = await prisma.campaign.findFirst({
      where: { creatorId: CREATOR },
      select: { id: true }
    });
    if (existing) {
      campaignId = existing.id;
    } else {
      const created = await prisma.campaign.create({
        data: {
          id: `camp_${RUN_ID}`,
          creatorId: CREATOR,
          name: "Materialization fixture",
          upstreamUpdatedAt: new Date(),
          versionSeq: 1
        }
      });
      campaignId = created.id;
    }
    await wipe();
  }, 60_000);

  afterAll(async () => {
    if (prevEnabled === undefined) delete process.env.RELAY_GOAL_CYCLE_ENABLED;
    else process.env.RELAY_GOAL_CYCLE_ENABLED = prevEnabled;
    if (prevMat === undefined) delete process.env.RELAY_GOAL_CYCLE_MATERIALIZATION_ENABLED;
    else process.env.RELAY_GOAL_CYCLE_MATERIALIZATION_ENABLED = prevMat;
    if (!tablesReady) return;
    await wipe();
    await prisma.coachPlanCreditReservation.deleteMany({ where: { creatorId: CREATOR } });
    await prisma.coachPlanCreditLedger.deleteMany({ where: { creatorId: CREATOR } });
    await prisma.coachPlanCreditWallet.deleteMany({ where: { creatorId: CREATOR } });
    if (campaignId?.startsWith(`camp_${RUN_ID}`)) {
      await prisma.campaign.deleteMany({ where: { id: campaignId } });
    }
  }, 60_000);

  beforeEach(async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);
    await wipe();
  });

  it("duplicate approval_key returns the same receipt (process retry)", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);
    const { cycleId, version } = await seedReviewCycle();
    const first = await approveAndMaterialize(prisma, {
      creatorId: CREATOR,
      cycleId,
      expectedVersion: version,
      approvalKey: "appr_dup"
    });
    const second = await approveAndMaterialize(prisma, {
      creatorId: CREATOR,
      cycleId,
      expectedVersion: version,
      approvalKey: "appr_dup"
    });
    expect(second.idempotent).toBe(true);
    expect(second.receipt).toEqual(first.receipt);
    expect(
      await prisma.creatorGoalCycleMaterializationReceipt.count({ where: { cycleId } })
    ).toBe(1);
    expect(
      await prisma.post.count({
        where: { creatorId: CREATOR, id: { startsWith: "relay_p_" } }
      })
    ).toBe(1);
  });

  it("concurrent same-key approvals yield one receipt and one post", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);
    const { cycleId, version } = await seedReviewCycle();
    const results = await Promise.allSettled([
      approveAndMaterialize(prisma, {
        creatorId: CREATOR,
        cycleId,
        expectedVersion: version,
        approvalKey: "appr_race"
      }),
      approveAndMaterialize(prisma, {
        creatorId: CREATOR,
        cycleId,
        expectedVersion: version,
        approvalKey: "appr_race"
      }),
      approveAndMaterialize(prisma, {
        creatorId: CREATOR,
        cycleId,
        expectedVersion: version,
        approvalKey: "appr_race"
      })
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      if (r.status === "rejected") {
        expect(r.reason).toBeInstanceOf(GoalCycleContractError);
      }
    }
    expect(
      await prisma.creatorGoalCycleMaterializationReceipt.count({
        where: { cycleId, approvalKey: "appr_race" }
      })
    ).toBe(1);
    expect(
      await prisma.post.count({
        where: { creatorId: CREATOR, id: { startsWith: "relay_p_" } }
      })
    ).toBe(1);
  });

  it("invalid destination does not create posts or receipts", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);
    const { cycleId, version } = await seedReviewCycle({
      plan: samplePlan({ linked: ["patreon"], slotDestinations: ["x"] })
    });

    await expect(
      approveAndMaterialize(prisma, {
        creatorId: CREATOR,
        cycleId,
        expectedVersion: version,
        approvalKey: "appr_bad_dest"
      })
    ).rejects.toMatchObject({ code: "GOAL_CYCLE_DESTINATION_UNLINKED" });

    expect(
      await prisma.creatorGoalCycleMaterializationReceipt.count({ where: { cycleId } })
    ).toBe(0);
    expect(
      await prisma.post.count({
        where: { creatorId: CREATOR, id: { startsWith: "relay_p_" } }
      })
    ).toBe(0);
  });

  it("silence yields zero-slot receipt and no credit ledger consume", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);
    const { cycleId, version } = await seedReviewCycle({
      goalKind: "break",
      breakMode: "complete_silence",
      reservation: false,
      plan: samplePlan({ slots: [] })
    });
    const ledgerBefore = await prisma.coachPlanCreditLedger.count({
      where: { creatorId: CREATOR }
    });
    const result = await approveAndMaterialize(prisma, {
      creatorId: CREATOR,
      cycleId,
      expectedVersion: version,
      approvalKey: "appr_silence"
    });
    expect(result.receipt.slots).toEqual([]);
    expect(
      await prisma.coachPlanCreditLedger.count({ where: { creatorId: CREATOR } })
    ).toBe(ledgerBefore);
    const cycle = await prisma.creatorGoalCycle.findUniqueOrThrow({ where: { id: cycleId } });
    expect(cycle.state).toBe("active");
    const ctxJson = cycle.contextJson as Record<string, unknown>;
    expect(ctxJson.reminder_suppression_until).toEqual(expect.any(String));
  });

  it("planned drafts stay unpublished and hydrate receipt ref", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);
    const { cycleId, version } = await seedReviewCycle();
    const result = await approveAndMaterialize(prisma, {
      creatorId: CREATOR,
      cycleId,
      expectedVersion: version,
      approvalKey: "appr_draft"
    });
    const postId = result.receipt.slots[0]?.post_id;
    expect(postId).toBeTruthy();
    const post = await prisma.post.findUniqueOrThrow({
      where: { id: postId! },
      include: { versions: { where: { versionSeq: 1 } } }
    });
    expect(post.publishState).toBe("draft");
    expect(post.versions[0]?.publishedAt).toBeNull();

    const cycleRow = await prisma.creatorGoalCycle.findUniqueOrThrow({ where: { id: cycleId } });
    const hydrated = await hydrateGoalCycleDetail(prisma, cycleRow);
    expect(hydrated.materialization).toMatchObject({
      cycle_id: cycleId,
      approval_key: "appr_draft",
      status: "materialized"
    });
  });

  it("repair diagnoses empty as safe retry", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);
    const { cycleId } = await seedReviewCycle();
    const empty = await diagnoseOrRepairMaterialization(prisma, {
      creatorId: CREATOR,
      cycleId
    });
    expect(empty.status).toBe("empty");
    expect(empty.can_safely_retry_approve).toBe(true);
  });
});

void campaignId;
