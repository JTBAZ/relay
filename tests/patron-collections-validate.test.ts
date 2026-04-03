import { describe, expect, it } from "vitest";
import type { CanonicalSnapshot } from "../src/ingest/canonical-store.js";
import { validatePatronCollectionEntry } from "../src/gallery/patron-collections-validate.js";

function snap(): CanonicalSnapshot {
  return {
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
            title: "t",
            published_at: "2026-01-01T00:00:00Z",
            tag_ids: [],
            tier_ids: [],
            media_ids: ["m1", "m2"],
            ingested_at: "2026-01-01T00:00:00Z"
          },
          versions: []
        }
      }
    },
    media: {
      c1: {
        m1: {
          media_id: "m1",
          creator_id: "c1",
          post_ids: ["p1"],
          upstream_status: "active",
          current: {
            version_seq: 1,
            upstream_revision: "r",
            ingested_at: "2026-01-01T00:00:00Z"
          },
          versions: []
        },
        m2: {
          media_id: "m2",
          creator_id: "c1",
          post_ids: ["p1"],
          upstream_status: "active",
          current: {
            version_seq: 1,
            upstream_revision: "r",
            ingested_at: "2026-01-01T00:00:00Z"
          },
          versions: []
        }
      }
    }
  };
}

describe("validatePatronCollectionEntry", () => {
  it("accepts linked post+media", () => {
    const v = validatePatronCollectionEntry(snap(), "c1", "p1", "m1");
    expect(v.ok).toBe(true);
  });

  it("rejects wrong post for media", () => {
    const v = validatePatronCollectionEntry(snap(), "c1", "p_wrong", "m1");
    expect(v.ok).toBe(false);
  });
});
