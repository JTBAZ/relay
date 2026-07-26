import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DREAM_FLOW_FIXTURE } from "../../src/goal-cycle/fixtures/dream-flow.js";
import { GoalCycleContractError } from "../../src/goal-cycle/contracts.js";
import { createTrendEvidenceGateway } from "../../src/goal-cycle/trends/trend-evidence-gateway.js";
import { sanitizeTrendTopic } from "../../src/goal-cycle/trends/evidence-sanitizer.js";
import {
  buildTrendCacheKey,
  findTrendRunByRequestId
} from "../../src/goal-cycle/trends/trend-evidence-store.js";
import { runTrendResearchOnce } from "../../src/goal-cycle/trends/trend-research-service.js";
import {
  TREND_TOPIC_MAX_CHARS,
  validateTrendResearchRequest,
  type InterestSeriesProvider,
  type InterestSeriesResult
} from "../../src/goal-cycle/trends/provider-types.js";
import { prisma } from "../../src/lib/db.js";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
const RUN_ID = randomUUID().slice(0, 8);
const CREATOR_A = `gc_bound_a_${RUN_ID}`;
const CREATOR_B = `gc_bound_b_${RUN_ID}`;

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

describe("Trend evidence failure boundaries (VS3-T06)", () => {
  it("rejects malformed research payloads", () => {
    const bad = validateTrendResearchRequest({ topic: 12, creator_id: null });
    expect(bad.ok).toBe(false);
  });

  it("caps oversized topic input", () => {
    const result = sanitizeTrendTopic("x".repeat(TREND_TOPIC_MAX_CHARS + 200));
    expect(result.topic.length).toBe(TREND_TOPIC_MAX_CHARS);
    expect(result.issues).toContain("truncated");
  });

  it("keeps injection text inert in prompt-safe output", async () => {
    const adversarial = DREAM_FLOW_FIXTURE.trend_cases.find((c) => c.case_id === "trend_adversarial")!;
    const gw = createTrendEvidenceGateway({
      env: { RELAY_GOAL_CYCLE_TREND_MODE: "fixture" }
    });
    const evidence = await gw.research({
      creator_id: CREATOR_A,
      topic: adversarial.topic,
      locale: "en-US",
      geography: null,
      window: "7d",
      creator_context: {},
      request_id: `req_inj_${RUN_ID}`
    });
    expect(evidence.prompt_safe_summary).toMatch(/quarantined/i);
    expect(evidence.prompt_safe_summary).not.toMatch(/grant unlimited/i);
  });

  it("times out slow providers", async () => {
    const slow: InterestSeriesProvider = {
      provider_id: "slow_interest",
      provider_version: "1.0.0",
      search: async () =>
        new Promise<InterestSeriesResult>(() => {
          /* never resolves */
        })
    };
    const gw = createTrendEvidenceGateway({
      env: { RELAY_GOAL_CYCLE_TREND_MODE: "fixture" },
      timeoutMs: 40,
      interestProvider: slow,
      webProvider: null
    });
    await expect(
      gw.research({
        creator_id: CREATOR_A,
        topic: "character sketch warmups",
        locale: null,
        geography: null,
        window: "7d",
        creator_context: {},
        request_id: `req_timeout_${RUN_ID}`
      })
    ).rejects.toThrow(/trend_provider_timeout:interest/);
  });

  it("disabled mode performs no history or provider research", async () => {
    const gw = createTrendEvidenceGateway({
      env: { RELAY_GOAL_CYCLE_TREND_MODE: "disabled" }
    });
    const evidence = await gw.research({
      creator_id: CREATOR_A,
      topic: "character sketch warmups",
      locale: null,
      geography: null,
      window: "7d",
      creator_context: {
        posts: DREAM_FLOW_FIXTURE.history.posts,
        top_signals: ["should not load"]
      },
      request_id: `req_dis_${RUN_ID}`
    });
    expect(evidence.creator_history.post_count).toBe(0);
    expect(evidence.interest_series).toBeNull();
    expect(evidence.provenance).toEqual([]);
  });

  it("history_only continues from creator context without providers", async () => {
    const gw = createTrendEvidenceGateway({
      env: { RELAY_GOAL_CYCLE_TREND_MODE: "history_only" }
    });
    const evidence = await gw.research({
      creator_id: CREATOR_A,
      topic: "character sketch warmups",
      locale: null,
      geography: null,
      window: "7d",
      creator_context: {
        window_months: 6,
        posts: DREAM_FLOW_FIXTURE.history.posts.slice(0, 3)
      },
      request_id: `req_hist_${RUN_ID}`
    });
    expect(evidence.composite_strength).toBe("history_only");
    expect(evidence.interest_series).toBeNull();
    expect(evidence.web_discovery).toBeNull();
    expect(evidence.creator_history.post_count).toBe(3);
  });

  it("cache keys diverge when mode or provider version changes (collision guard)", () => {
    const base = {
      topic: "character sketch warmups",
      locale: "en-US" as string | null,
      geography: null as string | null,
      window: "7d",
      interest_provider_id: "fixture_interest_v1",
      interest_provider_version: "1.0.0",
      web_provider_id: "fixture_web_v1",
      web_provider_version: "1.0.0"
    };
    const a = buildTrendCacheKey({ ...base, mode: "fixture" });
    const b = buildTrendCacheKey({ ...base, mode: "live" });
    const c = buildTrendCacheKey({
      ...base,
      mode: "fixture",
      interest_provider_version: "1.0.1"
    });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});

describe.skipIf(!hasDatabaseUrl)("Trend evidence boundary persistence (VS3-T06, real DB)", () => {
  let tablesReady = false;
  let skipReason = "not checked";
  let cycleA = "";
  let cycleB = "";

  beforeAll(async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ t: string | null }>>(
      "SELECT to_regclass('public.creator_goal_cycle_trend_runs')::text AS t"
    );
    tablesReady = Boolean(rows[0]?.t);
    skipReason = tablesReady ? "" : "trend runs table missing";
    if (!tablesReady) return;
    await prisma.goalCycleTrendRun.deleteMany({
      where: { creatorId: { in: [CREATOR_A, CREATOR_B] } }
    });
    await prisma.creatorGoalCycle.deleteMany({
      where: { creatorId: { in: [CREATOR_A, CREATOR_B] } }
    });
    cycleA = await insertDraftCycle(CREATOR_A);
    cycleB = await insertDraftCycle(CREATOR_B);
  }, 60_000);

  afterAll(async () => {
    if (!tablesReady) return;
    await prisma.goalCycleTrendRun.deleteMany({
      where: { creatorId: { in: [CREATOR_A, CREATOR_B] } }
    });
    await prisma.creatorGoalCycle.deleteMany({
      where: { creatorId: { in: [CREATOR_A, CREATOR_B] } }
    });
  }, 60_000);

  it("isolates tenants and does not serve foreign request ids", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);
    const env = { RELAY_GOAL_CYCLE_TREND_MODE: "fixture", RELAY_GOAL_CYCLE_ENABLED: "true" };
    await runTrendResearchOnce(prisma, {
      creatorId: CREATOR_A,
      cycleId: cycleA,
      topic: "character sketch warmups",
      requestId: `req_tenant_a_${RUN_ID}`,
      window: "7d",
      env
    });
    const foreign = await findTrendRunByRequestId(prisma, CREATOR_B, `req_tenant_a_${RUN_ID}`);
    expect(foreign).toBeNull();

    await expect(
      runTrendResearchOnce(prisma, {
        creatorId: CREATOR_B,
        cycleId: cycleA,
        topic: "character sketch warmups",
        requestId: `req_cross_${RUN_ID}`,
        window: "7d",
        env
      })
    ).rejects.toBeInstanceOf(GoalCycleContractError);
  }, 60_000);

  it("refreshes after stale cache expiry", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);
    const env = { RELAY_GOAL_CYCLE_TREND_MODE: "fixture", RELAY_GOAL_CYCLE_ENABLED: "true" };
    const first = await runTrendResearchOnce(prisma, {
      creatorId: CREATOR_A,
      cycleId: cycleA,
      topic: "obscure niche mascot redesign",
      requestId: `req_stale_a_${RUN_ID}`,
      window: "7d",
      env
    });
    await prisma.goalCycleTrendRun.updateMany({
      where: { creatorId: CREATOR_A, requestId: `req_stale_a_${RUN_ID}` },
      data: { expiresAt: new Date("2000-01-01T00:00:00.000Z") }
    });
    const second = await runTrendResearchOnce(prisma, {
      creatorId: CREATOR_A,
      cycleId: cycleA,
      topic: "obscure niche mascot redesign",
      requestId: `req_stale_b_${RUN_ID}`,
      window: "7d",
      env
    });
    expect(second.evidence.run_id).not.toBe(first.evidence.run_id);
    expect(second.evidence.composite_strength).toBe("weak");
  }, 60_000);

  it("idempotent request_id resumes completed research", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);
    await runTrendResearchOnce(prisma, {
      creatorId: CREATOR_B,
      cycleId: cycleB,
      topic: "character sketch warmups",
      requestId: `req_ok_${RUN_ID}`,
      window: "7d",
      env: { RELAY_GOAL_CYCLE_TREND_MODE: "fixture", RELAY_GOAL_CYCLE_ENABLED: "true" }
    });
    const again = await runTrendResearchOnce(prisma, {
      creatorId: CREATOR_B,
      cycleId: cycleB,
      topic: "character sketch warmups",
      requestId: `req_ok_${RUN_ID}`,
      window: "7d",
      env: { RELAY_GOAL_CYCLE_TREND_MODE: "fixture", RELAY_GOAL_CYCLE_ENABLED: "true" }
    });
    expect(again.status.status).toBe("complete");
  }, 60_000);

  it("new request_id on cache hit still reports complete status", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);
    const env = { RELAY_GOAL_CYCLE_TREND_MODE: "fixture", RELAY_GOAL_CYCLE_ENABLED: "true" };
    await runTrendResearchOnce(prisma, {
      creatorId: CREATOR_A,
      cycleId: cycleA,
      topic: "character sketch warmups",
      requestId: `req_cache_src_${RUN_ID}`,
      window: "7d",
      env
    });
    const cached = await runTrendResearchOnce(prisma, {
      creatorId: CREATOR_A,
      cycleId: cycleA,
      topic: "character sketch warmups",
      requestId: `req_cache_new_${RUN_ID}`,
      window: "7d",
      env
    });
    expect(cached.status.status).toBe("complete");
    expect(cached.status.request_id).toBe(`req_cache_new_${RUN_ID}`);
  }, 60_000);
});
