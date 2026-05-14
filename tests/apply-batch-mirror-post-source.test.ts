import { describe, expect, it } from "vitest";
import type { CanonicalSnapshot } from "../src/ingest/canonical-store.js";
import { applySyncBatchToSnapshot } from "../src/ingest/apply-batch.js";
import { InMemoryEventBus } from "../src/events/event-bus.js";

function emptySnap(): CanonicalSnapshot {
  return { ingest_idempotency: {}, campaigns: {}, tiers: {}, posts: {}, media: {} };
}

describe("applySyncBatchToSnapshot mirrored post.source", () => {
  it("tags substar_post_ rows as SUBSCRIBESTAR", () => {
    const snap = emptySnap();
    const bus = new InMemoryEventBus();
    applySyncBatchToSnapshot(
      snap,
      {
        creator_id: "c1",
        posts: [
          {
            post_id: "substar_post_1",
            title: "S",
            published_at: "2026-01-01T00:00:00.000Z",
            tag_ids: [],
            tier_ids: [],
            upstream_revision: "r1",
            media: []
          },
          {
            post_id: "patreon_post_99",
            title: "P",
            published_at: "2026-01-02T00:00:00.000Z",
            tag_ids: [],
            tier_ids: [],
            upstream_revision: "r2",
            media: []
          }
        ]
      },
      "job",
      "trace",
      bus
    );
    expect(snap.posts.c1?.["substar_post_1"]?.source).toBe("SUBSCRIBESTAR");
    expect(snap.posts.c1?.["patreon_post_99"]?.source).toBe("PATREON");
  });
});
