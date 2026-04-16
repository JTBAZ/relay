/**
 * Golden JSON under tests/fixtures/patreon/ — stable references for OAuth list vs www cookie payloads.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mapCookiePostToIngest } from "../src/patreon/cookie-scraper.js";
import type { JsonApiDocument } from "../src/patreon/jsonapi-types.js";
import { mapPatreonPostToIngest } from "../src/patreon/map-patreon-to-ingest.js";
import { indexIncluded } from "../src/patreon/patreon-resource-api.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("fixtures/patreon golden payloads", () => {
  it("oauth-list-post-text-only: mapper yields no media", () => {
    const doc = JSON.parse(
      readFileSync(join(__dirname, "fixtures/patreon/oauth-list-post-text-only.json"), "utf8")
    ) as JsonApiDocument;
    const raw = doc.data;
    const post = Array.isArray(raw) ? raw[0] : raw;
    if (!post || post.type !== "post") throw new Error("fixture: expected one post");
    const p = mapPatreonPostToIngest(post);
    expect(p.post_id).toBe("patreon_post_154342894");
    expect(p.media).toHaveLength(0);
  });

  it("cookie-list-with-media: mapper yields media from included + relationships", () => {
    const doc = JSON.parse(
      readFileSync(join(__dirname, "fixtures/patreon/cookie-list-with-media.json"), "utf8")
    ) as JsonApiDocument;
    const raw = doc.data;
    const post = Array.isArray(raw) ? raw[0] : raw;
    if (!post || post.type !== "post") throw new Error("fixture: expected one post");
    const inc = indexIncluded(doc);
    const p = mapCookiePostToIngest(post, inc);
    expect(p.media.length).toBeGreaterThanOrEqual(1);
    expect(
      p.media.some((m) => (m.upstream_url ?? "").includes("cdn.fixture.example"))
    ).toBe(true);
  });
});
