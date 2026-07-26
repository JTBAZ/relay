import { describe, expect, it } from "vitest";
import {
  formatPlatformVariant,
  formatVariantsForDestinations
} from "../src/distribution/platform-formatters.js";

describe("distribution platform formatters", () => {
  const canonical = {
    title: "Sunset Study",
    bodyText: "A warm evening sketch with layered color.",
    tagLabels: ["#Digital Art", "landscape", "sunset"]
  };

  it("formats X as body plus normalized hashtags and compiled preview", () => {
    const variant = formatPlatformVariant("x", canonical);
    expect(variant.postText).toContain("warm evening sketch");
    expect(variant.tags).toEqual(["#digitalart", "#landscape", "#sunset"]);
    expect(variant.postText).toContain("#digitalart #landscape #sunset");
    expect(variant.title).toBeNull();
    expect(variant.bodyText).toBe(canonical.bodyText);
  });

  it("truncates X post text to the platform character limit", () => {
    const longTags = Array.from({ length: 40 }, (_, i) => `hashtagnumber${i}`);
    const long = formatPlatformVariant("x", {
      title: "T",
      bodyText: "Short body",
      tagLabels: longTags
    });
    expect(long.postText?.length).toBeLessThanOrEqual(280);
  });

  it("normalizes DeviantArt tags without hashtags and collapsed spaces", () => {
    const variant = formatPlatformVariant("deviantart", {
      ...canonical,
      tagLabels: ["Star Wars", "#Digital Art", "test tag"]
    });
    expect(variant.tags).toEqual(["starwars", "digitalart", "testtag"]);
    expect(variant.tags.every((t) => !t.includes("#"))).toBe(true);
    expect(variant.tags.every((t) => !t.includes(" "))).toBe(true);
  });

  it("caps DeviantArt tag count", () => {
    const tags = Array.from({ length: 40 }, (_, i) => `tag-${i}`);
    const variant = formatPlatformVariant("deviantart", {
      ...canonical,
      tagLabels: tags
    });
    expect(variant.tags.length).toBeLessThanOrEqual(30);
    expect(variant.tags.every((t) => !t.includes(" "))).toBe(true);
  });

  it("formats Patreon with title and body only", () => {
    const variant = formatPlatformVariant("patreon", canonical);
    expect(variant.title).toBe("Sunset Study");
    expect(variant.bodyText).toBe(canonical.bodyText);
    expect(variant.postText).toBeNull();
    expect(variant.tags).toEqual([]);
  });

  it("formats Bluesky post text from canonical copy", () => {
    const variant = formatPlatformVariant("bluesky", canonical);
    expect(variant.postText?.length).toBeGreaterThan(0);
    expect(variant.title).toBeNull();
  });

  it("batch formats requested destinations", () => {
    const variants = formatVariantsForDestinations(["x", "patreon"], canonical);
    expect(variants).toHaveLength(2);
    expect(variants.map((v) => v.destination)).toEqual(["x", "patreon"]);
  });
});
