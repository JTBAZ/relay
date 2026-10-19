import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canAccessPost } from "../src/clone/tier-rules.js";
import { InMemoryEventBus } from "../src/events/event-bus.js";
import { applySyncBatchToSnapshot } from "../src/ingest/apply-batch.js";
import { FileCanonicalStore, type CanonicalSnapshot } from "../src/ingest/canonical-store.js";
import { ingestIdempotencyKey } from "../src/ingest/idempotency.js";
import { IngestService } from "../src/ingest/ingest-service.js";
import type { IngestTier, SyncBatchInput } from "../src/ingest/types.js";
import { RELAY_TIER_ALL_PATRONS } from "../src/patreon/relay-access-tiers.js";

const tier = (id: string, amount: number): IngestTier => ({
  tier_id: id, title: id, amount_cents: amount, campaign_id: "camp1", upstream_updated_at: "2026-10-01T00:00:00Z"
});
const a = tier("patreon_tier_a", 1000);
const b = tier("patreon_tier_b", 100);
const free = tier("patreon_tier_free", 0);

function batch(tiers: IngestTier[], revision = "r1"): SyncBatchInput {
  return {
    creator_id: "c1",
    campaigns: [{ campaign_id: "camp1", name: "Main", upstream_updated_at: "2026-10-01T00:00:00Z" }],
    tiers,
    posts: [{ post_id: "p1", title: revision, published_at: "2026-10-01T00:00:00Z", tag_ids: [],
      tier_ids: [RELAY_TIER_ALL_PATRONS], upstream_revision: revision,
      media: [{ media_id: "m1", upstream_revision: "m1" }] }]
  };
}

async function fixture(legacy = false) {
  const root = await mkdtemp(join(tmpdir(), "relay-all-paid-"));
  const path = join(root, "canonical.json");
  const store = new FileCanonicalStore(path);
  const bus = new InMemoryEventBus();
  if (legacy) {
    const snapshot: CanonicalSnapshot = { ingest_idempotency: {}, campaigns: {}, tiers: {}, posts: {}, media: {} };
    const input = batch([a, free], "r1:tier_expand");
    input.posts![0]!.tier_ids = [a.tier_id];
    applySyncBatchToSnapshot(snapshot, input, "legacy", "trace", bus);
    await store.save(snapshot);
  }
  return { root, path, store, bus, ingest: new IngestService(store, bus) };
}

describe("all-paid expanded replay", () => {
  it("admits a newly added cheaper paid tier under the same provider revision exactly once", async () => {
    const f = await fixture();
    try {
      await f.ingest.runBatch(batch([a, free]), "trace");
      const result = await f.ingest.runBatch(batch([a, b, free]), "trace");
      const snapshot = await f.store.load();
      const post = snapshot.posts.c1!.p1!;
      expect(result).toMatchObject({ posts_written: 1, events_emitted: 1, media_upserted: 0 });
      expect(post.current.tier_ids).toEqual([a.tier_id, b.tier_id]);
      expect(post.versions).toHaveLength(2);
      expect(canAccessPost({ level: "tier_gated", tier_ids: post.current.tier_ids }, [b.tier_id], snapshot.tiers.c1)).toBe(true);
      expect(canAccessPost({ level: "tier_gated", tier_ids: post.current.tier_ids }, [free.tier_id], snapshot.tiers.c1)).toBe(false);
      expect(f.bus.getAll()).toHaveLength(2);
      expect(f.bus.getAll()[1]!.payload.tier_ids).toEqual([a.tier_id, b.tier_id]);
      const before = await readFile(f.path, "utf8");
      const replay = await new IngestService(new FileCanonicalStore(f.path), f.bus).runBatch(batch([b, a, a, free]), "trace");
      expect(replay).toMatchObject({ posts_written: 0, events_emitted: 0 });
      expect(await readFile(f.path, "utf8")).toBe(before);
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });

  it("keeps unchanged legacy suffixes, content and markers without republishing on rollout", async () => {
    const f = await fixture(true);
    try {
      const before = await readFile(f.path, "utf8");
      const input = batch([free, a, a]);
      input.posts![0]!.title = "Duplicate content must not overwrite the legacy post";
      const result = await f.ingest.runBatch(input, "trace");
      expect(result).toMatchObject({ posts_written: 0, events_emitted: 0 });
      expect(await readFile(f.path, "utf8")).toBe(before);
      expect((await f.store.load()).posts.c1!.p1!.current.upstream_revision).toBe("r1:tier_expand");
      expect(f.bus.getAll()).toHaveLength(1);
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });

  it("updates legacy access and permits narrowing and returning to a previously seen set", async () => {
    const f = await fixture(true);
    try {
      const legacyMarkers = (await f.store.load()).ingest_idempotency;
      for (const tiers of [[a, b, free], [a, free], [b, a, free]]) {
        expect(await f.ingest.runBatch(batch(tiers), "trace")).toMatchObject({ posts_written: 1, events_emitted: 1 });
        const snapshot = await f.store.load();
        expect(snapshot.posts.c1!.p1!.current.tier_ids.includes(b.tier_id)).toBe(tiers.includes(b));
        expect(canAccessPost({ level: "tier_gated", tier_ids: snapshot.posts.c1!.p1!.current.tier_ids }, [b.tier_id], snapshot.tiers.c1)).toBe(tiers.includes(b));
        expect(snapshot.ingest_idempotency).toMatchObject(legacyMarkers);
      }
      const snapshot = await f.store.load();
      expect(snapshot.posts.c1!.p1!.versions).toHaveLength(4);
      expect(f.bus.getAll()).toHaveLength(4);
      expect(await f.ingest.runBatch(batch([a, b, free]), "trace")).toMatchObject({ posts_written: 0, events_emitted: 0 });
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });

  it.each([false, true])("does not let an older provider revision overwrite a newer post (legacy=%s)", async (legacy) => {
    const f = await fixture(legacy);
    try {
      if (!legacy) await f.ingest.runBatch(batch([a, free]), "trace");
      await f.ingest.runBatch(batch([a, b, free], "r2"), "trace");
      const c = tier("patreon_tier_c", 50);
      const result = await f.ingest.runBatch(batch([a, b, c, free], "r1"), "trace");
      expect(result).toMatchObject({ posts_written: 0, events_emitted: 0 });
      const post = (await f.store.load()).posts.c1!.p1!;
      expect(post.current.title).toBe("r2");
      expect(post.current.tier_ids).toEqual([a.tier_id, b.tier_id]);
      expect(post.versions).toHaveLength(2);
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });

  it("accepts changed access once when the same post appears twice in a batch", async () => {
    const f = await fixture();
    try {
      await f.ingest.runBatch(batch([a]), "trace");
      const input = batch([a, b]);
      // Two deliveries of the same provider revision, with equivalent all-paid inputs.
      input.posts!.push(structuredClone(input.posts![0]!));
      expect(await f.ingest.runBatch(input, "trace")).toMatchObject({ posts_written: 1, events_emitted: 1 });
      expect((await f.store.load()).posts.c1!.p1!.versions).toHaveLength(2);
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });

  it("keeps creator boundaries and tier-only batches unchanged", async () => {
    const f = await fixture(true);
    try {
      await f.ingest.runBatch({ creator_id: "c1", tiers: [b] }, "trace");
      const before = (await f.store.load()).posts.c1;
      const foreign = batch([a, b]);
      foreign.creator_id = "c2";
      expect(await f.ingest.runBatch(foreign, "trace")).toMatchObject({ posts_written: 1 });
      expect((await f.store.load()).posts.c1).toEqual(before);
      expect((await f.store.load()).posts.c2!.p1!.current.tier_ids).toEqual([a.tier_id, b.tier_id]);
      const legacyKey = ingestIdempotencyKey(["ingest_post", "c1", "p1", "r1:tier_expand"]);
      expect((await f.store.load()).ingest_idempotency[legacyKey]).toBeDefined();
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });
});
