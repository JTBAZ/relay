import { describe, expect, it } from "vitest";
import { buildAutopostDraftAiFacts } from "../src/autopost/autopost-draft-ai.js";
import type { CreatorStyleProfileWire } from "../src/autopost/style-profile-service.js";

const styleProfile = {
  creator_id: "cr1",
  profile_id: "sp1",
  label: "Default",
  voice_script: "Warm and concise",
  tone_preset: "warm",
  user_prompt: null,
  updated_at: "2026-07-11T12:00:00.000Z"
} as CreatorStyleProfileWire;

describe("buildAutopostDraftAiFacts", () => {
  it("includes studio brief and mounted findings without inventing metrics", () => {
    const facts = buildAutopostDraftAiFacts({
      styleProfile,
      mediaCaptions: ["sketch caption"],
      titleHint: "Morning study",
      draft_intent: "Lead with the finding about hooks",
      studio_brief: {
        goals: ["engagement_optimization"],
        user_notes: "Keep grounded",
        locale: "en-US",
        trend_note: null
      },
      mounted_report: {
        post_id: "post-1",
        path_id: "engage",
        finding_labels: ["Hooks convert better"],
        reason_codes: ["PERF_HISTORY"],
        updated_at: "2026-07-11T12:00:00.000Z"
      }
    });

    expect(facts.draft_intent).toBe("Lead with the finding about hooks");
    expect(facts.studio_brief).toEqual({
      goals: ["engagement_optimization"],
      user_notes: "Keep grounded",
      locale: "en-US",
      trend_note: null
    });
    expect(facts.mounted_findings).toEqual({
      post_id: "post-1",
      path_id: "engage",
      finding_labels: ["Hooks convert better"],
      reason_codes: ["PERF_HISTORY"]
    });
    expect(facts).not.toHaveProperty("fact_pack");
  });

  it("omits brief and findings when absent", () => {
    const facts = buildAutopostDraftAiFacts({
      styleProfile,
      mediaCaptions: []
    });
    expect(facts.studio_brief).toBeNull();
    expect(facts.mounted_findings).toBeNull();
    expect(facts.draft_intent).toBeNull();
  });
});
