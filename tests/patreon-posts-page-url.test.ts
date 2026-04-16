/**
 * Contract for OAuth campaign posts list URL. When changing fields[post], review
 * mapPatreonPostToIngest and cookie scrape — embed/media on OAuth list are intentionally
 * minimal; rich media uses www /api/posts (see patreon-resource-api postsPageUrl).
 *
 * Live comparison vs www cookie API: scripts/inspect-patreon-post-content.mjs
 */
import { describe, expect, it } from "vitest";
import { postsPageUrl } from "../src/patreon/patreon-resource-api.js";

describe("postsPageUrl (OAuth campaign posts list)", () => {
  it("uses sparse fields[post] without embed_url or embed_data (media from cookie path)", () => {
    const url = postsPageUrl("15782831");
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/api/oauth2/v2/campaigns/15782831/posts");
    expect(parsed.searchParams.get("page[count]")).toBe("25");
    expect(parsed.searchParams.get("fields[post]")).toBe(
      "title,content,published_at,is_public,is_paid,tiers"
    );
    expect(parsed.searchParams.get("fields[post]")).not.toMatch(/embed/);
  });

  it("returns next URL unchanged when provided (pagination)", () => {
    const next =
      "https://www.patreon.com/api/oauth2/v2/campaigns/9/posts?page%5Bcursor%5D=abc";
    expect(postsPageUrl("9", next)).toBe(next);
  });
});
