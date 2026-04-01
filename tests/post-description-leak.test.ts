import { describe, expect, it } from "vitest";
import { mapCookiePostToIngest } from "../src/patreon/cookie-scraper.js";
import { mapPatreonPostToIngest } from "../src/patreon/map-patreon-to-ingest.js";
import { flattenProseMirrorDoc, normalizePatreonPostContent } from "../src/patreon/post-content.js";
import type { JsonApiResource } from "../src/patreon/jsonapi-types.js";
import { applySyncBatchToSnapshot } from "../src/ingest/apply-batch.js";
import { validateIngestBatchBody } from "../src/ingest/validate-body.js";
import { InMemoryEventBus } from "../src/events/event-bus.js";
import type { CanonicalSnapshot } from "../src/ingest/canonical-store.js";

const emptyIncluded = new Map<string, JsonApiResource>();

function postResource(
  id: string,
  attributes: Record<string, unknown>,
  relationships?: JsonApiResource["relationships"]
): JsonApiResource {
  return {
    type: "post",
    id,
    attributes,
    relationships
  };
}

/**
 * Locates where post body text can be lost:
 * 1) Patreon attributes.content not a string → mapping yields no description
 * 2) Empty / missing content → undefined (expected)
 * 3) Ingest / canonical preserve description when mapper produced one
 */
describe("Post description leak diagnosis", () => {
  const gateHtml =
    '<p>Teaser</p><p data-type="paid">Paid access starts here</p><p>Can you read this?</p>';

  it("cookie mapper: string HTML content → description includes paid body text", () => {
    const r = postResource("154428469", {
      title: "Test post 7",
      content: gateHtml,
      published_at: "2026-03-31T17:02:44.000+00:00",
      edited_at: "2026-03-31T17:02:44.000+00:00"
    });
    const p = mapCookiePostToIngest(r, emptyIncluded);
    expect(p.description).toBeDefined();
    expect(p.description).toContain("Can you read this?");
  });

  it("cookie mapper: empty string content → description undefined (upstream sent nothing)", () => {
    const r = postResource("1", {
      title: "T",
      content: "",
      published_at: "2026-01-01T00:00:00.000+00:00"
    });
    expect(mapCookiePostToIngest(r, emptyIncluded).description).toBeUndefined();
  });

  it("cookie mapper: null content → treated as empty (strAttr only accepts strings)", () => {
    const r = postResource("1", {
      title: "T",
      content: null,
      published_at: "2026-01-01T00:00:00.000+00:00"
    });
    expect(mapCookiePostToIngest(r, emptyIncluded).description).toBeUndefined();
  });

  it("cookie mapper: object content with html/body key → description preserved", () => {
    const html = "<p>Can you read this?</p>";
    expect(
      mapCookiePostToIngest(
        postResource("1", {
          title: "T",
          content: { html },
          published_at: "2026-01-01T00:00:00.000+00:00"
        }),
        emptyIncluded
      ).description
    ).toContain("Can you read this?");
  });

  it("cookie mapper: Quill delta content → description extracted", () => {
    const r = postResource("1", {
      title: "T",
      content: { delta: [{ insert: "Can you read this?\n" }] },
      published_at: "2026-01-01T00:00:00.000+00:00"
    });
    const p = mapCookiePostToIngest(r, emptyIncluded);
    expect(p.description).toBeDefined();
    expect(p.description).toContain("Can you read this?");
  });

  it("cookie mapper: Quill ops content → description extracted", () => {
    const r = postResource("1", {
      title: "T",
      content: { ops: [{ insert: "Line one\n" }, { insert: "Line two\n" }] },
      published_at: "2026-01-01T00:00:00.000+00:00"
    });
    const p = mapCookiePostToIngest(r, emptyIncluded);
    expect(p.description).toBeDefined();
    expect(p.description).toContain("Line one");
    expect(p.description).toContain("Line two");
  });

  it("cookie mapper: delta with only whitespace inserts → description undefined", () => {
    const r = postResource("1", {
      title: "T",
      content: { delta: [{ insert: "\n\n" }] },
      published_at: "2026-01-01T00:00:00.000+00:00"
    });
    expect(mapCookiePostToIngest(r, emptyIncluded).description).toBeUndefined();
  });

  it("cookie mapper: opaque object without known keys → still dropped", () => {
    const r = postResource("1", {
      title: "T",
      content: { unknownFormat: 42 },
      published_at: "2026-01-01T00:00:00.000+00:00"
    });
    expect(mapCookiePostToIngest(r, emptyIncluded).description).toBeUndefined();
  });

  it("normalizePatreonPostContent handles nested content string", () => {
    expect(
      normalizePatreonPostContent({
        content: { html: "<span>nested</span>" }
      })
    ).toContain("nested");
  });

  it("OAuth mapPatreonPostToIngest: same string vs non-string content behavior", () => {
    const rich = postResource("1", {
      title: "T",
      content: gateHtml,
      published_at: "2026-01-01T00:00:00.000+00:00"
    });
    expect(mapPatreonPostToIngest(rich).description).toContain("Can you read this?");

    const noBody = postResource("2", {
      title: "T",
      content: "",
      published_at: "2026-01-01T00:00:00.000+00:00"
    });
    expect(mapPatreonPostToIngest(noBody).description).toBeUndefined();

    const objectBody = postResource("3", {
      title: "T",
      content: { foo: "bar" },
      published_at: "2026-01-01T00:00:00.000+00:00"
    });
    expect(mapPatreonPostToIngest(objectBody).description).toBeUndefined();

    const deltaBody = postResource("4", {
      title: "T",
      content: { delta: [{ insert: "delta text\n" }] },
      published_at: "2026-01-01T00:00:00.000+00:00"
    });
    expect(mapPatreonPostToIngest(deltaBody).description).toContain("delta text");
  });

  it("validate + apply-batch: description is stored on canonical when present", () => {
    const raw = {
      creator_id: "c1",
      posts: [
        {
          post_id: "p1",
          title: "Test post 7",
          description: gateHtml,
          published_at: "2026-03-31T17:02:44.000+00:00",
          tag_ids: [],
          tier_ids: [],
          upstream_revision: "rev1",
          media: []
        }
      ]
    };
    const parsed = validateIngestBatchBody(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const snap: CanonicalSnapshot = {
      ingest_idempotency: {},
      campaigns: {},
      tiers: {},
      posts: {},
      media: {}
    };
    const bus = new InMemoryEventBus();
    applySyncBatchToSnapshot(snap, parsed.batch, "job", "trace", bus);

    const row = snap.posts.c1?.p1;
    expect(row?.current.description).toContain("Can you read this?");
  });

  it("cookie mapper: content null + content_json_string ProseMirror → description extracted", () => {
    const proseMirror = JSON.stringify({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Can you read this?" }] }
      ]
    });
    const r = postResource("154428469", {
      title: "Test post 7",
      content: null,
      content_json_string: proseMirror,
      published_at: "2026-03-31T17:02:44.000+00:00"
    });
    const p = mapCookiePostToIngest(r, emptyIncluded);
    expect(p.description).toBeDefined();
    expect(p.description).toContain("Can you read this?");
  });

  it("cookie mapper: content null + empty content_json_string → description undefined", () => {
    const r = postResource("1", {
      title: "T",
      content: null,
      content_json_string: JSON.stringify({ type: "doc", content: [] }),
      published_at: "2026-01-01T00:00:00.000+00:00"
    });
    expect(mapCookiePostToIngest(r, emptyIncluded).description).toBeUndefined();
  });

  it("OAuth mapper: content_json_string fallback when content null", () => {
    const r = postResource("1", {
      title: "T",
      content: null,
      content_json_string: JSON.stringify({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "oauth prose" }] }]
      }),
      published_at: "2026-01-01T00:00:00.000+00:00"
    });
    const p = mapPatreonPostToIngest(r);
    expect(p.description).toBeDefined();
    expect(p.description).toContain("oauth prose");
  });

  it("flattenProseMirrorDoc: handles string input (JSON parse)", () => {
    const json = JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }]
    });
    expect(flattenProseMirrorDoc(json)).toContain("hello");
  });

  it("flattenProseMirrorDoc: handles pre-parsed object", () => {
    const obj = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "world" }] }]
    };
    expect(flattenProseMirrorDoc(obj)).toContain("world");
  });

  it("flattenProseMirrorDoc: multi-paragraph doc", () => {
    const obj = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Line 1" }] },
        { type: "paragraph", content: [{ type: "text", text: "Line 2" }] }
      ]
    };
    const result = flattenProseMirrorDoc(obj);
    expect(result).toContain("Line 1");
    expect(result).toContain("Line 2");
  });

  it("flattenProseMirrorDoc: empty doc → empty string", () => {
    expect(flattenProseMirrorDoc({ type: "doc", content: [] })).toBe("");
  });

  it("flattenProseMirrorDoc: null / undefined → empty string", () => {
    expect(flattenProseMirrorDoc(null)).toBe("");
    expect(flattenProseMirrorDoc(undefined)).toBe("");
  });

  it("validate: omits description when whitespace-only", () => {
    const raw = {
      creator_id: "c1",
      posts: [
        {
          post_id: "p1",
          title: "T",
          description: "   \n",
          published_at: "2026-01-01T00:00:00.000+00:00",
          tag_ids: [],
          tier_ids: [],
          upstream_revision: "rev1",
          media: []
        }
      ]
    };
    const parsed = validateIngestBatchBody(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.batch.posts?.[0]?.description).toBeUndefined();
  });
});
