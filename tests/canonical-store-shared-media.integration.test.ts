import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InMemoryEventBus } from "../src/events/event-bus.js";
import { DbCanonicalStore } from "../src/ingest/canonical-store-db.js";
import { IngestService } from "../src/ingest/ingest-service.js";
import { applySyncBatchToSnapshot } from "../src/ingest/apply-batch.js";
import { ingestIdempotencyKey } from "../src/ingest/idempotency.js";
import type { IngestMediaItem, SyncBatchInput } from "../src/ingest/types.js";

// Same explicit disposable-database opt-in as the canonical concurrency suite.
const targetUrl = process.env.CANONICAL_STORE_TEST_DATABASE_URL;
const timestamp = "2026-10-01T00:00:00.000Z";

describe.skipIf(!targetUrl)("PS-04 shared media PostgreSQL persistence", () => {
  let db: PrismaClient;

  beforeAll(async () => {
    const target = new URL(targetUrl!);
    if (!["postgres:", "postgresql:"].includes(target.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || target.search !== "" ||
      !/^\/relay_ingest_test_[a-f0-9]{32}$/.test(target.pathname)) {
      throw new Error("Shared media tests require a dedicated loopback relay_ingest_test database");
    }
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: targetUrl! }) });
    await db.$connect();
  });

  afterAll(async () => { await db?.$disconnect(); });

  async function seed(source: "PATREON" | "SUBSCRIBESTAR") {
    const creatorId = `ps04_${randomUUID()}`;
    const campaignId = `campaign_${creatorId}`;
    const assetId = `asset_${creatorId}`;
    const prefix = source === "PATREON" ? "patreon_post_" : "substar_post_";
    const postId = (label: string) => `${prefix}${creatorId}_${label}`;
    const store = new DbCanonicalStore(db);
    const bus = new InMemoryEventBus();
    const service = new IngestService(store, bus);
    const batch = (label: string, revision: string, fields: Partial<IngestMediaItem> = {}): SyncBatchInput => ({
      creator_id: creatorId,
      campaigns: [{ campaign_id: campaignId, name: "Shared media fixture", upstream_updated_at: timestamp }],
      posts: [{ post_id: postId(label), upstream_revision: `post_${label}`, title: label,
        published_at: timestamp, tag_ids: [], tier_ids: [], media: [{ media_id: assetId,
          upstream_revision: revision, upstream_url: `https://cdn.fixture.example/${revision}.jpg`,
          mime_type: "image/jpeg", role: "attachment", ...fields }] }]
    });
    const original = batch("p1", "m1", { storage_key: "existing/blob.jpg" });
    await service.runBatch(original, "ps04-seed");
    const load = () => store.loadForCreator(creatorId);
    const media = async () => (await load()).media[creatorId]![assetId]!;
    return { creatorId, campaignId, assetId, postId, store, bus, service, batch, load, media };
  }

  describe.each(["PATREON", "SUBSCRIBESTAR"] as const)("%s", (source) => {
    it("persists fresh shared state, history, associations and replay markers without refreshing p1", async () => {
      const run = await seed(source);
      const fresh = run.batch("p2", "m2", { mime_type: "image/png", role: "cover" });
      expect(await run.service.runBatch(fresh, "ps04-fresh")).toMatchObject({ posts_written: 1, media_upserted: 1 });
      const marker = ingestIdempotencyKey(["ingest_media_rev", run.creatorId, run.assetId, "m2"]);
      const loaded = await run.load();
      const asset = loaded.media[run.creatorId]![run.assetId]!;
      expect(asset.current).toMatchObject({ upstream_revision: "m2", mime_type: "image/png", role: "cover", storage_key: "existing/blob.jpg" });
      expect(asset.versions.map((v) => v.upstream_revision)).toEqual(["m1", "m2"]);
      expect(asset.post_ids).toEqual([run.postId("p1"), run.postId("p2")]);
      expect(loaded.ingest_idempotency[marker]).toBeDefined();
      expect(loaded.posts[run.creatorId]![run.postId("p1")]!.versions).toHaveLength(1);

      const eventCount = run.bus.getAll().length;
      expect(await run.service.runBatch(fresh, "ps04-replay")).toMatchObject({ posts_written: 0, events_emitted: 0 });
      expect(run.bus.getAll()).toHaveLength(eventCount);
      await run.service.runBatch(run.batch("p3", "m2"), "ps04-reference");
      expect((await run.media()).versions).toHaveLength(2);
      expect((await run.media()).post_ids).toEqual([run.postId("p1"), run.postId("p2"), run.postId("p3")]);
    });

    it("rolls back content and markers on a real media-write failure, then retries", async () => {
      const run = await seed(source);
      const failing = run.batch("p2", "ps04-fail-m2");
      const marker = ingestIdempotencyKey(["ingest_media_rev", run.creatorId, run.assetId, "ps04-fail-m2"]);
      await db.$executeRaw`ALTER TABLE media_assets ADD CONSTRAINT ps04_reject_media_revision
        CHECK (current_upstream_revision <> 'ps04-fail-m2') NOT VALID`;
      try {
        await expect(run.service.runBatch(failing, "ps04-write-failure")).rejects.toThrow();
      } finally {
        await db.$executeRaw`ALTER TABLE media_assets DROP CONSTRAINT ps04_reject_media_revision`;
      }
      const loaded = await run.load();
      expect(loaded.posts[run.creatorId]![run.postId("p2")]).toBeUndefined();
      expect(loaded.ingest_idempotency[marker]).toBeUndefined();
      expect((await run.media()).current.upstream_revision).toBe("m1");
      expect(await run.service.runBatch(failing, "ps04-retry")).toMatchObject({ posts_written: 1, media_upserted: 1 });
      expect((await run.media()).current.upstream_revision).toBe("ps04-fail-m2");
    });

    it("keeps current-revision URL guards and deletion/reactivation rules across reload", async () => {
      const run = await seed(source);
      const fresh = run.batch("p2", "m2");
      await run.service.runBatch(fresh, "ps04-m2");
      await run.service.runBatch(run.batch("p2", "m2", { upstream_url: "https://cdn.fixture.example/renewed.jpg" }), "ps04-renew");
      expect((await run.media()).current.upstream_url).toBe("https://cdn.fixture.example/renewed.jpg");
      await run.service.runBatch(run.batch("p3", "m1", { upstream_url: "https://cdn.fixture.example/stale.jpg" }), "ps04-old");
      expect((await run.media()).current).toMatchObject({ upstream_revision: "m2", upstream_url: "https://cdn.fixture.example/renewed.jpg" });

      const deletion: SyncBatchInput = { creator_id: run.creatorId,
        tombstones: [{ entity_type: "media", id: run.assetId, deleted_at: "2026-10-02T00:00:00.000Z" }] };
      await run.service.runBatch(deletion, "ps04-delete");
      await run.service.runBatch(fresh, "ps04-deleted-replay");
      await run.service.runBatch(run.batch("p4", "m2"), "ps04-deleted-reference");
      expect((await run.media()).upstream_status).toBe("deleted");
      await run.service.runBatch(run.batch("p5", "m3"), "ps04-reactivate");
      expect((await run.media()).upstream_status).toBe("active");
      expect((await run.media()).versions.map((v) => v.upstream_revision)).toEqual(["m1", "m2", "m3"]);
      await run.service.runBatch(deletion, "ps04-old-deletion-replay");
      expect((await run.media()).upstream_status).toBe("active");
    });

    it("rolls back a fresh revision when the guarded media update loses its target", async () => {
      const run = await seed(source);
      const guarded = db.$extends({ query: { mediaAsset: {
        async updateMany({ args, query }) {
          return args.where?.id === run.assetId ? { count: 0 } : query(args);
        }
      } } });
      const service = new IngestService(new DbCanonicalStore(guarded as unknown as PrismaClient), run.bus);
      await expect(service.runBatch(run.batch("p2", "m2"), "ps04-guard-miss")).rejects.toThrow("retry the ingest batch");
      const loaded = await run.load();
      expect(loaded.posts[run.creatorId]![run.postId("p2")]).toBeUndefined();
      expect(loaded.ingest_idempotency[ingestIdempotencyKey(["ingest_media_rev", run.creatorId, run.assetId, "m2"])]).toBeUndefined();
      expect((await run.media()).current.upstream_revision).toBe("m1");
    });

    it("rejects stale snapshot saves that would mark an unsaved shared revision as processed", async () => {
      const run = await seed(source);
      const stale = await run.load();
      await run.service.runBatch(run.batch("p3", "m3"), "ps04-newer");
      applySyncBatchToSnapshot(stale, run.batch("p2", "m2"), "stale-job", "ps04-stale", new InMemoryEventBus());
      await expect(run.store.saveForCreator(run.creatorId, stale)).rejects.toThrow("retry the ingest batch");
      const loaded = await run.load();
      expect(loaded.posts[run.creatorId]![run.postId("p2")]).toBeUndefined();
      expect(loaded.posts[run.creatorId]![run.postId("p3")]).toBeDefined();
      expect(loaded.ingest_idempotency[ingestIdempotencyKey(["ingest_media_rev", run.creatorId, run.assetId, "m2"])]).toBeUndefined();
      expect((await run.media()).current.upstream_revision).toBe("m3");
    });

    it("retains both shared revisions when two creator imports overlap", async () => {
      const run = await seed(source);
      const second = new IngestService(new DbCanonicalStore(db), new InMemoryEventBus());
      await Promise.all([
        run.service.runBatch(run.batch("p2", "m2"), "ps04-overlap-1"),
        second.runBatch(run.batch("p3", "m3"), "ps04-overlap-2")
      ]);
      const asset = await run.media();
      expect(asset.versions.map((v) => v.upstream_revision).sort()).toEqual(["m1", "m2", "m3"]);
      expect(asset.versions.map((v) => v.version_seq)).toEqual([1, 2, 3]);
      expect(asset.current).toEqual(asset.versions[2]);
      expect(asset.post_ids).toEqual(expect.arrayContaining([run.postId("p1"), run.postId("p2"), run.postId("p3")]));
    });

    it("preserves Relay uploads, the other provider lane, and another creator", async () => {
      const run = await seed(source);
      const other = await seed(source === "PATREON" ? "SUBSCRIBESTAR" : "PATREON");
      const otherPrefix = source === "PATREON" ? "substar_post_" : "patreon_post_";
      const otherAsset = `other_lane_${run.creatorId}`;
      const otherLane = run.batch("other", "other-m1");
      otherLane.posts![0]!.post_id = `${otherPrefix}${run.creatorId}_other`;
      otherLane.posts![0]!.media[0]!.media_id = otherAsset;
      await run.service.runBatch(otherLane, "ps04-other-lane");
      const uploadId = `relay_upload_${run.creatorId}`;
      await db.mediaAsset.create({ data: { id: uploadId, creatorId: run.creatorId, postIds: [],
        upstreamStatus: "active", currentVersionSeq: 1, currentUpstreamRevision: "relay-upload",
        currentStorageKey: "relay/untouched.png", currentIngestedAt: new Date(timestamp), versionsJson: [],
        ingestOrigin: "RELAY_UPLOAD", processingStatus: "READY" } });
      const ids = [uploadId, otherAsset, other.assetId];
      const before = await db.mediaAsset.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" } });
      await run.service.runBatch(run.batch("p2", "m2"), "ps04-scoped");
      expect((await run.media()).current.upstream_revision).toBe("m2");
      expect(await db.mediaAsset.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" } })).toEqual(before);
    });
  });
});
