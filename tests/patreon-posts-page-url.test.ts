/**
 * Contract for OAuth campaign posts list URL. When changing fields[post], review
 * mapPatreonPostToIngest and cookie scrape. OAuth includes supported embed metadata;
 * rich images/attachments use www /api/posts (see patreon-resource-api postsPageUrl).
 *
 * Live comparison vs www cookie API: scripts/inspect-patreon-post-content.mjs
 */
import { describe, expect, it } from "vitest";
import { postsPageUrl } from "../src/patreon/patreon-resource-api.js";

describe("postsPageUrl (OAuth campaign posts list)", () => {
  it("requests supported metadata, including embeds consumed by the mapper", () => {
    const url = postsPageUrl("15782831");
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/api/oauth2/v2/campaigns/15782831/posts");
    expect(parsed.searchParams.get("page[count]")).toBe("25");
    expect(parsed.searchParams.get("fields[post]")).toBe(
      "title,content,published_at,is_public,is_paid,tiers,embed_url,embed_data"
    );
  });

  it("preserves the pagination cursor and reapplies the explicit fieldset", () => {
    const next =
      "https://www.patreon.com/api/oauth2/v2/campaigns/9/posts?page%5Bcursor%5D=abc";
    expect(new URL(postsPageUrl("9", next)).searchParams.get("page[cursor]")).toBe("abc");
    expect(new URL(postsPageUrl("9", next)).searchParams.get("fields[post]")).toContain("embed_data");
  });
});
