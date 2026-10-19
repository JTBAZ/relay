import { describe, expect, it } from "vitest";
import { InMemoryEventBus } from "../src/events/event-bus.js";
import { buildGalleryItems } from "../src/gallery/query.js";
import { applySyncBatchToSnapshot } from "../src/ingest/apply-batch.js";
import type { CanonicalSnapshot } from "../src/ingest/canonical-store.js";
import type { IngestTombstone, SyncBatchInput } from "../src/ingest/types.js";
import { validateIngestBatchBody } from "../src/ingest/validate-body.js";

const deletedAt = "2026-10-01T12:00:00.000Z";

function emptySnapshot(): CanonicalSnapshot {
  return { ingest_idempotency: {}, campaigns: {}, tiers: {}, posts: {}, media: {} };
}

function postBatch(revision = "r1"): SyncBatchInput {
  return {
    creator_id: "c1",
    posts: [{
      post_id: "p1", upstream_revision: revision, title: "Original", published_at: deletedAt,
      tag_ids: [], tier_ids: [], media: [{ media_id: "m1", upstream_revision: revision, mime_type: "image/png" }]
    }]
  };
}

function deletionBatch(entityType: IngestTombstone["entity_type"], time = deletedAt): SyncBatchInput {
  return { creator_id: "c1", tombstones: [{ entity_type: entityType, id: entityType === "post" ? "p1" : "m1", deleted_at: time }] };
}

function apply(snapshot: CanonicalSnapshot, input: SyncBatchInput, bus = new InMemoryEventBus()) {
  return applySyncBatchToSnapshot(snapshot, input, "job", "trace", bus);
}

describe("deletion input identity", () => {
  it.each([
    undefined, null, 123, "", "   ", "not-a-date", "2026-10-01", "2026-10-01T12:00:00",
    "2026-02-30T12:00:00Z", "2026-10-01T24:00:00Z", "2026-10-01T12:00:00.0001Z"
  ])("rejects unusable deleted_at %s", (value) => {
    const parsed = validateIngestBatchBody({
      creator_id: "c1", tombstones: [{ entity_type: "post", id: "p1", deleted_at: value }]
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.details[0]!.field).toBe("tombstones[0].deleted_at");
  });

  it("normalizes equivalent timezone-aware timestamps to the same deletion identity", () => {
    for (const value of ["2026-10-01T12:00:00Z", "2026-10-01T14:00:00+02:00", ` ${deletedAt} `]) {
      const parsed = validateIngestBatchBody(deletionBatch("post", value));
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.batch.tombstones![0]!.deleted_at).toBe(deletedAt);
    }
  });
});

describe("deletion replay", () => {
  it.each(["post", "media"] as const)("does not delete a restored %s on retry, but accepts a distinct deletion", (entityType) => {
    const snapshot = emptySnapshot();
    const bus = new InMemoryEventBus();
    apply(snapshot, postBatch(), bus);
    const oldMarkers = structuredClone(snapshot.ingest_idempotency);
    const first = apply(snapshot, deletionBatch(entityType), bus);
    expect(first).toMatchObject({ tombstones_applied: 1, idempotent_skips: 0, events_emitted: 0 });
    expect(snapshot.ingest_idempotency).toMatchObject(oldMarkers);
    expect(Object.keys(snapshot.ingest_idempotency)).toHaveLength(Object.keys(oldMarkers).length + 1);
    apply(snapshot, postBatch("r2"), bus);
    expect(snapshot.media.c1!.m1!.upstream_status).toBe("active");
    const restored = structuredClone(snapshot);
    const events = bus.getAll();

    const replay = apply(snapshot, deletionBatch(entityType), bus);

    expect(replay).toMatchObject({ tombstones_applied: 0, idempotent_skips: 1, posts_written: 0, media_upserted: 0, events_emitted: 0 });
    expect(snapshot).toEqual(restored);
    expect(bus.getAll()).toEqual(events);
    const gallery = buildGalleryItems("c1", snapshot, { creator_id: "c1", media: {} }, { creators: {} });
    expect(gallery.some((item) => item.media_id === "m1")).toBe(true);

    const later = deletionBatch(entityType, "2026-10-02T12:00:00.000Z");
    later.tombstones!.push(later.tombstones![0]!);
    const result = apply(snapshot, later, bus);
    expect(result).toMatchObject({ tombstones_applied: 1, idempotent_skips: 1 });
    expect(entityType === "post" ? snapshot.posts.c1!.p1!.upstream_status : snapshot.media.c1!.m1!.upstream_status).toBe("deleted");
  });

  it.each(["post", "media"] as const)("remembers absent %s targets across snapshot reloads", (entityType) => {
    let snapshot = emptySnapshot();
    const deletion = deletionBatch(entityType);
    apply(snapshot, deletion);
    snapshot = JSON.parse(JSON.stringify(snapshot)) as CanonicalSnapshot;
    apply(snapshot, postBatch());
    const expected = structuredClone(snapshot);
    const replay = apply(snapshot, deletion);
    expect(replay).toMatchObject({ tombstones_applied: 0, idempotent_skips: 1 });
    expect(snapshot).toEqual(expected);
  });

  it.each(["post", "media"] as const)("keeps a new %s deletion last within the same batch", (entityType) => {
    const snapshot = emptySnapshot();
    const result = apply(snapshot, { ...postBatch(), tombstones: deletionBatch(entityType).tombstones });
    expect(result).toMatchObject({ posts_written: 1, media_upserted: 1, tombstones_applied: 1 });
    expect(entityType === "post" ? snapshot.posts.c1!.p1!.upstream_status : snapshot.media.c1!.m1!.upstream_status).toBe("deleted");
  });

  it("separates creator, entity type, and delimiter-bearing identity fields", () => {
    const snapshot = emptySnapshot();
    const inputs: SyncBatchInput[] = [
      { creator_id: "c|post", tombstones: [{ entity_type: "post", id: "asset", deleted_at: deletedAt }] },
      { creator_id: "c", tombstones: [{ entity_type: "post", id: "post|asset", deleted_at: deletedAt }] },
      { creator_id: "c", tombstones: [{ entity_type: "media", id: "post|asset", deleted_at: deletedAt }] }
    ];
    for (const input of inputs) expect(apply(snapshot, input).tombstones_applied).toBe(1);
    expect(Object.keys(snapshot.ingest_idempotency)).toHaveLength(3);
    for (const input of inputs) expect(apply(snapshot, input)).toMatchObject({ tombstones_applied: 0, idempotent_skips: 1 });
  });
});
