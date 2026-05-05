import { describe, expect, it } from "vitest";

import { buildGalleryItems } from "../src/gallery/query.js";
import type { CanonicalSnapshot } from "../src/ingest/canonical-store.js";

describe("buildGalleryItems processing_status", () => {
  it("passes through snapshot processing_status and defaults to READY when omitted", () => {
    const snapshot: CanonicalSnapshot = {
      ingest_idempotency: {},
      campaigns: {},
      tiers: {},
      posts: {
        c1: {
          p1: {
            post_id: "p1",
            creator_id: "c1",
            current: {
              version_seq: 1,
              upstream_revision: "r1",
              title: "Hi",
              published_at: "2026-01-01T00:00:00.000Z",
              tag_ids: [],
              tier_ids: [],
              media_ids: ["rel_m1", "legacy_m2"],
              ingested_at: "2026-01-01T00:00:00.000Z"
            },
            versions: [],
            upstream_status: "active"
          }
        }
      },
      media: {
        c1: {
          rel_m1: {
            media_id: "rel_m1",
            creator_id: "c1",
            post_ids: ["p1"],
            upstream_status: "active",
            processing_status: "PENDING_UPLOAD",
            current: {
              version_seq: 1,
              upstream_revision: "relay:upload:pending",
              mime_type: "video/mp4",
              ingested_at: "2026-01-01T00:00:00.000Z"
            },
            versions: []
          },
          legacy_m2: {
            media_id: "legacy_m2",
            creator_id: "c1",
            post_ids: ["p1"],
            upstream_status: "active",
            current: {
              version_seq: 1,
              upstream_revision: "r",
              mime_type: "image/png",
              ingested_at: "2026-01-01T00:00:00.000Z"
            },
            versions: []
          }
        }
      }
    };

    const exportIndex = { creator_id: "c1", media: {} };
    const overrides = { creators: {} };

    const items = buildGalleryItems("c1", snapshot, exportIndex as never, overrides, []);
    const byId = new Map(items.map((i) => [i.media_id, i]));
    expect(byId.get("rel_m1")?.processing_status).toBe("PENDING_UPLOAD");
    expect(byId.get("legacy_m2")?.processing_status).toBe("READY");
  });
});
