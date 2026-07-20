import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTrendEvidenceGateway } from "../../src/goal-cycle/trends/trend-evidence-gateway.js";
import {
  getTrendResearchStatus,
  runTrendResearchOnce
} from "../../src/goal-cycle/trends/trend-research-service.js";
import type { TrendProgressCode } from "../../src/goal-cycle/trends/provider-types.js";
import { TREND_PROGRESS_CODES } from "../../src/goal-cycle/trends/provider-types.js";
import { prisma } from "../../src/lib/db.js";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
const RUN_ID = randomUUID().slice(0, 8);
const CREATOR = `gc_prog_${RUN_ID}`;

async function insertDraftCycle(creatorId: string): Promise<string> {
  const row = await prisma.creatorGoalCycle.create({
    data: {
      creatorId,
      state: "draft",
      phase: "goal",
      goalKind: "engagement",
      periodKey: "2026-07",
      timeZone: "UTC",
      activeScope: "active",
      contextJson: {}
    }
  });
  return row.id;
}

describe("Trend research progress (VS3-T04)", () => {
  it("emits fixed progress codes without chain-of-thought", async () => {
    const codes: TrendProgressCode[] = [];
    const gw = createTrendEvidenceGateway({
      env: { RELAY_GOAL_CYCLE_TREND_MODE: "fixture" },
      onProgress: (code) => {
        codes.push(code);
      }
    });
    await gw.research({
      creator_id: CREATOR,
      topic: "character sketch warmups",
      locale: "en-US",
      geography: null,
      window: "7d",
      creator_context: { window_months: 6, posts: [] },
      request_id: `req_prog_${RUN_ID}`
    });
    expect(codes).toEqual([
      "history_loaded",
      "interest_started",
      "interest_complete",
      "web_started",
      "web_complete"
    ]);
    for (const code of codes) {
      expect(TREND_PROGRESS_CODES).toContain(code);
    }
  });
});

describe.skipIf(!hasDatabaseUrl)("Trend research service (VS3-T04, real DB)", () => {
  let tablesReady = false;
  let skipReason = "not checked";
  let cycleId = "";

  beforeAll(async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ t: string | null }>>(
      "SELECT to_regclass('public.creator_goal_cycles')::text AS t"
    );
    const trend = await prisma.$queryRawUnsafe<Array<{ t: string | null }>>(
      "SELECT to_regclass('public.creator_goal_cycle_trend_runs')::text AS t"
    );
    tablesReady = Boolean(rows[0]?.t && trend[0]?.t);
    skipReason = tablesReady ? "" : "goal cycle / trend run tables missing";
    if (!tablesReady) return;
    await prisma.goalCycleTrendRun.deleteMany({ where: { creatorId: CREATOR } });
    await prisma.creatorGoalCycle.deleteMany({ where: { creatorId: CREATOR } });
    cycleId = await insertDraftCycle(CREATOR);
  }, 60_000);

  afterAll(async () => {
    if (!tablesReady) return;
    await prisma.goalCycleTrendRun.deleteMany({ where: { creatorId: CREATOR } });
    await prisma.creatorGoalCycle.deleteMany({ where: { creatorId: CREATOR } });
  }, 60_000);

  it("persists progress on the cycle stream and hydrates status safely", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);
    const { evidence, status } = await runTrendResearchOnce(prisma, {
      creatorId: CREATOR,
      cycleId,
      topic: "character sketch warmups",
      window: "7d",
      requestId: `req_svc_${RUN_ID}`,
      env: { RELAY_GOAL_CYCLE_TREND_MODE: "fixture", RELAY_GOAL_CYCLE_ENABLED: "true" }
    });
    expect(evidence.composite_strength).toBe("strong");
    expect(status.status).toBe("complete");
    expect(status.progress.map((p) => p.message_code)).toEqual(
      expect.arrayContaining([
        "history_loaded",
        "interest_complete",
        "web_complete",
        "research_complete"
      ])
    );
    expect(JSON.stringify(status)).not.toMatch(/chain.of.thought|ignore previous|grant unlimited/i);
    expect(status.evidence?.interest_series?.raw_provider_excerpt ?? null).toBeNull();

    const hydrated = await getTrendResearchStatus(prisma, CREATOR, cycleId, `req_svc_${RUN_ID}`, {
      RELAY_GOAL_CYCLE_TREND_MODE: "fixture"
    });
    expect(hydrated.progress.length).toBeGreaterThanOrEqual(status.progress.length);
    expect(hydrated.evidence?.run_id).toBe(evidence.run_id);
  }, 60_000);
});
