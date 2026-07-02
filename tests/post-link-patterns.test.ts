import { describe, expect, it } from "vitest";
import {
  detectPublishedPostMatch,
  matchPublishedPostUrl,
  normalizePublishedPostUrl
} from "../extension/src/lib/post-link-patterns.js";

describe("post-link Patreon URL patterns", () => {
  it("matches creator vanity published URLs and extracts numeric external_id", () => {
    const raw = "https://www.patreon.com/RelayTEST/posts/test-162544992?pr=true";
    const match = matchPublishedPostUrl("patreon", raw);

    expect(match).not.toBeNull();
    expect(match?.external_id).toBe("162544992");
    expect(match?.canonical_url).toBe("https://www.patreon.com/RelayTEST/posts/test-162544992");
  });

  it("matches slug-with-extra-hyphens before the trailing numeric id", () => {
    const raw = "https://patreon.com/RelayTEST/posts/test-3-162539907";
    const match = matchPublishedPostUrl("patreon", raw);

    expect(match?.external_id).toBe("162539907");
    expect(match?.canonical_url).toBe("https://www.patreon.com/RelayTEST/posts/test-3-162539907");
  });

  it("still matches bare /posts/<slug>-<id> URLs", () => {
    const raw = "https://www.patreon.com/posts/test-162544992";
    const match = matchPublishedPostUrl("patreon", raw);

    expect(match?.external_id).toBe("162544992");
    expect(match?.canonical_url).toBe("https://www.patreon.com/posts/test-162544992");
  });

  it("rejects compose and edit URLs", () => {
    expect(matchPublishedPostUrl("patreon", "https://www.patreon.com/posts/new")).toBeNull();
    expect(
      matchPublishedPostUrl("patreon", "https://www.patreon.com/RelayTEST/posts/162544992/edit")
    ).toBeNull();
  });

  it("detects destination from pasted vanity Patreon URLs", () => {
    const match = detectPublishedPostMatch(
      "https://www.patreon.com/RelayTEST/posts/test-162544992?pr=true"
    );

    expect(match?.destination).toBe("patreon");
    expect(match?.external_id).toBe("162544992");
  });

  it("normalizes published Patreon URLs for storage", () => {
    const canonical = normalizePublishedPostUrl(
      "patreon",
      "https://www.patreon.com/RelayTEST/posts/test-162544992?pr=true&utm_source=relay"
    );

    expect(canonical).toBe("https://www.patreon.com/RelayTEST/posts/test-162544992");
  });
});
