import { describe, expect, it } from "vitest";
import { InMemoryEventBus } from "../src/events/event-bus.js";
import { applySyncBatchToSnapshot } from "../src/ingest/apply-batch.js";
import type { CanonicalSnapshot } from "../src/ingest/canonical-store.js";
import type { SyncBatchInput } from "../src/ingest/types.js";

function emptySnapshot(): CanonicalSnapshot {
  return {
    ingest_idempotency: {},
    campaigns: {},
    tiers: {},
    posts: {},
    media: {}
  };
}

function sampleBatch(): SyncBatchInput {
  return {
    creator_id: "creator_1",
    campaigns: [
      {
        campaign_id: "camp_1",
        name: "Main",
        upstream_updated_at: "2026-04-01T12:00:00.000Z"
      }
    ],
    tiers: [
      {
        tier_id: "tier_gold",
        title: "Gold",
        campaign_id: "camp_1",
        upstream_updated_at: "2026-04-01T12:00:00.000Z"
      }
    ],
    posts: [
      {
        post_id: "post_1",
        title: "Episode 1",
        published_at: "2026-04-02T12:00:00.000Z",
        tag_ids: ["t1"],
        tier_ids: ["tier_gold"],
        upstream_revision: "rev_1",
        media: [
          {
            media_id: "media_1",
            mime_type: "image/png",
            upstream_revision: "mrev_a"
          }
        ]
      }
    ]
  };
}

describe("applySyncBatchToSnapshot idempotency (MIG-32)", () => {
  it("second identical batch skips campaign, tier, and post without duplicating media or events", () => {
    const snap = emptySnapshot();
    const bus = new InMemoryEventBus();
    const batch = sampleBatch();

    const first = applySyncBatchToSnapshot(snap, batch, "job1", "trace1", bus);
    expect(first.campaigns_upserted).toBe(1);
    expect(first.tiers_upserted).toBe(1);
    expect(first.posts_written).toBe(1);
    expect(first.media_upserted).toBe(1);
    expect(first.idempotent_skips).toBe(0);

    const second = applySyncBatchToSnapshot(snap, batch, "job2", "trace2", bus);
    expect(second.campaigns_upserted).toBe(0);
    expect(second.tiers_upserted).toBe(0);
    expect(second.posts_written).toBe(0);
    expect(second.media_upserted).toBe(0);
    expect(second.idempotent_skips).toBe(3);

    const post = snap.posts.creator_1!.post_1!;
    expect(post.versions.length).toBe(1);
    expect(bus.getAll().filter((e) => e.event_name === "post_published").length).toBe(1);
  });

  it("many sequential replays keep a stable single version and one post_published", () => {
    const snap = emptySnapshot();
    const bus = new InMemoryEventBus();
    const batch = sampleBatch();
    applySyncBatchToSnapshot(snap, batch, "j0", "t0", bus);
    const vlen = snap.posts.creator_1!.post_1!.versions.length;

    for (let i = 0; i < 40; i++) {
      const r = applySyncBatchToSnapshot(snap, batch, `j${i}`, `t${i}`, bus);
      expect(r.posts_written).toBe(0);
      expect(r.idempotent_skips).toBe(3);
    }

    expect(snap.posts.creator_1!.post_1!.versions.length).toBe(vlen);
    expect(bus.getAll().filter((e) => e.event_name === "post_published").length).toBe(1);
  });

  it("new post upstream_revision appends a version and emits another post_published", () => {
    const snap = emptySnapshot();
    const bus = new InMemoryEventBus();
    const b1 = sampleBatch();
    applySyncBatchToSnapshot(snap, b1, "j1", "t1", bus);

    const b2: SyncBatchInput = {
      creator_id: "creator_1",
      posts: [
        {
          ...b1.posts![0]!,
          upstream_revision: "rev_2",
          title: "Episode 1 (edited)"
        }
      ]
    };
    const r = applySyncBatchToSnapshot(snap, b2, "j2", "t2", bus);
    expect(r.posts_written).toBe(1);
    expect(snap.posts.creator_1!.post_1!.versions.length).toBe(2);
    expect(bus.getAll().filter((e) => e.event_name === "post_published").length).toBe(2);
  });
});
