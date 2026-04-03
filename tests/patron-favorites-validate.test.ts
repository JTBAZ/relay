import { describe, expect, it } from "vitest";
import type { CanonicalSnapshot } from "../src/ingest/canonical-store.js";
import { validatePatronFavoriteTarget } from "../src/gallery/patron-favorites-validate.js";

function snap(partial: Partial<CanonicalSnapshot>): CanonicalSnapshot {
  return {
    ingest_idempotency: {},
    campaigns: {},
    tiers: {},
    posts: {},
    media: {},
    ...partial
  } as CanonicalSnapshot;
}

describe("validatePatronFavoriteTarget", () => {
  it("accepts active post and media", () => {
    const s = snap({
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
              media_ids: ["m1"],
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
          }
        }
      }
    });
    expect(validatePatronFavoriteTarget(s, "c1", "post", "p1").ok).toBe(true);
    expect(validatePatronFavoriteTarget(s, "c1", "media", "m1").ok).toBe(true);
  });

  it("rejects missing or deleted", () => {
    const s = snap({});
    expect(validatePatronFavoriteTarget(s, "c1", "post", "p1").ok).toBe(false);
    const s2 = snap({
      posts: {
        c1: {
          p1: {
            post_id: "p1",
            creator_id: "c1",
            upstream_status: "deleted",
            current: {
              version_seq: 1,
              upstream_revision: "r",
              title: "t",
              published_at: "2026-01-01T00:00:00Z",
              tag_ids: [],
              tier_ids: [],
              media_ids: [],
              ingested_at: "2026-01-01T00:00:00Z"
            },
            versions: []
          }
        }
      }
    });
    expect(validatePatronFavoriteTarget(s2, "c1", "post", "p1").ok).toBe(false);
  });
});
