/**
 * VS4-T06 — Attribution truthfulness + tenant isolation (real DB when available).
 *
 * Covers: click-only, zero, missing/unavailable, duplicate/late/reversed,
 * mixed currencies, out-of-window, estimated labeling, cross-tenant campaign keys.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  listDeterministicOutcomesForCycle,
  reconcileApprovedSourcesForCycle,
  reconcileSupportEvent
} from "../../src/analytics/goal-cycle-attribution-service.js";
import { calculateCampaignLift } from "../../src/analytics/goal-cycle-lift.js";
import {
  getPaidSupportFacts,
  snapshotCycleAttribution
} from "../../src/analytics/goal-cycle-paid-support-facts.js";
import { GoalCycleNotFoundError } from "../../src/goal-cycle/goal-cycle-service.js";
import { prisma } from "../../src/lib/db.js";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
const RUN_ID = randomUUID().slice(0, 8);
const CREATOR_A = `gc_attr_iso_a_${RUN_ID}`;
const CREATOR_B = `gc_attr_iso_b_${RUN_ID}`;
const CAMPAIGN_A = `gcc_iso_a_${RUN_ID}`;
const CAMPAIGN_B = `gcc_iso_b_${RUN_ID}`;

describe("VS4-T06 attribution truthfulness (pure)", () => {
  it("labels estimated lift without deterministic language", () => {
    const result = calculateCampaignLift({
      baseline: {
        start_day: "2026-06-01",
        end_day: "2026-06-14",
        complete_days: 14,
        coverage_ratio: 0.9,
        paid_support_event_count: 4
      },
      observation: {
        start_day: "2026-07-01",
        end_day: "2026-07-14",
        complete_days: 14,
        coverage_ratio: 0.85,
        paid_support_event_count: 7
      },
      reason_deterministic_unavailable: "No consented campaign linkage"
    });
    expect(result.status).toBe("estimated");
    if (result.status !== "estimated") return;
    expect(result.caveat.toLowerCase()).toMatch(/correlat|not individual|campaign-level/);
    expect(result.caveat.toLowerCase()).not.toMatch(/deterministic/);
    expect(JSON.stringify(result)).not.toMatch(/patron|email|member_id/i);
  });

  it("click-only reconcile never records a conversion", async () => {
    const click = await reconcileSupportEvent(prisma, {
      creatorId: "creator_click_only",
      eventKind: "click",
      occurredAt: new Date(),
      source: "marketing_offer_click",
      sourceEventId: `click_${RUN_ID}`,
      campaignKey: "gcc_any"
    });
    expect(click).toEqual({ status: "skipped", reason: "ignored_funnel_event" });
  });
});

describe.skipIf(!hasDatabaseUrl)("VS4-T06 attribution isolation (real DB)", () => {
  let tablesReady = false;
  let skipReason = "not checked";
  let cycleA = "";
  let cycleB = "";

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
    await prisma.creatorGoalCycleSlot.create({
      data: {
        cycleId: cycleA,
        slotKey: "slot_1",
        rank: 1,
        goalCycleCampaignKey: CAMPAIGN_A
      }
    });

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
    await prisma.creatorGoalCycleSlot.create({
      data: {
        cycleId: cycleB,
        slotKey: "slot_1",
        rank: 1,
        goalCycleCampaignKey: CAMPAIGN_B
      }
    });
  }, 60_000);

  afterAll(async () => {
    if (!tablesReady) return;
    await prisma.goalCycleSupportOutcome.deleteMany({
      where: { creatorId: { in: [CREATOR_A, CREATOR_B] } }
    });
    await prisma.goalCycleAttributionSnapshot.deleteMany({
      where: { creatorId: { in: [CREATOR_A, CREATOR_B] } }
    });
    await prisma.creatorGoalCycleOutcome.deleteMany({
      where: { cycleId: { in: [cycleA, cycleB].filter(Boolean) } }
    }).catch(() => undefined);
    await prisma.creatorGoalCycle.deleteMany({
      where: { creatorId: { in: [CREATOR_A, CREATOR_B] } }
    });
  }, 60_000);

  it("true zero stays zero; missing coverage stays unavailable", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);

    const zero = await getPaidSupportFacts(prisma, CREATOR_A, cycleA, {
      windows: {
        baseline: {
          start_day: "2026-06-01",
          end_day: "2026-06-14",
          complete_days: 14,
          coverage_ratio: 0.9,
          paid_support_event_count: 4
        },
        observation: {
          start_day: "2026-07-01",
          end_day: "2026-07-14",
          complete_days: 14,
          coverage_ratio: 0.9,
          paid_support_event_count: 0
        }
      }
    });
    expect(zero.attribution).toBe("zero");
    expect(zero.deterministic.count).toBe(0);
    expect(zero.estimated).toBeNull();
    expect(zero.outcome_summary.attribution).toBe("deterministic");

    const missing = await getPaidSupportFacts(prisma, CREATOR_A, cycleA);
    expect(missing.attribution).toBe("unavailable");
    expect(missing.deterministic.count).toBe(0);
    expect(missing.caveat).toMatch(/do not coerce to zero/i);
  }, 60_000);

  it("duplicate and late events count once; reversals drop from facts", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);

    await prisma.goalCycleSupportOutcome.deleteMany({ where: { creatorId: CREATOR_A } });

    const first = await reconcileSupportEvent(prisma, {
      creatorId: CREATOR_A,
      eventKind: "tip",
      occurredAt: "2026-07-10T12:00:00.000Z",
      source: "tip_reveal",
      sourceEventId: `tip_${RUN_ID}`,
      campaignKey: CAMPAIGN_A,
      amountMinor: 500,
      currency: "USD"
    });
    expect(first.status).toBe("recorded");

    const late = await reconcileSupportEvent(prisma, {
      creatorId: CREATOR_A,
      eventKind: "tip",
      occurredAt: "2026-07-20T12:00:00.000Z",
      source: "tip_reveal",
      sourceEventId: `tip_${RUN_ID}`,
      campaignKey: CAMPAIGN_A,
      amountMinor: 500,
      currency: "USD",
      now: new Date("2026-07-21T00:00:00.000Z")
    });
    expect(late.status).toBe("updated");

    const listed = await listDeterministicOutcomesForCycle(prisma, CREATOR_A, cycleA);
    expect(listed).toHaveLength(1);

    await reconcileSupportEvent(prisma, {
      creatorId: CREATOR_A,
      eventKind: "tip",
      occurredAt: "2026-07-10T12:00:00.000Z",
      source: "tip_reveal",
      sourceEventId: `tip_${RUN_ID}`,
      campaignKey: CAMPAIGN_A,
      reverse: true
    });

    const facts = await getPaidSupportFacts(prisma, CREATOR_A, cycleA);
    expect(facts.deterministic.count).toBe(0);
  }, 60_000);

  it("mixed currencies never sum amounts", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);

    await prisma.goalCycleSupportOutcome.deleteMany({ where: { creatorId: CREATOR_A } });

    await reconcileSupportEvent(prisma, {
      creatorId: CREATOR_A,
      eventKind: "purchase",
      occurredAt: "2026-07-05T10:00:00.000Z",
      source: "platform_revenue",
      sourceEventId: `usd_${RUN_ID}`,
      campaignKey: CAMPAIGN_A,
      amountMinor: 1000,
      currency: "USD"
    });
    await reconcileSupportEvent(prisma, {
      creatorId: CREATOR_A,
      eventKind: "purchase",
      occurredAt: "2026-07-06T10:00:00.000Z",
      source: "platform_revenue",
      sourceEventId: `eur_${RUN_ID}`,
      campaignKey: CAMPAIGN_A,
      amountMinor: 900,
      currency: "EUR"
    });

    const facts = await getPaidSupportFacts(prisma, CREATOR_A, cycleA);
    expect(facts.deterministic.count).toBe(2);
    expect(facts.deterministic.amount_minor).toBeNull();
    expect(facts.deterministic.currency).toBeNull();
  }, 60_000);

  it("out-of-window events do not attach", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);

    await prisma.goalCycleSupportOutcome.deleteMany({ where: { creatorId: CREATOR_A } });

    const outside = await reconcileSupportEvent(prisma, {
      creatorId: CREATOR_A,
      eventKind: "membership_join",
      occurredAt: "2026-05-01T12:00:00.000Z",
      source: "relay_link",
      sourceEventId: `oob_${RUN_ID}`,
      campaignKey: CAMPAIGN_A
    });
    expect(outside).toEqual({ status: "skipped", reason: "outside_attribution_window" });

    const listed = await listDeterministicOutcomesForCycle(prisma, CREATOR_A, cycleA);
    expect(listed).toHaveLength(0);
  }, 60_000);

  it("cross-tenant campaign keys and cycle reads are rejected", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);

    const foreignKey = await reconcileSupportEvent(prisma, {
      creatorId: CREATOR_B,
      eventKind: "membership_join",
      occurredAt: "2026-07-12T12:00:00.000Z",
      source: "relay_link",
      sourceEventId: `xtenant_${RUN_ID}`,
      campaignKey: CAMPAIGN_A
    });
    expect(foreignKey).toEqual({ status: "skipped", reason: "campaign_unmapped" });

    await expect(getPaidSupportFacts(prisma, CREATOR_B, cycleA)).rejects.toBeInstanceOf(
      GoalCycleNotFoundError
    );

    const bFacts = await getPaidSupportFacts(prisma, CREATOR_B, cycleB);
    expect(bFacts.cycle_id).toBe(cycleB);
    expect(bFacts.deterministic.outcome_ids.every((id) => typeof id === "string")).toBe(true);
    expect(JSON.stringify(bFacts)).not.toMatch(/patron|email|member_id/i);
  }, 60_000);

  it("GET-equivalent facts path never reconciles approved sources", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);

    const spy = vi.spyOn(
      await import("../../src/analytics/goal-cycle-attribution-service.js"),
      "reconcileApprovedSourcesForCycle"
    );
    try {
      await getPaidSupportFacts(prisma, CREATOR_A, cycleA);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  }, 60_000);

  it("refresh snapshot persists estimated separately from deterministic", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);

    await prisma.goalCycleSupportOutcome.deleteMany({ where: { creatorId: CREATOR_A } });
    const reconcile = await reconcileApprovedSourcesForCycle(prisma, CREATOR_A, cycleA);
    expect(reconcile.ignored_clicks).toBeGreaterThanOrEqual(0);

    const { snapshot_id, facts } = await snapshotCycleAttribution(prisma, CREATOR_A, cycleA, {
      windowKey: "active",
      windows: {
        baseline: {
          start_day: "2026-06-01",
          end_day: "2026-06-14",
          complete_days: 14,
          coverage_ratio: 0.9,
          paid_support_event_count: 5
        },
        observation: {
          start_day: "2026-07-01",
          end_day: "2026-07-14",
          complete_days: 14,
          coverage_ratio: 0.88,
          paid_support_event_count: 8
        }
      },
      reasonDeterministicUnavailable: "No consented linkage in window"
    });
    expect(snapshot_id).toBeTruthy();
    expect(facts.attribution).toBe("estimated");
    expect(facts.estimated?.status).toBe("estimated");
    expect(facts.outcome_summary.attribution).toBe("estimated");
    expect(facts.outcome_summary.actual_label?.toLowerCase()).toMatch(/estimated/);
    expect(facts.outcome_summary.actual_label?.toLowerCase()).not.toMatch(/deterministic/);
  }, 60_000);
});
