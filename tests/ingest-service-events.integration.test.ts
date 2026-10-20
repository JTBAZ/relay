import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DbEventBus } from "../src/events/event-bus-db.js";
import { DbCanonicalStore } from "../src/ingest/canonical-store-db.js";
import { IngestService } from "../src/ingest/ingest-service.js";
import { IngestOwnershipConflict } from "../src/ingest/ownership-conflict.js";
import type { SyncBatchInput } from "../src/ingest/types.js";

const targetUrl = process.env.CANONICAL_STORE_TEST_DATABASE_URL;

describe.skipIf(!targetUrl)("PS-05 canonical commit and outbox PostgreSQL boundary", () => {
  let db: PrismaClient;
  beforeAll(async () => {
    const target = new URL(targetUrl!);
    if (!["postgres:", "postgresql:"].includes(target.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || target.search !== "" ||
      !/^\/relay_ingest_test_[a-f0-9]{32}$/.test(target.pathname)) {
      throw new Error("Event boundary tests require a dedicated loopback relay_ingest_test database");
    }
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: targetUrl! }) });
    await db.$connect();
  }, 30_000);
  afterAll(async () => { await db?.$disconnect(); });

  function setup(source: string) {
    const creatorId = `ps05_${randomUUID()}`;
    const bus = new DbEventBus(db);
    const store = new DbCanonicalStore(db);
    const service = new IngestService(store, bus);
    const batch: SyncBatchInput = { creator_id: creatorId,
      campaigns: [{ campaign_id: `campaign_${creatorId}`, name: "PS-05 fixture", upstream_updated_at: "2026-10-01T00:00:00.000Z" }],
      posts: ["one", "two"].map((label) => ({ post_id: `${source}_post_${creatorId}_${label}`,
        title: label, upstream_revision: "r1", published_at: "2026-10-01T00:00:00.000Z",
        tag_ids: [], tier_ids: [], media: [] })) };
    return { creatorId, bus, store, service, batch };
  }

  async function expectNoCommit(run: ReturnType<typeof setup>) {
    const loaded = await run.store.loadForCreator(run.creatorId);
    expect(loaded.posts[run.creatorId] ?? {}).toEqual({});
    expect(loaded.ingest_idempotency).toEqual({});
    expect(run.bus.getAll()).toEqual([]);
    expect(await db.outboxEvent.count({ where: { tenantId: run.creatorId } })).toBe(0);
  }

  async function retryAndReplay(run: ReturnType<typeof setup>) {
    expect(await run.service.runBatch(run.batch, "ps05-retry")).toMatchObject({ posts_written: 2, events_emitted: 2 });
    await vi.waitFor(async () => {
      expect(await db.outboxEvent.count({ where: { tenantId: run.creatorId } })).toBe(2);
    });
    expect(await run.service.runBatch(run.batch, "ps05-replay")).toMatchObject({ posts_written: 0, events_emitted: 0 });
    expect(run.bus.getAll().map((event) => event.payload.post_id)).toEqual(run.batch.posts!.map((post) => post.post_id));
    expect(await db.outboxEvent.count({ where: { tenantId: run.creatorId } })).toBe(2);
  }

  describe.each(["patreon", "substar"])("%s", (source) => {
    it("rolls back a late post write failure without publishing, then retries", async () => {
      const run = setup(source);
      run.batch.posts![1]!.title = "ps05-save-failure";
      await db.$executeRaw`ALTER TABLE post_versions ADD CONSTRAINT ps05_reject_post_write
        CHECK (title <> 'ps05-save-failure') NOT VALID`;
      try {
        await expect(run.service.runBatch(run.batch, "ps05-save-failure")).rejects.toThrow();
      } finally {
        await db.$executeRaw`ALTER TABLE post_versions DROP CONSTRAINT ps05_reject_post_write`;
      }
      await expectNoCommit(run);
      await retryAndReplay(run);
    }, 30_000);

    it("waits for a deferred commit constraint before publishing, then retries", async () => {
      const run = setup(source);
      run.batch.posts![1]!.title = "ps05-commit-failure";
      await db.$executeRaw`CREATE FUNCTION ps05_fail_commit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.title = 'ps05-commit-failure' THEN RAISE EXCEPTION 'PS-05 deferred commit failure'; END IF;
          RETURN NEW;
        END;
      $$`;
      try {
        await db.$executeRaw`CREATE CONSTRAINT TRIGGER ps05_deferred_commit AFTER INSERT ON post_versions
          DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ps05_fail_commit()`;
        try {
          await expect(run.service.runBatch(run.batch, "ps05-commit-failure")).rejects.toThrow("PS-05 deferred commit failure");
        } finally {
          await db.$executeRaw`DROP TRIGGER ps05_deferred_commit ON post_versions`;
        }
      } finally {
        await db.$executeRaw`DROP FUNCTION ps05_fail_commit()`;
      }
      await expectNoCommit(run);
      await retryAndReplay(run);
    }, 30_000);

    it("discards events for a mixed batch rejected by real ownership checks", async () => {
      const owner = setup(source);
      await owner.service.runBatch(owner.batch, "ps05-owner");
      const run = setup(source);
      run.batch.posts![1]!.post_id = owner.batch.posts![0]!.post_id;
      const before = await owner.store.loadForCreator(owner.creatorId);
      await expect(run.service.runBatch(run.batch, "ps05-owner-conflict")).rejects.toBeInstanceOf(IngestOwnershipConflict);
      await expectNoCommit(run);
      expect(await owner.store.loadForCreator(owner.creatorId)).toEqual(before);
    }, 30_000);
  });
});
