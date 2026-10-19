import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DbCanonicalStore } from "../src/ingest/canonical-store-db.js";
import { applySyncBatchToSnapshot } from "../src/ingest/apply-batch.js";
import { IngestService } from "../src/ingest/ingest-service.js";
import { InMemoryEventBus } from "../src/events/event-bus.js";
import { ingestIdempotencyKey } from "../src/ingest/idempotency.js";
import type { SyncBatchInput } from "../src/ingest/types.js";

// Opt in only against a disposable loopback database; never use the ordinary DATABASE_URL.
const targetUrl = process.env.CANONICAL_STORE_TEST_DATABASE_URL;
const clients: PrismaClient[] = [];

function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => { open = resolve; });
  return { promise, open };
}

function batch(creatorId: string, label: string, source = "patreon"): SyncBatchInput {
  return {
    creator_id: creatorId,
    campaigns: [{ campaign_id: `campaign_${creatorId}`, name: "Main", upstream_updated_at: "2026-10-01T00:00:00Z" }],
    posts: [{ post_id: `${source}_post_${creatorId}_${label}`, upstream_revision: "r1", title: label,
      published_at: "2026-10-01T00:00:00Z", tag_ids: [], tier_ids: [], media: [] }]
  };
}

function marker(input: SyncBatchInput) {
  const post = input.posts![0]!;
  return ingestIdempotencyKey(["ingest_post", input.creator_id, post.post_id, post.upstream_revision]);
}

describe.skipIf(!targetUrl)("DbCanonicalStore concurrent PostgreSQL imports", () => {
  let first: PrismaClient;
  let second: PrismaClient;

  beforeAll(async () => {
    const target = new URL(targetUrl!);
    if (!["postgres:", "postgresql:"].includes(target.protocol) ||
        !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || target.search !== "" ||
        !/^\/relay_ingest_test_[a-f0-9]{32}$/.test(target.pathname)) {
      throw new Error("Canonical concurrency tests require a dedicated loopback relay_ingest_test database");
    }
    for (let index = 0; index < 2; index++) {
      const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: targetUrl! }) });
      clients.push(client);
      await client.$connect();
    }
    [first, second] = clients;
  });

  afterAll(async () => { await Promise.all(clients.map((client) => client.$disconnect())); });

  async function expectWaitingForCreator(operation: Promise<unknown>) {
    let settled = false;
    void operation.then(() => { settled = true; }, () => { settled = true; });
    await vi.waitFor(async () => {
      const [row] = await first.$queryRaw<{ waiting: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock' AND wait_event = 'advisory'
        ) AS waiting`;
      expect(settled || row!.waiting).toBe(true);
    }, { timeout: 5000, interval: 10 });
    expect(settled).toBe(false);
  }

  it.each(["patreon", "substar"])("retains overlapping Patreon and %s imports, histories and replay markers", async (source) => {
    const creatorId = `overlap_${randomUUID()}`;
    const a = batch(creatorId, "a");
    const b = batch(creatorId, "b", source);
    const store = new DbCanonicalStore(first);
    const entered = gate();
    const release = gate();
    const firstOperation = store.mutateForCreator(creatorId, async (snapshot) => {
      applySyncBatchToSnapshot(snapshot, a, "a", "trace", new InMemoryEventBus());
      entered.open();
      await release.promise;
    });
    await entered.promise;
    const bus = new InMemoryEventBus();
    const service = new IngestService(new DbCanonicalStore(second), bus);
    const secondOperation = service.runBatch(b, "trace");
    try {
      await expectWaitingForCreator(secondOperation);
    } finally {
      release.open();
      await Promise.allSettled([firstOperation, secondOperation]);
    }
    await Promise.all([firstOperation, secondOperation]);
    const loaded = await store.loadForCreator(creatorId);
    expect(Object.keys(loaded.posts[creatorId]!)).toEqual(expect.arrayContaining([a.posts![0]!.post_id, b.posts![0]!.post_id]));
    for (const input of [a, b]) {
      const post = loaded.posts[creatorId]![input.posts![0]!.post_id]!;
      expect(post.versions.map((version) => version.upstream_revision)).toEqual(["r1"]);
      expect(loaded.ingest_idempotency[marker(input)]).toBeDefined();
      expect(await service.runBatch(input, "replay")).toMatchObject({ posts_written: 0, events_emitted: 0 });
    }
    expect(loaded.posts[creatorId]![b.posts![0]!.post_id]!.source).toBe(source === "substar" ? "SUBSCRIBESTAR" : "PATREON");
    expect(bus.getAll()).toHaveLength(1);
  });

  it.each(["apply", "save", "commit"] as const)("rolls back a failed %s and releases the creator for a waiting import and retry", async (failure) => {
    const creatorId = `rollback_${randomUUID()}`;
    const a = batch(creatorId, "a");
    const b = batch(creatorId, "b");
    const failingClient = failure === "commit" ? new Proxy(first, {
      get(target, property) {
        if (property !== "$transaction") return Reflect.get(target, property);
        return (work: (tx: Prisma.TransactionClient) => Promise<void>, options: object) => target.$transaction(async (tx) => {
          await work(tx);
          throw new Error("injected commit failure");
        }, options);
      }
    }) : first;
    const entered = gate();
    const release = gate();
    const firstOperation = new DbCanonicalStore(failingClient).mutateForCreator(creatorId, async (snapshot) => {
      applySyncBatchToSnapshot(snapshot, a, "a", "trace", new InMemoryEventBus());
      entered.open();
      await release.promise;
      if (failure === "apply") throw new Error("injected apply failure");
      if (failure === "save") snapshot.posts[creatorId]![a.posts![0]!.post_id]!.current.tier_ids = ["missing_tier"];
    });
    const outcome = firstOperation.then(() => null, (error: unknown) => error);
    await entered.promise;
    const service = new IngestService(new DbCanonicalStore(second), new InMemoryEventBus());
    const secondOperation = service.runBatch(b, "trace");
    try {
      await expectWaitingForCreator(secondOperation);
    } finally {
      release.open();
      await Promise.allSettled([firstOperation, secondOperation]);
    }
    expect(await outcome).toBeInstanceOf(Error);
    await secondOperation;
    const store = new DbCanonicalStore(first);
    const loaded = await store.loadForCreator(creatorId);
    expect(Object.keys(loaded.posts[creatorId]!)).toEqual([b.posts![0]!.post_id]);
    expect(loaded.ingest_idempotency[marker(a)]).toBeUndefined();
    expect(loaded.ingest_idempotency[marker(b)]).toBeDefined();
    expect(await service.runBatch(a, "retry")).toMatchObject({ posts_written: 1 });
    expect(Object.keys((await store.loadForCreator(creatorId)).posts[creatorId]!)).toHaveLength(2);
    expect(await service.runBatch(a, "replay")).toMatchObject({ posts_written: 0, events_emitted: 0 });
  });

  it("lets another creator finish while the first creator is reserved", async () => {
    const creatorA = `creator_a_${randomUUID()}`;
    const creatorB = `creator_b_${randomUUID()}`;
    const entered = gate();
    const release = gate();
    const store = new DbCanonicalStore(first);
    const firstOperation = store.mutateForCreator(creatorA, async (snapshot) => {
      applySyncBatchToSnapshot(snapshot, batch(creatorA, "a"), "a", "trace", new InMemoryEventBus());
      entered.open();
      await release.promise;
    });
    await entered.promise;
    const secondOperation = new IngestService(new DbCanonicalStore(second), new InMemoryEventBus()).runBatch(batch(creatorB, "b"), "trace");
    let finished = false;
    void secondOperation.then(() => { finished = true; }, () => { finished = true; });
    try {
      await vi.waitFor(() => { expect(finished).toBe(true); }, { timeout: 5000, interval: 10 });
      await secondOperation;
      expect((await store.loadForCreator(creatorA)).posts[creatorA]).toBeUndefined();
      expect(Object.keys((await store.loadForCreator(creatorB)).posts[creatorB]!)).toHaveLength(1);
    } finally {
      release.open();
      await Promise.allSettled([firstOperation, secondOperation]);
    }
    await firstOperation;
    expect(Object.keys((await store.loadForCreator(creatorA)).posts[creatorA]!)).toHaveLength(1);
    expect((await store.loadForCreator(creatorA)).posts[creatorB]).toBeUndefined();
  });
});
