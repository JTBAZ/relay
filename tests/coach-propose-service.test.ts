import { describe, expect, it } from "vitest";
import type { CoachFactPack } from "../src/distribution/coach-fact-pack.js";
import {
  buildCoachFindings,
  buildDeterministicProposeVariants,
  parseCoachProposeAiOutput,
  resolveCoachPathId
} from "../src/distribution/coach-propose-service.js";
import type { CanonicalPostCopy } from "../src/distribution/platform-formatters.js";

const canonical: CanonicalPostCopy = {
  title: "Sketch study",
  bodyText: "Character lineup from this week.",
  tagLabels: ["character", "sketch"]
};

function stubFactPack(overrides: Partial<CoachFactPack> = {}): CoachFactPack {
  const { coverage, cadence, ...rest } = overrides;
  return {
    coverage: {
      as_of: new Date().toISOString(),
      range: "30d",
      stale: false,
      with_metrics: ["patreon"],
      without_metrics: ["x"],
      sources: ["extension_dom"],
      ...coverage
    },
    this_post: null,
    destination_mix: [],
    tags: [],
    contrast: null,
    structure: null,
    insight_codes: [],
    goals: [],
    cadence: {
      monthly_post_target: 8,
      posts_this_month: 3,
      historical_hour_of_day: 19,
      sample_size: 12,
      timing_confidence: "high",
      timezone: "America/New_York",
      ...cadence
    },
    reason_codes: [],
    ...rest
  };
}

describe("coach-propose-service", () => {
  it("resolves path ids from goal sets", () => {
    expect(
      resolveCoachPathId(["engagement_optimization", "format_optimization"])
    ).toBe("engage");
    expect(resolveCoachPathId(["language_outreach"])).toBe("localize");
    expect(resolveCoachPathId(["trend_riding", "engagement_optimization"])).toBe("trend");
    expect(resolveCoachPathId([])).toBeNull();
  });

  it("builds grounded findings from fact pack without inventing trends", () => {
    const chips = buildCoachFindings({
      canonical,
      context: { trend_note: "summer art challenge", goals: ["trend_riding"] },
      factPack: stubFactPack({
        this_post: {
          reach: 1200,
          likes: 40,
          comments: 5,
          by_destination: [
            { dest: "patreon", reach: 1200, likes: 40, comments: 5, engagement_rate: 0.0375 }
          ]
        },
        goals: [
          {
            id: "g1",
            metric: "reach",
            label: "Reach · creator",
            current: 100,
            target: 500,
            progress_ratio: 0.2,
            pace_status: "behind"
          }
        ]
      })
    });
    expect(chips.some((c) => c.source === "post")).toBe(true);
    expect(chips.some((c) => c.source === "coverage")).toBe(true);
    expect(chips.some((c) => c.source === "performance")).toBe(true);
    expect(chips.some((c) => c.source === "history" && c.label.includes("7pm"))).toBe(true);
    expect(chips.some((c) => c.source === "moment")).toBe(true);
    expect(chips.some((c) => c.label.toLowerCase().includes("trending on"))).toBe(false);
  });

  it("omits usual-hour chip when timing confidence is low", () => {
    const chips = buildCoachFindings({
      canonical,
      context: {},
      factPack: stubFactPack({
        cadence: {
          monthly_post_target: 4,
          posts_this_month: 1,
          historical_hour_of_day: null,
          sample_size: 2,
          timing_confidence: "low",
          timezone: "UTC"
        }
      })
    });
    expect(chips.some((c) => c.id === "history_hour")).toBe(false);
    expect(chips.some((c) => c.id === "history_hour_default")).toBe(false);
  });

  it("deterministic variants mark exactly one recommended", () => {
    const findings = buildCoachFindings({
      canonical,
      context: { goals: ["engagement_optimization", "format_optimization"] },
      factPack: stubFactPack({
        cadence: {
          monthly_post_target: 1,
          posts_this_month: 0,
          historical_hour_of_day: null,
          sample_size: 0,
          timing_confidence: "low",
          timezone: "UTC"
        }
      })
    });
    const variants = buildDeterministicProposeVariants({
      pathId: "engage",
      destination: "x",
      canonical,
      context: { goals: ["engagement_optimization", "format_optimization"] },
      findings
    });
    expect(variants.length).toBeGreaterThanOrEqual(2);
    expect(variants.filter((v) => v.recommended)).toHaveLength(1);
    expect(variants.every((v) => v.body_text.trim().length > 0)).toBe(true);
  });

  it("parses propose AI JSON and clamps to catalog formulae", () => {
    const findings = buildCoachFindings({
      canonical,
      context: { goals: ["engagement_optimization", "format_optimization"] },
      factPack: stubFactPack({
        cadence: {
          monthly_post_target: 1,
          posts_this_month: 0,
          historical_hour_of_day: 19,
          sample_size: 4,
          timing_confidence: "low",
          timezone: "UTC"
        }
      })
    });
    const parsed = parseCoachProposeAiOutput(
      JSON.stringify({
        by_destination: {
          x: {
            variants: [
              {
                formula_id: "hook_proof_cta",
                recommended: true,
                label: "Hook plan",
                fit_reason: "Usual evening window",
                title: null,
                body_text: "Hook for X"
              },
              {
                formula_id: "format_first_line",
                recommended: false,
                label: "Format plan",
                fit_reason: "Short first line",
                title: null,
                body_text: "Format for X"
              },
              {
                formula_id: "not_real",
                recommended: true,
                body_text: "Should drop"
              }
            ]
          }
        }
      }),
      {
        pathId: "engage",
        destinations: ["x"],
        canonical,
        context: { goals: ["engagement_optimization", "format_optimization"] },
        findings
      }
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.x?.variants).toHaveLength(2);
    expect(parsed?.x?.variants.filter((v) => v.recommended)).toHaveLength(1);
    expect(parsed?.x?.variants.every((v) => v.formula_id !== "not_real")).toBe(true);
  });

  it("rejects unusable propose JSON", () => {
    expect(
      parseCoachProposeAiOutput("{}", {
        pathId: "engage",
        destinations: ["x"],
        canonical,
        context: {},
        findings: []
      })
    ).toBeNull();
  });
});
