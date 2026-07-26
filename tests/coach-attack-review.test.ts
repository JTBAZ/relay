import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { FormattedPlatformVariant } from "../src/distribution/platform-formatters.js";
import type { CoachFactPack } from "../src/distribution/coach-fact-pack.js";

vi.mock("../src/creator/creator-feature-flags-service.js", () => ({
  isPostingAssistantAllowedForCreator: vi.fn(async () => true)
}));

vi.mock("../src/ai/ai-service.js", () => ({
  generateText: vi.fn(async () => ({
    ok: false,
    error: { code: "disabled", message: "AI off for this test" }
  }))
}));

import { isPostingAssistantAllowedForCreator } from "../src/creator/creator-feature-flags-service.js";
import { generateText } from "../src/ai/ai-service.js";
import { applyPostingAssistantToVariants } from "../src/distribution/posting-assistant-service.js";
import {
  buildCoachFindings,
  buildDeterministicProposeVariants,
  parseCoachProposeAiOutput
} from "../src/distribution/coach-propose-service.js";
import type { CanonicalPostCopy } from "../src/distribution/platform-formatters.js";

const canonical: CanonicalPostCopy = {
  title: "Studio piece",
  bodyText: "Full description of the work.",
  tagLabels: ["illustration"]
};

function stubFactPack(cadence?: Partial<CoachFactPack["cadence"]>): CoachFactPack {
  return {
    coverage: {
      as_of: new Date().toISOString(),
      range: "30d",
      stale: false,
      with_metrics: [],
      without_metrics: [],
      sources: []
    },
    this_post: null,
    destination_mix: [],
    tags: [],
    contrast: null,
    structure: null,
    insight_codes: [],
    goals: [],
    cadence: {
      monthly_post_target: 4,
      posts_this_month: 1,
      historical_hour_of_day: 19,
      sample_size: 5,
      timing_confidence: "high",
      timezone: "UTC",
      ...cadence
    },
    reason_codes: []
  };
}

function baseVariant(
  destination: FormattedPlatformVariant["destination"],
  patch: Partial<FormattedPlatformVariant> = {}
): FormattedPlatformVariant {
  return {
    destination,
    title: destination === "x" || destination === "bluesky" ? null : "Original title",
    bodyText: destination === "bluesky" ? null : "Original body",
    postText: destination === "x" || destination === "bluesky" ? "Original post text" : null,
    tags: [],
    platformFields: {},
    advice: { warnings: [] },
    ...patch
  };
}

function stubPrisma(): PrismaClient {
  return {
    creatorPostingGoal: {
      findUnique: vi.fn(async () => ({ monthlyPostTarget: 4, timezone: "UTC" }))
    },
    post: {
      count: vi.fn(async () => 1),
      findMany: vi.fn(async () => [])
    },
    postDistributionAttempt: {
      findMany: vi.fn(async () => [])
    }
  } as unknown as PrismaClient;
}

describe("coach attack review — propose shape", () => {
  it("returns per-destination variants with required fields and one Recommended", () => {
    const findings = buildCoachFindings({
      canonical,
      context: { goals: ["engagement_optimization", "format_optimization"] },
      factPack: stubFactPack()
    });

    for (const destination of ["x", "patreon"] as const) {
      const variants = buildDeterministicProposeVariants({
        pathId: "engage",
        destination,
        canonical,
        context: { goals: ["engagement_optimization", "format_optimization"] },
        findings
      });
      expect(variants.length).toBeGreaterThanOrEqual(2);
      expect(variants.filter((v) => v.recommended)).toHaveLength(1);
      for (const v of variants) {
        expect(v.id).toBeTruthy();
        expect(v.formula_id).toBeTruthy();
        expect(v.label.trim()).not.toBe("");
        expect(v.fit_reason.trim()).not.toBe("");
        expect(v.body_text.trim()).not.toBe("");
        if (destination === "x") expect(v.title).toBeNull();
      }
    }
  });

  it("normalizes propose JSON so exactly one variant is Recommended per destination", () => {
    const findings = buildCoachFindings({
      canonical,
      context: { goals: ["new_audience_testing", "engagement_optimization"] },
      factPack: stubFactPack({
        historical_hour_of_day: null,
        sample_size: 0,
        timing_confidence: "low"
      })
    });
    const parsed = parseCoachProposeAiOutput(
      JSON.stringify({
        by_destination: {
          x: {
            variants: [
              {
                formula_id: "cold_scroll_explain",
                recommended: true,
                label: "A",
                fit_reason: "a",
                title: null,
                body_text: "one"
              },
              {
                formula_id: "hook_proof_cta",
                recommended: true,
                label: "B",
                fit_reason: "b",
                title: null,
                body_text: "two"
              }
            ]
          },
          patreon: {
            variants: [
              {
                formula_id: "cold_scroll_explain",
                recommended: false,
                label: "C",
                fit_reason: "c",
                title: "T",
                body_text: "three"
              },
              {
                formula_id: "hook_proof_cta",
                recommended: false,
                label: "D",
                fit_reason: "d",
                title: "U",
                body_text: "four"
              }
            ]
          }
        }
      }),
      {
        pathId: "reach",
        destinations: ["x", "patreon"],
        canonical,
        context: { goals: ["new_audience_testing", "engagement_optimization"] },
        findings
      }
    );
    expect(parsed?.x?.variants.filter((v) => v.recommended)).toHaveLength(1);
    expect(parsed?.patreon?.variants.filter((v) => v.recommended)).toHaveLength(1);
  });

  it("omits destinations that were not requested (non-Coach skip at propose parse)", () => {
    const findings = buildCoachFindings({
      canonical,
      context: { goals: ["engagement_optimization", "format_optimization"] },
      factPack: stubFactPack({
        historical_hour_of_day: null,
        sample_size: 0,
        timing_confidence: "low"
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
                label: "X",
                fit_reason: "f",
                title: null,
                body_text: "x body"
              }
            ]
          },
          bluesky: {
            variants: [
              {
                formula_id: "hook_proof_cta",
                recommended: true,
                label: "B",
                fit_reason: "f",
                title: null,
                body_text: "should omit"
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
    expect(parsed?.x?.variants).toHaveLength(1);
    expect(parsed?.bluesky).toBeUndefined();
  });
});

describe("coach attack review — accepted copy lock", () => {
  beforeEach(() => {
    vi.mocked(isPostingAssistantAllowedForCreator).mockResolvedValue(true);
    vi.mocked(generateText).mockClear();
  });

  it("locks accepted copy on Coach destinations and skips rewrite LLM", async () => {
    const prisma = stubPrisma();
    const variants = [baseVariant("x"), baseVariant("patreon"), baseVariant("bluesky")];
    const result = await applyPostingAssistantToVariants(
      prisma,
      "creator_1",
      variants,
      {
        goals: ["engagement_optimization", "format_optimization"],
        accepted_copy_by_destination: {
          x: {
            title: null,
            body_text: "Locked X copy",
            formula_id: "hook_proof_cta",
            variant_id: "x__hook_proof_cta"
          },
          patreon: {
            title: "Locked Patreon title",
            body_text: "Locked Patreon body",
            formula_id: "format_first_line"
          }
        }
      },
      new Set(["x", "patreon"])
    );

    expect(result.assistantMode).toBe("completed_accepted");
    expect(result.assistantPlan.accepted_lock).toBe(true);
    expect(result.assistantPlan.rewrite_applied).toBe(true);
    expect(generateText).not.toHaveBeenCalled();

    const x = result.variants.find((v) => v.destination === "x");
    const patreon = result.variants.find((v) => v.destination === "patreon");
    const bluesky = result.variants.find((v) => v.destination === "bluesky");

    expect(x?.postText).toBe("Locked X copy");
    expect(x?.advice.coach_edited).toBe(true);
    expect(patreon?.title).toBe("Locked Patreon title");
    expect(patreon?.bodyText).toBe("Locked Patreon body");
    // Non-Coach destination is left untouched (not in enabled set).
    expect(bluesky?.postText).toBe("Original post text");
    expect(bluesky?.advice.coach_edited).toBeUndefined();
  });

  it("does not apply accepted copy to destinations outside the Coach-enabled set", async () => {
    const prisma = stubPrisma();
    const variants = [baseVariant("x"), baseVariant("patreon")];
    const result = await applyPostingAssistantToVariants(
      prisma,
      "creator_1",
      variants,
      {
        goals: ["engagement_optimization"],
        accepted_copy_by_destination: {
          x: { body_text: "Should apply" },
          patreon: { title: "No", body_text: "Should NOT apply — Coach off for Patreon" }
        }
      },
      new Set(["x"])
    );

    expect(result.variants.find((v) => v.destination === "x")?.postText).toBe("Should apply");
    expect(result.variants.find((v) => v.destination === "patreon")?.bodyText).toBe("Original body");
    expect(result.variants.find((v) => v.destination === "patreon")?.title).toBe("Original title");
  });
});
