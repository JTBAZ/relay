import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DbCanonicalStore } from "../src/ingest/canonical-store-db.js";
import { IngestService } from "../src/ingest/ingest-service.js";
import { InMemoryEventBus } from "../src/events/event-bus.js";
import { mapPatreonPostToIngest } from "../src/patreon/map-patreon-to-ingest.js";
import { RELAY_TIER_PUBLIC, RELAY_TIER_ALL_PATRONS } from "../src/patreon/relay-access-tiers.js";

const targetUrl = process.env.CANONICAL_STORE_TEST_DATABASE_URL;
describe.skipIf(!targetUrl)("PS-07 current source revision PostgreSQL persistence", () => {
  let first: PrismaClient, second: PrismaClient;
  beforeAll(async () => {
    const url = new URL(targetUrl!);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hostname !== "127.0.0.1" || url.search || !/^\/relay_ingest_test_[a-f0-9]{32}$/.test(url.pathname)) throw new Error("Revision tests require a disposable loopback database");
    first = new PrismaClient({ adapter: new PrismaPg({ connectionString: targetUrl! }) });
    second = new PrismaClient({ adapter: new PrismaPg({ connectionString: targetUrl! }) });
    await Promise.all([first.$connect(), second.$connect()]);
  });
  afterAll(async () => { await Promise.all([first?.$disconnect(), second?.$disconnect()]); }, 30_000);
  function setup() {
    const id = randomUUID(), creatorId = `ps07_${id}`;
    const store = new DbCanonicalStore(first);
    const worker = new IngestService(new DbCanonicalStore(second), new InMemoryEventBus());
    const service = new IngestService(store, new InMemoryEventBus());
    const batch = (title: string, asset = title, token = "first", isPublic = true) => ({ creator_id: creatorId,
      campaigns: [{ campaign_id: `campaign_${id}`, name: "Revision fixture", upstream_updated_at: "2026-01-01T00:00:00.000Z" }],
      tiers: [RELAY_TIER_PUBLIC, RELAY_TIER_ALL_PATRONS].map((tier_id) => ({ tier_id, title: tier_id, campaign_id: `campaign_${id}`, upstream_updated_at: "2026-01-01T00:00:00.000Z" })),
      posts: [mapPatreonPostToIngest({ type: "post", id, attributes: { title, content: `<img src="https://c10.patreonusercontent.com/${asset}.png?token=${token}">`, published_at: "2026-01-01T00:00:00.000Z", is_public: isPublic } })] });
    const apply = (input: ReturnType<typeof batch>, target = service) => target.runBatch(input, "ps07", undefined, [], { currentPatreonSnapshot: true });
    return { creatorId, store, worker, service, batch, apply };
  }
  it("round-trips A-to-B-to-A, refreshes signed URLs without revisions, and leaves media unchanged on title-only edits", async () => {
    const run = setup();
    for (const title of ["A", "B", "A"]) expect((await run.apply(run.batch(title))).posts_written).toBe(1);
    const input = run.batch("A", "A", "renewed");
    expect(await run.apply(input)).toMatchObject({ posts_written: 0, media_upserted: 0 });
    const loaded = await run.store.loadForCreator(run.creatorId);
    const post = loaded.posts[run.creatorId]![input.posts[0]!.post_id]!;
    const media = loaded.media[run.creatorId]![input.posts[0]!.media[0]!.media_id]!;
    expect(post.versions).toHaveLength(3); expect(post.current.title).toBe("A");
    expect(media.versions).toHaveLength(3); expect(media.current.upstream_url).toContain("token=renewed");
    expect(await run.apply(run.batch("Title only", "A", "renewed"))).toMatchObject({ posts_written: 1, media_upserted: 0 });
    expect(await run.apply(run.batch("Title only", "A", "renewed", false))).toMatchObject({ posts_written: 1, media_upserted: 0 });
  });
  it("accepts identical simultaneous observations only once across independent workers", async () => {
    const run = setup();
    const results = await Promise.all([run.apply(run.batch("A")), run.apply(run.batch("A"), run.worker)]);
    expect(results.map((r) => r.posts_written).sort()).toEqual([0, 1]);
    const loaded = await run.store.loadForCreator(run.creatorId);
    expect(Object.values(loaded.posts[run.creatorId]!)[0]!.versions).toHaveLength(1);
  });
});
