import { describe, expect, it } from "vitest";
import type { JsonApiResource } from "../src/patreon/jsonapi-types.js";
import { mapPatreonPostToIngest } from "../src/patreon/map-patreon-to-ingest.js";

function postResource(
  id: string,
  attrs: Record<string, unknown>,
  relationships?: JsonApiResource["relationships"]
): JsonApiResource {
  return {
    type: "post",
    id,
    attributes: attrs,
    ...(relationships ? { relationships } : {})
  };
}

describe("mapPatreonPostToIngest media extraction", () => {
  const baseTime = "2026-04-15T12:00:00.000Z";

  it("plain paragraph only → 0 media (matches OAuth list text-only content)", () => {
    const r = postResource("154342894", {
      title: "Test 1 - Single, Free",
      published_at: baseTime,
      content: "<p>test description </p>",
      is_public: true,
      is_paid: false
    });
    const p = mapPatreonPostToIngest(r);
    expect(p.media).toHaveLength(0);
  });

  it("img src in content → at least one media item", () => {
    const r = postResource("111", {
      title: "Sketch",
      published_at: baseTime,
      content:
        '<p>Hi</p><img src="https://cdn.example.com/art.png?token=abc" alt="x" />',
      is_public: true,
      is_paid: false
    });
    const p = mapPatreonPostToIngest(r);
    expect(p.media.length).toBeGreaterThanOrEqual(1);
    expect(p.media.some((m) => (m.upstream_url ?? "").includes("cdn.example.com"))).toBe(true);
  });

  it("embed_url → media includes that URL", () => {
    const embed = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    const r = postResource("112", {
      title: "Embed",
      published_at: baseTime,
      content: "<p>x</p>",
      embed_url: embed,
      is_public: true,
      is_paid: false
    });
    const p = mapPatreonPostToIngest(r);
    expect(p.media.some((m) => m.upstream_url === embed)).toBe(true);
  });

  it("embed_data thumbnail_url → media", () => {
    const thumb = "https://img.example.com/thumb.jpg";
    const r = postResource("113", {
      title: "Embed data",
      published_at: baseTime,
      content: "<p>x</p>",
      embed_data: { thumbnail_url: thumb },
      is_public: true,
      is_paid: false
    });
    const p = mapPatreonPostToIngest(r);
    expect(p.media.some((m) => m.upstream_url === thumb)).toBe(true);
  });

  it("patreonusercontent.com URL in HTML text without img tag → media via CDN regex", () => {
    const cdn =
      "https://c10.patreonusercontent.com/4/patreon-media/p/123/abc.png?token=def";
    const r = postResource("114", {
      title: "CDN inline",
      published_at: baseTime,
      content: `<p>See ${cdn} here</p>`,
      is_public: true,
      is_paid: false
    });
    const p = mapPatreonPostToIngest(r);
    expect(
      p.media.some((m) => (m.upstream_url ?? "").includes("patreonusercontent.com"))
    ).toBe(true);
  });

  it.todo("data-src lazy-loading attributes are not extracted yet (img src only)");
});
