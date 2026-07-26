import { describe, expect, it } from "vitest";
import {
  detectPlatformPublishedUrl,
  parsePlatformPublishedUrl,
  platformAdapterCatalog,
  supportsPlatformIdentityLinking
} from "../src/analytics/platform-identity-adapters.js";

describe("parsePlatformPublishedUrl", () => {
  it("parses Patreon post URLs with numeric id", () => {
    const match = parsePlatformPublishedUrl(
      "patreon",
      "https://www.patreon.com/posts/my-title-123456789"
    );
    expect(match).toMatchObject({
      destination: "patreon",
      external_id: "123456789",
      confidence: "high"
    });
    expect(match?.canonical_url).toBe("https://www.patreon.com/posts/my-title-123456789");
  });

  it("parses X status URLs from twitter.com", () => {
    const match = parsePlatformPublishedUrl("x", "https://twitter.com/artist/status/9876543210");
    expect(match).toMatchObject({
      destination: "x",
      external_id: "9876543210",
      canonical_url: "https://x.com/artist/status/9876543210"
    });
  });

  it("parses DeviantArt art URLs with slug id", () => {
    const match = parsePlatformPublishedUrl(
      "deviantart",
      "https://www.deviantart.com/artist/art/My-Art-123456789"
    );
    expect(match).toMatchObject({
      destination: "deviantart",
      external_id: "123456789"
    });
  });

  it("rejects compose/draft Patreon URLs", () => {
    expect(parsePlatformPublishedUrl("patreon", "https://www.patreon.com/posts/new")).toBeNull();
  });

  it("returns null for instagram (research only)", () => {
    expect(
      parsePlatformPublishedUrl("instagram", "https://www.instagram.com/p/ABC123/")
    ).toBeNull();
  });
});

describe("detectPlatformPublishedUrl", () => {
  it("detects destination from mixed URL", () => {
    const match = detectPlatformPublishedUrl("https://x.com/foo/status/111");
    expect(match?.destination).toBe("x");
  });
});

describe("platformAdapterCatalog", () => {
  it("marks instagram as research_only without linking", () => {
    const instagram = platformAdapterCatalog().find((row) => row.destination === "instagram");
    expect(instagram?.linking).toBe("research_only");
    expect(supportsPlatformIdentityLinking("instagram")).toBe(false);
  });

  it("enables linking for patreon, x, and deviantart", () => {
    expect(supportsPlatformIdentityLinking("patreon")).toBe(true);
    expect(supportsPlatformIdentityLinking("twitter")).toBe(true);
    expect(supportsPlatformIdentityLinking("deviantart")).toBe(true);
  });
});
