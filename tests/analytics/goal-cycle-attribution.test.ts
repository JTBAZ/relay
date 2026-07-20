import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/db.js";

const repoRoot = join(import.meta.dirname, "..", "..");
const migrationDir = "20260717210000_goal_cycle_attribution";
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
const RUN_ID = randomUUID().slice(0, 8);
const CREATOR_A = `gc_attr_a_${RUN_ID}`;
const CREATOR_B = `gc_attr_b_${RUN_ID}`;

describe("VS4-T01 goal cycle attribution migration", () => {
  it("migration SQL adds campaign keys, outcome/snapshot tables, dedupe, RLS, no backfill", () => {
    const sqlPath = join(repoRoot, "prisma", "migrations", migrationDir, "migration.sql");
    const sql = readFileSync(sqlPath, "utf8");

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "goal_cycle_campaign_key"');
    expect(sql).toContain("creator_goal_cycle_slots");
    expect(sql).toContain("post_distribution_plans");
    expect(sql).toContain("post_distribution_variants");
    expect(sql).toContain("postbot_tasks");
    expect(sql).toContain("creator_tier_promotion_defaults");
    expect(sql).toContain("post_marketing_offers");

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "goal_cycle_support_outcomes"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "goal_cycle_attribution_snapshots"');
    expect(sql).toContain("goal_cycle_support_outcomes_creator_id_dedupe_key_key");
    expect(sql).toContain("goal_cycle_attribution_snapshots_cycle_id_window_key_key");
    expect(sql).toContain("reversal_state");
    expect(sql).toMatch(/No backfill/i);
    expect(sql).not.toMatch(/patron_id|email|full_name/i);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/i);
  });

  it("Prisma schema validates with attribution models", () => {
    execSync("npx prisma validate", { cwd: repoRoot, stdio: "pipe" });
  }, 60_000);
});

describe.skipIf(!hasDatabaseUrl)("VS4-T01 attribution schema (real DB)", () => {
  let tablesReady = false;
  let skipReason = "not checked";
  let cycleA = "";
  let cycleB = "";
  let slotA = "";

  beforeAll(async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ t: string | null }>>(
      "SELECT to_regclass('public.goal_cycle_support_outcomes')::text AS t"
    );
    tablesReady = Boolean(rows[0]?.t);
    skipReason = tablesReady
      ? ""
      : "goal_cycle_support_outcomes missing — apply migration 20260717210000_goal_cycle_attribution";
    if (!tablesReady) return;

    await prisma.goalCycleSupportOutcome.deleteMany({
      where: { creatorId: { in: [CREATOR_A, CREATOR_B] } }
    });
    await prisma.goalCycleAttributionSnapshot.deleteMany({
      where: { creatorId: { in: [CREATOR_A, CREATOR_B] } }
    });
    await prisma.creatorGoalCycle.deleteMany({
      where: { creatorId: { in: [CREATOR_A, CREATOR_B] } }
    });

    const a = await prisma.creatorGoalCycle.create({
      data: {
        creatorId: CREATOR_A,
        state: "active",
        phase: "active",
        goalKind: "paid_support",
        periodKey: "2026-07",
        timeZone: "UTC",
        activeScope: "active",
        contextJson: {}
      }
    });
    cycleA = a.id;
    const slot = await prisma.creatorGoalCycleSlot.create({
      data: {
        cycleId: cycleA,
        slotKey: "slot_1",
        rank: 1,
        goalCycleCampaignKey: `gcc_${RUN_ID}_a`
      }
    });
    slotA = slot.id;

    const b = await prisma.creatorGoalCycle.create({
      data: {
        creatorId: CREATOR_B,
        state: "active",
        phase: "active",
        goalKind: "paid_support",
        periodKey: "2026-07",
        timeZone: "UTC",
        activeScope: "active",
        contextJson: {}
      }
    });
    cycleB = b.id;
  }, 60_000);

  afterAll(async () => {
    if (!tablesReady) return;
    await prisma.goalCycleSupportOutcome.deleteMany({
      where: { creatorId: { in: [CREATOR_A, CREATOR_B] } }
    });
    await prisma.goalCycleAttributionSnapshot.deleteMany({
      where: { creatorId: { in: [CREATOR_A, CREATOR_B] } }
    });
    await prisma.creatorGoalCycle.deleteMany({
      where: { creatorId: { in: [CREATOR_A, CREATOR_B] } }
    });
  }, 60_000);

  it("enforces creator-scoped dedupe and reversal fields", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);

    const row = await prisma.goalCycleSupportOutcome.create({
      data: {
        creatorId: CREATOR_A,
        cycleId: cycleA,
        slotId: slotA,
        campaignKey: `gcc_${RUN_ID}_a`,
        eventKind: "membership_join",
        occurredAt: new Date("2026-07-17T16:00:00.000Z"),
        attribution: "deterministic",
        confidence: "high",
        source: "relay_link",
        coverage: "complete",
        freshnessSeconds: 60,
        evidenceRefsJson: ["ev_opaque_1"],
        dedupeKey: `relay_link:evt_${RUN_ID}`,
        reversalState: "none"
      }
    });
    expect(row.reversalState).toBe("none");

    await expect(
      prisma.goalCycleSupportOutcome.create({
        data: {
          creatorId: CREATOR_A,
          cycleId: cycleA,
          campaignKey: `gcc_${RUN_ID}_a`,
          eventKind: "membership_join",
          occurredAt: new Date("2026-07-17T16:05:00.000Z"),
          attribution: "deterministic",
          confidence: "high",
          source: "relay_link",
          coverage: "complete",
          evidenceRefsJson: [],
          dedupeKey: `relay_link:evt_${RUN_ID}`
        }
      })
    ).rejects.toThrow(/unique|Unique constraint/i);

    // Same dedupe key is allowed for another creator (tenant isolation at app layer;
    // uniqueness is per creatorId).
    const other = await prisma.goalCycleSupportOutcome.create({
      data: {
        creatorId: CREATOR_B,
        cycleId: cycleB,
        campaignKey: `gcc_${RUN_ID}_b`,
        eventKind: "tip",
        occurredAt: new Date("2026-07-17T16:00:00.000Z"),
        attribution: "deterministic",
        confidence: "medium",
        source: "relay_tip",
        coverage: "partial",
        evidenceRefsJson: [],
        dedupeKey: `relay_link:evt_${RUN_ID}`
      }
    });
    expect(other.creatorId).toBe(CREATOR_B);

    const reversed = await prisma.goalCycleSupportOutcome.update({
      where: { id: row.id },
      data: {
        reversalState: "reversed",
        reversedAt: new Date("2026-07-18T00:00:00.000Z")
      }
    });
    expect(reversed.reversalState).toBe("reversed");
    expect(reversed.reversedAt).not.toBeNull();
  }, 60_000);

  it("uniques attribution snapshots per cycle window", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);

    await prisma.goalCycleAttributionSnapshot.create({
      data: {
        creatorId: CREATOR_A,
        cycleId: cycleA,
        windowKey: "active",
        targetJson: { metric: "paid_support_count", threshold: 2 },
        deterministicCount: 1,
        coverage: "partial",
        confidence: "medium",
        calculatedAt: new Date("2026-07-17T18:00:00.000Z"),
        estimatedLiftJson: null
      }
    });

    await expect(
      prisma.goalCycleAttributionSnapshot.create({
        data: {
          creatorId: CREATOR_A,
          cycleId: cycleA,
          windowKey: "active",
          targetJson: {},
          deterministicCount: 0,
          coverage: "unavailable",
          confidence: "unknown",
          calculatedAt: new Date("2026-07-17T19:00:00.000Z")
        }
      })
    ).rejects.toThrow(/unique|Unique constraint/i);

    const secondWindow = await prisma.goalCycleAttributionSnapshot.create({
      data: {
        creatorId: CREATOR_A,
        cycleId: cycleA,
        windowKey: "2026-07-01_2026-07-14",
        targetJson: {},
        deterministicCount: 0,
        coverage: "unavailable",
        confidence: "unknown",
        calculatedAt: new Date("2026-07-17T19:00:00.000Z"),
        estimatedLiftJson: {
          method: "v1",
          status: "insufficient",
          caveat: "correlation_not_causation"
        }
      }
    });
    expect(secondWindow.windowKey).toContain("2026-07");
  }, 60_000);
});

describe("VS4-T02 deterministic reconcile (unit)", () => {
  it("skips clicks and unsupported funnel kinds without writing outcomes", async () => {
    const { reconcileSupportEvent } = await import(
      "../../src/analytics/goal-cycle-attribution-service.js"
    );
    const click = await reconcileSupportEvent(prisma, {
      creatorId: "creator_x",
      eventKind: "click",
      occurredAt: new Date(),
      source: "marketing_offer_click",
      sourceEventId: "click_1",
      campaignKey: "gcc_any"
    });
    expect(click).toEqual({ status: "skipped", reason: "ignored_funnel_event" });

    const view = await reconcileSupportEvent(prisma, {
      creatorId: "creator_x",
      eventKind: "view",
      occurredAt: new Date(),
      source: "relay_engagement",
      sourceEventId: "view_1",
      campaignKey: "gcc_any"
    });
    expect(view).toEqual({ status: "skipped", reason: "ignored_funnel_event" });
  });
});

describe.skipIf(!hasDatabaseUrl)("VS4-T02 deterministic reconcile (real DB)", () => {
  let tablesReady = false;
  let skipReason = "not checked";
  let cycleId = "";
  let slotId = "";
  const CREATOR = `gc_attr_r_${RUN_ID}`;
  const CAMPAIGN = `gcc_recon_${RUN_ID}`;

  beforeAll(async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ t: string | null }>>(
      "SELECT to_regclass('public.goal_cycle_support_outcomes')::text AS t"
    );
    tablesReady = Boolean(rows[0]?.t);
    skipReason = tablesReady ? "" : "attribution tables missing";
    if (!tablesReady) return;

    await prisma.goalCycleSupportOutcome.deleteMany({ where: { creatorId: CREATOR } });
    await prisma.creatorMembershipEvent.deleteMany({ where: { creatorId: CREATOR } });
    await prisma.creatorGoalCycle.deleteMany({ where: { creatorId: CREATOR } });

    const cycle = await prisma.creatorGoalCycle.create({
      data: {
        creatorId: CREATOR,
        state: "active",
        phase: "active",
        goalKind: "paid_support",
        periodKey: "2026-07",
        timeZone: "UTC",
        activeScope: "active",
        contextJson: {}
      }
    });
    cycleId = cycle.id;
    const slot = await prisma.creatorGoalCycleSlot.create({
      data: {
        cycleId,
        slotKey: "slot_paid_1",
        rank: 1,
        goalCycleCampaignKey: CAMPAIGN
      }
    });
    slotId = slot.id;
  }, 60_000);

  afterAll(async () => {
    if (!tablesReady) return;
    await prisma.goalCycleSupportOutcome.deleteMany({ where: { creatorId: CREATOR } });
    await prisma.creatorMembershipEvent.deleteMany({ where: { creatorId: CREATOR } });
    await prisma.creatorGoalCycle.deleteMany({ where: { creatorId: CREATOR } });
  }, 60_000);

  it("records deterministic joins and is idempotent on rerun", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);
    const {
      recordCampaignContext,
      reconcileSupportEvent,
      listDeterministicOutcomesForCycle
    } = await import("../../src/analytics/goal-cycle-attribution-service.js");

    await recordCampaignContext(prisma, {
      creatorId: CREATOR,
      cycleId,
      campaignKey: CAMPAIGN,
      slotId
    });

    const first = await reconcileSupportEvent(prisma, {
      creatorId: CREATOR,
      eventKind: "membership_join",
      occurredAt: "2026-07-17T16:10:00.000Z",
      source: "relay_link",
      sourceEventId: `join_${RUN_ID}`,
      campaignKey: CAMPAIGN,
      confidence: "high"
    });
    expect(first.status).toBe("recorded");
    if (first.status !== "recorded") return;
    expect(first.attribution).toBe("deterministic");
    expect(first.cycle_id).toBe(cycleId);

    const second = await reconcileSupportEvent(prisma, {
      creatorId: CREATOR,
      eventKind: "membership_join",
      occurredAt: "2026-07-17T16:12:00.000Z",
      source: "relay_link",
      sourceEventId: `join_${RUN_ID}`,
      campaignKey: CAMPAIGN
    });
    expect(second.status).toBe("updated");

    const listed = await listDeterministicOutcomesForCycle(prisma, CREATOR, cycleId);
    expect(listed.filter((o) => o.dedupe_key === `relay_link:join_${RUN_ID}`)).toHaveLength(1);
  }, 60_000);

  it("ignores clicks and skips events without campaign linkage", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);
    const { reconcileSupportEvent, listDeterministicOutcomesForCycle } = await import(
      "../../src/analytics/goal-cycle-attribution-service.js"
    );

    const before = await listDeterministicOutcomesForCycle(prisma, CREATOR, cycleId);
    const click = await reconcileSupportEvent(prisma, {
      creatorId: CREATOR,
      eventKind: "click",
      occurredAt: new Date(),
      source: "marketing_offer_click",
      sourceEventId: `click_${RUN_ID}`,
      campaignKey: CAMPAIGN
    });
    expect(click.status).toBe("skipped");

    const unmapped = await reconcileSupportEvent(prisma, {
      creatorId: CREATOR,
      eventKind: "tip",
      occurredAt: new Date(),
      source: "tip_reveal",
      sourceEventId: `tip_${RUN_ID}`,
      campaignKey: "gcc_unknown_other"
    });
    expect(unmapped).toEqual({ status: "skipped", reason: "campaign_unmapped" });

    const after = await listDeterministicOutcomesForCycle(prisma, CREATOR, cycleId);
    expect(after.length).toBe(before.length);
  }, 60_000);

  it("reconciles membership source rows and applies reversals idempotently", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);
    const {
      reconcileApprovedSourcesForCycle,
      reconcileSupportEvent,
      listDeterministicOutcomesForCycle
    } = await import("../../src/analytics/goal-cycle-attribution-service.js");

    const membership = await prisma.creatorMembershipEvent.create({
      data: {
        creatorId: CREATOR,
        patreonMemberId: `opaque_member_${RUN_ID}`,
        eventType: "upgrade",
        occurredAt: new Date("2026-07-17T17:00:00.000Z"),
        amountCents: 500,
        source: "webhook",
        payload: { goal_cycle_campaign_key: CAMPAIGN }
      }
    });

    const sweep = await reconcileApprovedSourcesForCycle(prisma, CREATOR, cycleId, {
      now: new Date("2026-07-17T18:00:00.000Z")
    });
    expect(sweep.recorded + sweep.updated).toBeGreaterThanOrEqual(1);

    const again = await reconcileApprovedSourcesForCycle(prisma, CREATOR, cycleId);
    expect(again.recorded).toBe(0);

    const reversed = await reconcileSupportEvent(prisma, {
      creatorId: CREATOR,
      eventKind: "membership_upgrade",
      occurredAt: membership.occurredAt,
      source: `membership_${membership.source}`,
      sourceEventId: membership.id,
      campaignKey: CAMPAIGN,
      reverse: true
    });
    expect(reversed.status).toBe("updated");
    if (reversed.status === "updated") {
      expect(reversed.reversal_state).toBe("reversed");
    }

    const outcomes = await listDeterministicOutcomesForCycle(prisma, CREATOR, cycleId);
    const upgrade = outcomes.find((o) => o.dedupe_key === `membership_webhook:${membership.id}`);
    expect(upgrade?.reversal_state).toBe("reversed");
    expect(JSON.stringify(outcomes)).not.toMatch(/patreon_member|email|patron_id/i);
  }, 60_000);
});
