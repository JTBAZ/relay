import { describe, expect, it } from "vitest";
import { searchLibrary, type CommandLibraryItem } from "../../../src/studio/command/selection.js";
import type { GalleryItem } from "../../../src/gallery/types.js";

function item(overrides: Partial<CommandLibraryItem> = {}): CommandLibraryItem {
  const base: GalleryItem = {
    media_id: overrides.media_id ?? "media_1",
    post_id: overrides.post_id ?? "post_1",
    title: overrides.title ?? "Standalone study",
    published_at: overrides.published_at ?? "2026-03-01T00:00:00.000Z",
    tag_ids: overrides.tag_ids ?? [],
    tier_ids: [],
    has_export: true,
    processing_status: "READY",
    export_status: "ready",
    content_url_path: "/x",
    preview_url_path: "/p",
    thumb_url_path: "/t",
    visibility: overrides.visibility ?? "visible",
    collection_ids: overrides.collection_ids ?? [],
    collection_theme_tag_ids: [],
    distribution_summary: overrides.distribution_summary,
    member_label: overrides.member_label
  };
  return { ...base, ...overrides };
}

const watercolor = item({
  post_id: "post_watercolor",
  media_id: "media_watercolor",
  title: "River watercolor",
  tag_ids: ["tag_watercolor"],
  published_at: "2026-04-01T00:00:00.000Z"
});

const landscape = item({
  post_id: "post_landscape",
  media_id: "media_landscape",
  title: "Mountain landscape",
  tag_ids: ["tag_landscape"],
  published_at: "2025-06-01T00:00:00.000Z"
});

const heroPage1 = item({
  post_id: "post_ha_1",
  media_id: "media_ha_1",
  title: "Hero Academy Page 1",
  collection_ids: ["col_ha"],
  published_at: "2026-01-01T00:00:00.000Z",
  distribution_summary: {
    post_id: "post_ha_1",
    destinations: [
      {
        destination: "x",
        variant_status: "ready",
        attempt_status: "posted",
        attempt_id: "att_x_1",
        external_url: "https://x.com/s/1",
        external_id: "x1"
      }
    ]
  }
});

const heroPage7 = item({
  post_id: "post_ha_7",
  media_id: "media_ha_7",
  title: "Hero Academy Page 7",
  collection_ids: ["col_ha"],
  published_at: "2026-02-01T00:00:00.000Z",
  distribution_summary: {
    post_id: "post_ha_7",
    destinations: [
      {
        destination: "x",
        variant_status: null,
        attempt_status: null,
        attempt_id: null,
        external_url: null,
        external_id: null
      }
    ]
  }
});

const catalog = [watercolor, landscape, heroPage1, heroPage7];

describe("search_library selection grammar (RC-P1-T03)", () => {
  it("matches watercolor tag_ids exactly (AND) and ignores landscape", () => {
    const { selection, records } = searchLibrary(catalog, { tag_ids: ["tag_watercolor"] });
    expect(selection.post_ids).toEqual(["post_watercolor"]);
    expect(selection.explanation).toContain("tag_ids=tag_watercolor");
    expect(records[0]?.tag_ids).toEqual(["tag_watercolor"]);
    expect(records[0]).not.toHaveProperty("content_url_path");
  });

  it("filters a date range on published_at", () => {
    const { selection } = searchLibrary(catalog, {
      date_from: "2026-01-01T00:00:00.000Z",
      date_to: "2026-12-31T23:59:59.000Z"
    });
    expect(selection.post_ids.sort()).toEqual(
      ["post_ha_1", "post_ha_7", "post_watercolor"].sort()
    );
    expect(selection.post_ids).not.toContain("post_landscape");
  });

  it("excludes posts already posted on X via destination_absent", () => {
    const { selection, records } = searchLibrary(catalog, {
      title_pattern: "Hero Academy*",
      destination_absent: ["x"]
    });
    expect(selection.post_ids).toEqual(["post_ha_7"]);
    expect(records[0]?.destination_flags.x).toBeUndefined();
    expect(selection.explanation).toContain("destination_absent=x");
  });

  it("keeps already-on-X via destination_present", () => {
    const { selection, records } = searchLibrary(catalog, { destination_present: ["x"] });
    expect(selection.post_ids).toEqual(["post_ha_1"]);
    expect(records[0]?.destination_flags.x).toBe(true);
  });

  it("applies title_contains, exclude_post_ids, and collection_id", () => {
    const { selection } = searchLibrary(catalog, {
      title_contains: "Hero Academy",
      collection_id: "col_ha",
      exclude_post_ids: ["post_ha_1"]
    });
    expect(selection.post_ids).toEqual(["post_ha_7"]);
  });

  it("reuses free-text AND tokens from gallery search", () => {
    const { selection } = searchLibrary(catalog, { q: "watercolor river" });
    expect(selection.post_ids).toEqual(["post_watercolor"]);
    const miss = searchLibrary(catalog, { q: "watercolor landscape" });
    expect(miss.selection.post_ids).toEqual([]);
  });

  it("collapses extra media rows to one compact post record and fills page_number", () => {
    const extra = item({
      post_id: "post_ha_7",
      media_id: "media_ha_7b",
      title: "Hero Academy Page 7",
      collection_ids: ["col_ha"],
      published_at: "2026-02-01T00:00:00.000Z"
    });
    const { selection, records } = searchLibrary([heroPage7, extra], {
      title_contains: "Hero Academy"
    });
    expect(selection.post_ids).toEqual(["post_ha_7"]);
    expect(selection.warnings[0]).toMatch(/collapsed 1 extra media/);
    expect(records[0]?.page_number).toBe(7);
  });
});

describe("search_library boolean AST and predicates (RC-P5-T03)", () => {
  it("ORs tags via any while preserving flat AND watercolor", () => {
    const { selection } = searchLibrary(catalog, {
      any: [{ tag_ids: ["tag_watercolor"] }, { tag_ids: ["tag_landscape"] }]
    });
    expect(selection.post_ids.sort()).toEqual(["post_landscape", "post_watercolor"].sort());
    const andWatercolor = searchLibrary(catalog, { tag_ids: ["tag_watercolor"] });
    expect(andWatercolor.selection.post_ids).toEqual(["post_watercolor"]);
  });

  it("excludes via not", () => {
    const { selection } = searchLibrary(catalog, {
      title_contains: "Hero Academy",
      not: [{ destination_present: ["x"] }]
    });
    expect(selection.post_ids).toEqual(["post_ha_7"]);
  });

  it("matches description_contains, tier_ids OR, and media_type prefix", () => {
    const river = item({
      post_id: "post_desc",
      media_id: "media_desc",
      title: "Study",
      description: "A misty <b>watercolor</b> river at dusk",
      tag_ids: [],
      tier_ids: ["tier_patrons"],
      mime_type: "image/png",
      published_at: "2026-07-01T00:00:00.000Z"
    });
    const video = item({
      post_id: "post_video",
      media_id: "media_video",
      title: "Clip",
      mime_type: "video/mp4",
      tier_ids: ["tier_free"],
      published_at: "2026-07-02T00:00:00.000Z"
    });
    const rows = [river, video];
    expect(searchLibrary(rows, { description_contains: "watercolor river" }).selection.post_ids).toEqual([
      "post_desc"
    ]);
    expect(
      searchLibrary(rows, { tier_ids: ["tier_patrons", "tier_missing"] }).selection.post_ids
    ).toEqual(["post_desc"]);
    expect(searchLibrary(rows, { media_type: "image/" }).selection.post_ids).toEqual(["post_desc"]);
    expect(searchLibrary(rows, { media_type: "video/" }).selection.post_ids).toEqual(["post_video"]);
  });

  it("filters publish_state, creative_work_id, and text-only rows", () => {
    const published = item({
      post_id: "post_pub",
      media_id: "media_pub",
      title: "Live",
      publish_state: "published",
      creative_work_id: "cw_1"
    });
    const draft = item({
      post_id: "post_draft",
      media_id: "media_draft",
      title: "WIP",
      publish_state: "draft",
      creative_work_id: "cw_2",
      published_at: "2026-08-01T00:00:00.000Z"
    });
    const textOnly = item({
      post_id: "post_text",
      media_id: "post_only_post_text",
      title: "Caption only",
      published_at: "2026-08-02T00:00:00.000Z"
    });
    const rows = [published, draft, textOnly];
    expect(searchLibrary(rows, { publish_state: "draft" }).selection.post_ids).toEqual(["post_draft"]);
    expect(searchLibrary(rows, { creative_work_id: "cw_1" }).selection.post_ids).toEqual(["post_pub"]);
    expect(searchLibrary(rows, { text_only_posts: "only" }).selection.post_ids).toEqual(["post_text"]);
    expect(searchLibrary(rows, { text_only_posts: "exclude" }).selection.post_ids.sort()).toEqual(
      ["post_draft", "post_pub"].sort()
    );
  });
});
