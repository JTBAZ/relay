/**
 * Regression guard for library refinement (ingest dedupe, post-primary list, review visibility).
 * Run: npx vitest run library-refinement
 */
import { describe, expect, it } from "vitest";
import { mergeIngestMediaByNormalizedUrl } from "../src/patreon/merge-ingest-media.js";
import { normalizePatreonMediaUrl } from "../src/patreon/media-url-normalize.js";
import { galleryItemsPostPrimaryView } from "../src/gallery/query.js";
import type { GalleryItem } from "../src/gallery/types.js";
import { collapseDuplicateMediaIdsBySha } from "../src/gallery/media-sha-dedupe.js";
import type { CreatorExportIndex } from "../src/export/types.js";

describe("library refinement integration", () => {
  it("normalizes Patreon URLs and merges duplicate ingest rows", () => {
    const u1 = "https://c10.patreonusercontent.com/x.png?w=10";
    const u2 = "https://c10.patreonusercontent.com/x.png?w=99";
    expect(normalizePatreonMediaUrl(u1)).toBe(normalizePatreonMediaUrl(u2));
    const merged = mergeIngestMediaByNormalizedUrl([
      {
        media_id: "a",
        upstream_url: u1,
        upstream_revision: "r"
      },
      {
        media_id: "b",
        upstream_url: u2,
        upstream_revision: "r",
        role: "cover"
      }
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.role).toBe("cover");
  });

  it("galleryItemsPostPrimaryView keeps one item per post_id", () => {
    const items: GalleryItem[] = [
      {
        media_id: "m1",
        post_id: "p1",
        title: "T",
        published_at: "2026-01-02T00:00:00.000Z",
        tag_ids: [],
        tier_ids: [],
        has_export: false,
        export_status: "missing",
        content_url_path: "",
        visibility: "visible",
        collection_ids: [],
        collection_theme_tag_ids: []
      },
      {
        media_id: "m2",
        post_id: "p1",
        title: "T",
        published_at: "2026-01-02T00:00:00.000Z",
        tag_ids: [],
        tier_ids: [],
        has_export: true,
        export_status: "ready",
        mime_type: "image/png",
        content_url_path: "/x",
        visibility: "visible",
        collection_ids: [],
        collection_theme_tag_ids: []
      }
    ];
    const prim = galleryItemsPostPrimaryView(items);
    expect(prim).toHaveLength(1);
    expect(prim[0]!.media_id).toBe("m2");
  });

  it("collapseDuplicateMediaIdsBySha prefers non-cover", () => {
    const index: CreatorExportIndex = {
      creator_id: "c",
      media: {
        c1: {
          media_id: "c1",
          creator_id: "c",
          sha256: "s",
          byte_length: 1,
          relative_blob_path: "a",
          upstream_revision: "r",
          exported_at: "2026-01-01T00:00:00.000Z"
        },
        m1: {
          media_id: "m1",
          creator_id: "c",
          sha256: "s",
          byte_length: 1,
          relative_blob_path: "b",
          upstream_revision: "r",
          exported_at: "2026-01-01T00:00:00.000Z"
        }
      }
    };
    const out = collapseDuplicateMediaIdsBySha(["c1", "m1"], index, (id) =>
      id === "c1" ? "cover" : undefined
    );
    expect(out).toEqual(["m1"]);
  });
});
