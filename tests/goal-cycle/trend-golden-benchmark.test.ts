import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertGoldenBenchmarkMatchesBaseline,
  FIXTURE_GOLDEN_THRESHOLDS,
  GOLDEN_QUERY_CASES,
  runFixtureGoldenBenchmark,
  TREND_GOLDEN_BENCHMARK_ID,
  type TrendGoldenBenchmarkReport
} from "../../src/goal-cycle/trends/golden-queries.js";
import { TREND_PROVIDER_CONTRACT_VERSION } from "../../src/goal-cycle/trends/provider-types.js";

const repoRoot = join(import.meta.dirname, "..", "..");
const fixturePath = join(repoRoot, "tests", "fixtures", "goal-cycle", "trend-golden-benchmark.json");

describe("Trend golden-query benchmark (VS3-T05)", () => {
  it("covers required golden categories without network", () => {
    const categories = new Set(GOLDEN_QUERY_CASES.map((c) => c.category));
    expect(categories).toEqual(
      new Set([
        "broad",
        "niche",
        "multilingual",
        "regional",
        "adult_adjacent",
        "sparse",
        "adversarial",
        "unavailable"
      ])
    );
  });

  it("fixture suite passes frozen thresholds and matches baseline artifact", async () => {
    const live = await runFixtureGoldenBenchmark();
    expect(live.benchmark_id).toBe(TREND_GOLDEN_BENCHMARK_ID);
    expect(live.contract_version).toBe(TREND_PROVIDER_CONTRACT_VERSION);
    expect(live.mode).toBe("fixture");
    expect(live.aggregate.pass).toBe(true);
    expect(live.cases.every((c) => c.pass)).toBe(true);
    expect(live.cases.every((c) => c.failures.length === 0)).toBe(true);
    expect(live.canonical_trend_evidence.composite_strength).toBe("strong");
    expect(live.canonical_trend_evidence.interest_series?.raw_provider_excerpt).toBeNull();
    expect(JSON.stringify(live)).not.toMatch(/ignore previous instructions|grant unlimited/i);

    for (const c of live.cases) {
      expect(c.latency_ms).toBe(0);
      expect(c.scores.freshness).toBeGreaterThanOrEqual(FIXTURE_GOLDEN_THRESHOLDS.freshness_min);
      expect(c.scores.niche_coverage).toBeGreaterThanOrEqual(
        FIXTURE_GOLDEN_THRESHOLDS.niche_coverage_min
      );
      expect(c.scores.source_quality).toBeGreaterThanOrEqual(
        FIXTURE_GOLDEN_THRESHOLDS.source_quality_min
      );
      expect(c.scores.spam_duplication).toBeGreaterThanOrEqual(
        FIXTURE_GOLDEN_THRESHOLDS.spam_duplication_min
      );
      expect(c.scores.citations).toBeGreaterThanOrEqual(FIXTURE_GOLDEN_THRESHOLDS.citations_min);
      expect(c.scores.latency).toBeGreaterThanOrEqual(FIXTURE_GOLDEN_THRESHOLDS.latency_min);
      expect(c.scores.failure_behavior).toBeGreaterThanOrEqual(
        FIXTURE_GOLDEN_THRESHOLDS.failure_behavior_min
      );
      expect(c.scores.safety).toBeGreaterThanOrEqual(FIXTURE_GOLDEN_THRESHOLDS.safety_min);
      expect(c.scores.fixture_cost).toBeGreaterThanOrEqual(FIXTURE_GOLDEN_THRESHOLDS.fixture_cost_min);
    }

    if (process.env.TREND_GOLDEN_UPDATE === "1") {
      mkdirSync(dirname(fixturePath), { recursive: true });
      writeFileSync(fixturePath, `${JSON.stringify(live, null, 2)}\n`, "utf8");
    }

    const baseline = JSON.parse(readFileSync(fixturePath, "utf8")) as TrendGoldenBenchmarkReport;
    assertGoldenBenchmarkMatchesBaseline(live, baseline);
    expect(baseline.canonical_trend_evidence.run_id).toBe("trend_run_golden_canonical");
    expect(baseline.thresholds).toEqual(FIXTURE_GOLDEN_THRESHOLDS);
  }, 30_000);
});
