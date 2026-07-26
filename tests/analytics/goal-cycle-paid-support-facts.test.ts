import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DREAM_FLOW_FIXTURE } from "../../src/goal-cycle/fixtures/dream-flow.js";
import {
  buildPaidSupportFactFixtureFromDreamCases,
  getPaidSupportFacts,
  snapshotCycleAttribution
} from "../../src/analytics/goal-cycle-paid-support-facts.js";
import { reconcileSupportEvent } from "../../src/analytics/goal-cycle-attribution-service.js";
import { prisma } from "../../src/lib/db.js";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
const RUN_ID = randomUUID().slice(0, 8);
const CREATOR = `gc_facts_${RUN_ID}`;
const CAMPAIGN = `gcc_facts_${RUN_ID}`;

describe("Paid-support planner facts (VS4-T04)", () => {
  it("exports Dream-aligned fact fixture including insufficient", () => {
    const fixture = buildPaidSupportFactFixtureFromDreamCases();
    const attrs = fixture.map((c) => c.attribution);
    expect(attrs).toEqual(
      expect.arrayContaining(["deterministic", "estimated", "zero", "unavailable", "insufficient"])
    );
    const dreamAttrs = DREAM_FLOW_FIXTURE.conversion_cases.map((c) => c.attribution);
    expect(dreamAttrs).toEqual(
      expect.arrayContaining(["deterministic", "estimated", "zero", "unavailable"])
    );
    expect(JSON.stringify(fixture)).not.toMatch(/patron|email|member_id/i);
  });
});

describe.skipIf(!hasDatabaseUrl)("Paid-support facts + snapshot (VS4-T04, real DB)", () => {
  let tablesReady = false;
  let skipReason = "not checked";
  let cycleId = "";

  beforeAll(async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ t: string | null }>>(
      "SELECT to_regclass('public.goal_cycle_attribution_snapshots')::text AS t"
    );
    tablesReady = Boolean(rows[0]?.t);
    skipReason = tablesReady ? "" : "attribution snapshots missing";
    if (!tablesReady) return;

    await prisma.goalCycleSupportOutcome.deleteMany({ where: { creatorId: CREATOR } });
    await prisma.goalCycleAttributionSnapshot.deleteMany({ where: { creatorId: CREATOR } });
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
    await prisma.creatorGoalCycleSlot.create({
      data: {
        cycleId,
        slotKey: "slot_1",
        rank: 1,
        goalCycleCampaignKey: CAMPAIGN
      }
    });
  }, 60_000);

  afterAll(async () => {
    if (!tablesReady) return;
    await prisma.goalCycleSupportOutcome.deleteMany({ where: { creatorId: CREATOR } });
    await prisma.goalCycleAttributionSnapshot.deleteMany({ where: { creatorId: CREATOR } });
    await prisma.creatorGoalCycleOutcome.deleteMany({ where: { cycleId } }).catch(() => undefined);
    await prisma.creatorGoalCycle.deleteMany({ where: { creatorId: CREATOR } });
  }, 60_000);

  it("prefers deterministic facts and strips patron identity", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);

    await reconcileSupportEvent(prisma, {
      creatorId: CREATOR,
      eventKind: "membership_join",
      occurredAt: "2026-07-17T16:00:00.000Z",
      source: "relay_link",
      sourceEventId: `join_${RUN_ID}`,
      campaignKey: CAMPAIGN
    });

    const facts = await getPaidSupportFacts(prisma, CREATOR, cycleId, {
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
          paid_support_event_count: 6
        }
      },
      targetThreshold: 2
    });

    expect(facts.attribution).toBe("deterministic");
    expect(facts.deterministic.count).toBe(1);
    expect(facts.outcome_summary.attribution).toBe("deterministic");
    expect(facts.outcome_summary.actual_label).toMatch(/1 deterministic/i);
    expect(JSON.stringify(facts)).not.toMatch(/patron|email|patreon_member|account_id/i);
  }, 60_000);

  it("keeps true zero distinct from estimated and snapshots without patron fields", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);

    await prisma.goalCycleSupportOutcome.deleteMany({ where: { creatorId: CREATOR } });

    const { snapshot_id, facts } = await snapshotCycleAttribution(prisma, CREATOR, cycleId, {
      windowKey: "active",
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

    expect(facts.attribution).toBe("zero");
    expect(facts.estimated).toBeNull();
    expect(facts.deterministic.count).toBe(0);

    const snap = await prisma.goalCycleAttributionSnapshot.findUnique({
      where: { id: snapshot_id }
    });
    expect(snap?.deterministicCount).toBe(0);
    expect(snap?.estimatedLiftJson).toBeNull();
    expect(JSON.stringify(snap)).not.toMatch(/patron|email|member_id/i);
  }, 60_000);

  it("surfaces insufficient when lift guards fail and coverage is incomplete", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);
    await prisma.goalCycleSupportOutcome.deleteMany({ where: { creatorId: CREATOR } });

    const facts = await getPaidSupportFacts(prisma, CREATOR, cycleId, {
      windows: {
        baseline: {
          start_day: "2026-06-01",
          end_day: "2026-06-07",
          complete_days: 7,
          coverage_ratio: 0.5,
          paid_support_event_count: 1
        },
        observation: {
          start_day: "2026-07-01",
          end_day: "2026-07-07",
          complete_days: 7,
          coverage_ratio: 0.5,
          paid_support_event_count: 1
        }
      }
    });

    expect(facts.attribution).toBe("insufficient");
    expect(facts.estimated?.status).toBe("insufficient");
    expect(facts.caveat).toMatch(/do not coerce to zero/i);
  }, 60_000);
});
