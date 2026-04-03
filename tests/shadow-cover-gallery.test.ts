import { describe, expect, it } from "vitest";
import type { CanonicalSnapshot } from "../src/ingest/canonical-store.js";
import type { CreatorExportIndex } from "../src/export/types.js";
import { buildGalleryItems, galleryItemsPostPrimaryView } from "../src/gallery/query.js";
import type { GalleryOverridesRoot } from "../src/gallery/types.js";

const attachmentUrl =
  "https://c10.patreonusercontent.com/4/patreon-media/p/post/154428469/8df316d8ed50446e8fcb14e907b363e1/eyJhIjoxLCJwIjoxfQ%3D%3D/1.jpg?token-hash=a";
const coverUrl =
  "https://c10.patreonusercontent.com/4/patreon-media/p/post/154428469/8df316d8ed50446e8fcb14e907b363e1/eyJ3IjoxMDgwfQ%3D%3D/1.jpg?token-hash=b";

describe("shadow_cover gallery flags", () => {
  it("marks duplicate Patreon cover and prefers primary attachment for post_primary", () => {
    const snapshot: CanonicalSnapshot = {
      ingest_idempotency: {},
      campaigns: {},
      tiers: {},
      posts: {
        c1: {
          p1: {
            post_id: "p1",
            creator_id: "c1",
            upstream_status: "active",
            current: {
              version_seq: 1,
              upstream_revision: "r",
              title: "Test post 7",
              published_at: "2026-03-31T17:02:44.000+00:00",
              tag_ids: [],
              tier_ids: [],
              media_ids: ["patreon_media_638472852", "patreon_154428469_cover"],
              ingested_at: "2026-01-01T00:00:00.000Z"
            },
            versions: []
          }
        }
      },
      media: {
        c1: {
          patreon_media_638472852: {
            media_id: "patreon_media_638472852",
            creator_id: "c1",
            post_ids: ["p1"],
            upstream_status: "active",
            current: {
              version_seq: 1,
              upstream_revision: "m1",
              mime_type: "image/jpeg",
              upstream_url: attachmentUrl,
              ingested_at: "2026-01-01T00:00:00.000Z"
            },
            versions: []
          },
          patreon_154428469_cover: {
            media_id: "patreon_154428469_cover",
            creator_id: "c1",
            post_ids: ["p1"],
            upstream_status: "active",
            current: {
              version_seq: 1,
              upstream_revision: "c1",
              mime_type: "image/jpeg",
              upstream_url: coverUrl,
              role: "cover",
              ingested_at: "2026-01-01T00:00:00.000Z"
            },
            versions: []
          }
        }
      }
    };

    const exportIndex: CreatorExportIndex = { creator_id: "c1", media: {} };
    const overrides: GalleryOverridesRoot = { creators: {} };

    const items = buildGalleryItems("c1", snapshot, exportIndex, overrides, []);
    const coverRow = items.find((i) => i.media_id === "patreon_154428469_cover");
    const mainRow = items.find((i) => i.media_id === "patreon_media_638472852");
    expect(coverRow?.shadow_cover).toBe(true);
    expect(mainRow?.shadow_cover).toBeUndefined();

    const primary = galleryItemsPostPrimaryView(items);
    expect(primary).toHaveLength(1);
    expect(primary[0]!.media_id).toBe("patreon_media_638472852");
  });
});
