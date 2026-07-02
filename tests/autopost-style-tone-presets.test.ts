import { describe, expect, it } from "vitest";
import {
  buildVoiceScript,
  getStyleTonePreset,
  isStyleTonePresetId
} from "../src/autopost/style-tone-presets.js";

describe("style-tone-presets", () => {
  it("recognizes preset ids", () => {
    expect(isStyleTonePresetId("friendly")).toBe(true);
    expect(isStyleTonePresetId("none")).toBe(true);
    expect(isStyleTonePresetId("made-up")).toBe(false);
  });

  it("builds a voice script from preset + user prompt", () => {
    const script = buildVoiceScript({
      tonePreset: "warm",
      userPrompt: "Mention this is a WIP for the forest series."
    });
    expect(script).toContain("Voice:");
    expect(script).toContain("Artist notes to convey:");
    expect(script).toContain("forest series");
  });

  it("returns empty voice script for none tone", () => {
    expect(buildVoiceScript({ tonePreset: "none" })).toBe("");
    expect(getStyleTonePreset("none").sample).toBe("");
  });
});
