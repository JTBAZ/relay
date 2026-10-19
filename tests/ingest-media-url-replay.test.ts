import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { InMemoryEventBus } from "../src/events/event-bus.js";
import { FileExportIndex } from "../src/export/export-index.js";
import { ExportService } from "../src/export/export-service.js";
import { applySyncBatchToSnapshot } from "../src/ingest/apply-batch.js";
import { FileCanonicalStore, type CanonicalSnapshot } from "../src/ingest/canonical-store.js";
import { IngestService } from "../src/ingest/ingest-service.js";
import type { SyncBatchInput } from "../src/ingest/types.js";

function emptySnapshot(): CanonicalSnapshot {
  return { ingest_idempotency: {}, campaigns: {}, tiers: {}, posts: {}, media: {} };
}

function batch(postId = "p1", mediaRevision = "m1", url = "https://cdn.example/m1"): SyncBatchInput {
  return {
    creator_id: "c1",
    posts: [{
      post_id: postId,
      upstream_revision: "r1",
      title: "Original title",
      published_at: "2026-10-01T00:00:00.000Z",
      tag_ids: ["tag1"],
      tier_ids: [],
      media: [{ media_id: "asset1", upstream_revision: mediaRevision, upstream_url: url }]
    }]
  };
}

function apply(snapshot: CanonicalSnapshot, input: SyncBatchInput, bus = new InMemoryEventBus()) {
  return applySyncBatchToSnapshot(snapshot, input, "job", "trace", bus);
}

describe("ingest media URL replay", () => {
  it("keeps old version URLs intact and ignores old media URLs on a new post", () => {
    const snapshot = emptySnapshot();
    apply(snapshot, batch());
    apply(snapshot, batch("p2", "m2", "https://cdn.example/m2"));
    const result = apply(snapshot, batch("p3", "m1", "https://cdn.example/stale-m1"));

    const media = snapshot.media.c1!.asset1!;
    expect(media.current).toMatchObject({ upstream_revision: "m2", upstream_url: "https://cdn.example/m2" });
    expect(media.versions.map((v) => v.upstream_url)).toEqual(["https://cdn.example/m1", "https://cdn.example/m2"]);
    expect(media.post_ids).toEqual(["p1", "p2", "p3"]);
    expect(result).toMatchObject({ posts_written: 1, media_upserted: 0, events_emitted: 1 });
  });

  it("refreshes only the associated current media URL on a duplicate post", () => {
    let snapshot = emptySnapshot();
    const bus = new InMemoryEventBus();
    apply(snapshot, batch(), bus);
    const other = batch("p2");
    other.posts![0]!.media[0]!.media_id = "other-asset";
    apply(snapshot, other, bus);
    // Store reloads separate current metadata from the historical version object.
    snapshot = JSON.parse(JSON.stringify(snapshot)) as CanonicalSnapshot;
    snapshot.media.c1!.asset1!.current.storage_key = "existing/blob";
    const expected = structuredClone(snapshot);
    expected.media.c1!.asset1!.current.upstream_url = "https://cdn.example/refreshed";
    const replay = batch("p1", "m1", "https://cdn.example/refreshed");
    Object.assign(replay.posts![0]!, { title: "Changed title", tier_ids: ["new-tier"], tag_ids: [] });
    Object.assign(replay.posts![0]!.media[0]!, { storage_key: "replacement/blob", mime_type: "video/mp4", role: "cover" });
    replay.posts![0]!.media.push(
      ...other.posts![0]!.media,
      { media_id: "new-asset", upstream_revision: "m1", upstream_url: "https://cdn.example/new" },
      { media_id: "asset1", upstream_revision: "m3", upstream_url: "https://cdn.example/m3" }
    );

    const result = apply(snapshot, replay, bus);

    expect(snapshot).toEqual(expected);
    expect(result).toMatchObject({ posts_written: 0, media_upserted: 0, events_emitted: 0, idempotent_skips: 1 });
    expect(bus.getAll()).toHaveLength(2);
  });

  it("still refreshes a matching media revision when importing a new post", () => {
    const snapshot = emptySnapshot();
    const bus = new InMemoryEventBus();
    apply(snapshot, batch(), bus);
    const result = apply(snapshot, batch("p2", "m1", "https://cdn.example/refreshed"), bus);
    expect(snapshot.media.c1!.asset1!.current.upstream_url).toBe("https://cdn.example/refreshed");
    expect(snapshot.media.c1!.asset1!.versions).toHaveLength(1);
    expect(snapshot.media.c1!.asset1!.post_ids).toEqual(["p1", "p2"]);
    expect(result).toMatchObject({ posts_written: 1, media_upserted: 0, events_emitted: 1 });
    expect(bus.getAll()).toHaveLength(2);
  });

  it.each(["m1", "m3"])("does not replace current m2 with duplicate-post media revision %s", (revision) => {
    const snapshot = emptySnapshot();
    apply(snapshot, batch());
    apply(snapshot, batch("p2", "m2", "https://cdn.example/m2"));
    const expected = structuredClone(snapshot);
    apply(snapshot, batch("p1", revision, "https://cdn.example/wrong"));
    expect(snapshot).toEqual(expected);
  });

  it.each([undefined, "", "   "])("does not clear the current URL with %s", (url) => {
    const snapshot = emptySnapshot();
    apply(snapshot, batch());
    const replay = batch();
    replay.posts![0]!.media[0]!.upstream_url = url;
    apply(snapshot, replay);
    apply(snapshot, { ...replay, posts: [{ ...replay.posts![0]!, post_id: "p2" }] });
    expect(snapshot.media.c1!.asset1!.current.upstream_url).toBe("https://cdn.example/m1");
  });

  it("does not restore deleted posts or media when refreshing a URL", () => {
    const snapshot = emptySnapshot();
    apply(snapshot, batch());
    snapshot.posts.c1!.p1!.upstream_status = "deleted";
    snapshot.media.c1!.asset1!.upstream_status = "deleted";
    const result = apply(snapshot, batch("p1", "m1", "https://cdn.example/refreshed"));
    expect(snapshot.posts.c1!.p1!.upstream_status).toBe("deleted");
    expect(snapshot.media.c1!.asset1!.upstream_status).toBe("deleted");
    expect(result).toMatchObject({ posts_written: 0, media_upserted: 0, events_emitted: 0 });
  });

  it.each(["post", "media"])("does not recreate a missing %s on replay", (missing) => {
    const snapshot = emptySnapshot();
    apply(snapshot, batch());
    if (missing === "post") delete snapshot.posts.c1!.p1;
    else delete snapshot.media.c1!.asset1;
    const expected = structuredClone(snapshot);
    apply(snapshot, batch("p1", "m1", "https://cdn.example/refreshed"));
    expect(snapshot).toEqual(expected);
  });

  it("keeps refreshes inside the owning creator", () => {
    const snapshot = emptySnapshot();
    apply(snapshot, batch());
    apply(snapshot, { ...batch("p1", "m1", "https://cdn.example/c2"), creator_id: "c2" });
    const otherCreator = structuredClone(snapshot.media.c2);
    apply(snapshot, batch("p1", "m1", "https://cdn.example/c1-refreshed"));
    expect(snapshot.media.c1!.asset1!.current.upstream_url).toBe("https://cdn.example/c1-refreshed");
    expect(snapshot.media.c2).toEqual(otherCreator);
  });

  it.each(["old revision", "duplicate refresh"])("exports the right bytes after %s and a file-store reload", async (scenario) => {
    const root = await mkdtemp(join(tmpdir(), "relay-ingest-url-"));
    try {
      const store = new FileCanonicalStore(join(root, "canonical.json"));
      const bus = new InMemoryEventBus();
      const ingest = new IngestService(store, bus);
      await ingest.runBatch(batch(), "trace");
      const oldRevision = scenario === "old revision";
      if (oldRevision) await ingest.runBatch(batch("p2", "m2", "https://cdn.example/m2"), "trace");
      const expectedUrl = oldRevision ? "https://cdn.example/m2" : "https://cdn.example/refreshed";
      const result = await ingest.runBatch(
        oldRevision ? batch("p3", "m1", "https://cdn.example/stale-m1") : batch("p1", "m1", expectedUrl),
        "trace"
      );
      expect(result).toMatchObject({ media_upserted: 0, posts_written: oldRevision ? 1 : 0, events_emitted: oldRevision ? 1 : 0 });
      const reloaded = await store.load();
      expect(reloaded.media.c1!.asset1!.current.upstream_url).toBe(expectedUrl);
      expect(reloaded.media.c1!.asset1!.versions).toHaveLength(oldRevision ? 2 : 1);
      expect(bus.getAll()).toHaveLength(oldRevision ? 3 : 1);

      const payload = Buffer.from(oldRevision ? "m2 bytes" : "refreshed m1 bytes");
      const fetchImpl = vi.fn(async (url: string | URL | Request) =>
        new Response(String(url) === expectedUrl ? payload : null, { status: String(url) === expectedUrl ? 200 : 403 })
      );
      const exportRoot = join(root, "exports");
      const exportIndex = new FileExportIndex(exportRoot);
      const exporter = new ExportService(store, exportIndex, exportRoot, fetchImpl);
      const exported = await exporter.exportMedia("c1", "asset1");

      expect(exported.idempotent_skip).toBe(false);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(fetchImpl.mock.calls[0]![0]).toBe(expectedUrl);
      expect(await readFile(join(exportRoot, "c1", "media", "asset1", "asset"))).toEqual(payload);
      expect((await exportIndex.load("c1")).media.asset1!.upstream_revision).toBe(oldRevision ? "m2" : "m1");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
