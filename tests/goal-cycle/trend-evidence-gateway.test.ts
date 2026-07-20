import { describe, expect, it } from "vitest";
import { DREAM_FLOW_FIXTURE } from "../../src/goal-cycle/fixtures/dream-flow.js";
import { createTrendEvidenceGateway } from "../../src/goal-cycle/trends/trend-evidence-gateway.js";
import { resolveTrendProviders } from "../../src/goal-cycle/trends/provider-registry.js";
import {
  TREND_PROVIDER_CONTRACT_VERSION,
  validateTrendResearchRequest
} from "../../src/goal-cycle/trends/provider-types.js";

function baseRequest(overrides: Record<string, unknown> = {}) {
  return {
    creator_id: DREAM_FLOW_FIXTURE.creator.creator_id,
    topic: "character sketch warmups",
    locale: "en-US",
    geography: null,
    window: "7d",
    creator_context: {
      window_months: DREAM_FLOW_FIXTURE.history.window_months,
      posts: DREAM_FLOW_FIXTURE.history.posts,
      top_signals: DREAM_FLOW_FIXTURE.history.posts.slice(0, 3).map((p) => p.title)
    },
    request_id: "req_trend_test_1",
    ...overrides
  };
}

describe("Trend evidence gateway (VS3-T01)", () => {
  it("exports a frozen provider contract version", () => {
    expect(TREND_PROVIDER_CONTRACT_VERSION).toBe("trend-provider-wire-v1");
  });

  it("validates research requests", () => {
    const ok = validateTrendResearchRequest(baseRequest());
    expect(ok.ok).toBe(true);
    const bad = validateTrendResearchRequest({ topic: "x" });
    expect(bad.ok).toBe(false);
  });

  it("resolves fixture providers only in fixture mode", () => {
    const fixture = resolveTrendProviders({ RELAY_GOAL_CYCLE_TREND_MODE: "fixture" });
    expect(fixture.interest?.provider_id).toBe("fixture_interest_v1");
    expect(fixture.web?.provider_id).toBe("fixture_web_v1");

    const history = resolveTrendProviders({ RELAY_GOAL_CYCLE_TREND_MODE: "history_only" });
    expect(history.interest).toBeNull();
    expect(history.web).toBeNull();

    const live = resolveTrendProviders({ RELAY_GOAL_CYCLE_TREND_MODE: "live" });
    expect(live.interest).toBeNull();
    expect(live.web).toBeNull();
  });

  it("returns strong evidence for the Dream strong topic", async () => {
    const gw = createTrendEvidenceGateway({
      env: { RELAY_GOAL_CYCLE_TREND_MODE: "fixture" },
      createRunId: () => "trend_run_strong"
    });
    const strongCase = DREAM_FLOW_FIXTURE.trend_cases.find((c) => c.case_id === "trend_strong")!;
    const evidence = await gw.research(baseRequest({ topic: strongCase.topic }));
    expect(evidence.run_id).toBe("trend_run_strong");
    expect(evidence.composite_strength).toBe("strong");
    expect(evidence.confidence).toBe("high");
    expect(evidence.interest_series?.evidence_strength).toBe("strong");
    expect(evidence.web_discovery?.items.length).toBeGreaterThan(0);
    expect(evidence.prompt_safe_summary).toMatch(/elevated|Interest/i);
    expect(evidence.provenance.some((p) => p.source_id === "fixture_interest_v1")).toBe(true);
    expect(evidence.provenance.some((p) => p.source_tier === "creator_history")).toBe(true);
  });

  it("returns weak evidence for niche topics", async () => {
    const gw = createTrendEvidenceGateway({
      env: { RELAY_GOAL_CYCLE_TREND_MODE: "fixture" }
    });
    const weakCase = DREAM_FLOW_FIXTURE.trend_cases.find((c) => c.case_id === "trend_weak")!;
    const evidence = await gw.research(baseRequest({ topic: weakCase.topic }));
    expect(evidence.composite_strength).toBe("weak");
    expect(evidence.confidence).toBe("low");
    expect(evidence.prompt_safe_summary).toMatch(/limited|niche|history/i);
    expect(evidence.human_context.trend_note).toMatch(/limited/i);
  });

  it("falls back to history_only when interest is unavailable", async () => {
    const gw = createTrendEvidenceGateway({
      env: { RELAY_GOAL_CYCLE_TREND_MODE: "fixture" }
    });
    const unavailable = DREAM_FLOW_FIXTURE.trend_cases.find((c) => c.case_id === "trend_unavailable")!;
    const evidence = await gw.research(baseRequest({ topic: unavailable.topic }));
    expect(evidence.composite_strength).toBe("history_only");
    expect(evidence.interest_series?.evidence_strength).toBe("unavailable");
    expect(evidence.web_discovery?.items ?? []).toHaveLength(0);
    expect(evidence.prompt_safe_summary).toMatch(/No approved interest series/i);
  });

  it("supports multilingual topics without network", async () => {
    const gw = createTrendEvidenceGateway({
      env: { RELAY_GOAL_CYCLE_TREND_MODE: "fixture" }
    });
    const evidence = await gw.research(baseRequest({ topic: "イラスト 練習 日本語" }));
    expect(evidence.human_context.topic).toContain("日本語");
    expect(evidence.web_discovery?.items[0]?.title).toMatch(/Multilingual/i);
    expect(["strong", "weak"]).toContain(evidence.composite_strength);
  });

  it("history_only mode skips providers", async () => {
    const gw = createTrendEvidenceGateway({
      env: { RELAY_GOAL_CYCLE_TREND_MODE: "history_only" }
    });
    const evidence = await gw.research(baseRequest());
    expect(evidence.interest_series).toBeNull();
    expect(evidence.web_discovery).toBeNull();
    expect(evidence.composite_strength).toBe("history_only");
    expect(evidence.creator_history.post_count).toBeGreaterThan(0);
  });
});
