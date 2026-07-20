import { describe, expect, it } from "vitest";
import {
  applyCoachRewriteToVariant,
  goalsRequestRewrite,
  parseAssistantAiOutput
} from "../src/distribution/posting-assistant-service.js";
import type { FormattedPlatformVariant } from "../src/distribution/platform-formatters.js";

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

describe("posting-assistant rewrite contract", () => {
  it("requests rewrite whenever any Coach goal is selected", () => {
    expect(goalsRequestRewrite([])).toBe(false);
    expect(goalsRequestRewrite(["engagement_optimization"])).toBe(true);
  });

  it("parses rationale + variants JSON", () => {
    const parsed = parseAssistantAiOutput(
      JSON.stringify({
        rationale: { x: "Short hook for X.", patreon: "Full caption for patrons." },
        timing_note: "Evening works for you.",
        variants: {
          x: { title: null, body_text: "Hook + link" },
          patreon: { title: "Patreon title", body_text: "Longer body" }
        }
      }),
      ["x", "patreon"]
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.rationale.x).toMatch(/X/);
    expect(parsed?.variants?.x?.body_text).toBe("Hook + link");
    expect(parsed?.variants?.patreon?.title).toBe("Patreon title");
  });

  it("rejects JSON without usable rationale", () => {
    expect(parseAssistantAiOutput("{}", ["x"])).toBeNull();
    expect(parseAssistantAiOutput("not-json", ["x"])).toBeNull();
  });

  it("applies rewrite to X post_text and marks coach_edited", () => {
    const next = applyCoachRewriteToVariant(
      baseVariant("x"),
      { title: null, body_text: "Rewritten for X" },
      {
        rationale: "Engagement hook.",
        suggestedTimeIso: "2026-07-10T23:00:00.000Z",
        timingNote: "Peak hour."
      }
    );
    expect(next.postText).toBe("Rewritten for X");
    expect(next.advice.coach_edited).toBe(true);
    expect(next.advice.rationale).toContain("Engagement hook.");
    expect(next.advice.rationale).toContain("Peak hour.");
    expect(next.advice.suggested_post_time).toBe("2026-07-10T23:00:00.000Z");
  });

  it("applies rewrite to Patreon title/body", () => {
    const next = applyCoachRewriteToVariant(
      baseVariant("patreon"),
      { title: "Coached title", body_text: "Coached body" },
      { rationale: "Patreon depth.", suggestedTimeIso: "2026-07-10T23:00:00.000Z", timingNote: null }
    );
    expect(next.title).toBe("Coached title");
    expect(next.bodyText).toBe("Coached body");
    expect(next.postText).toBeNull();
    expect(next.advice.coach_edited).toBe(true);
  });

  it("keeps original copy when rewrite is omitted (deterministic path)", () => {
    const original = baseVariant("deviantart");
    const next = applyCoachRewriteToVariant(original, undefined, {
      rationale: "Deterministic.",
      suggestedTimeIso: "2026-07-10T23:00:00.000Z",
      timingNote: null
    });
    expect(next.title).toBe(original.title);
    expect(next.bodyText).toBe(original.bodyText);
    expect(next.advice.coach_edited).toBeUndefined();
    expect(next.advice.rationale).toBe("Deterministic.");
  });
});
