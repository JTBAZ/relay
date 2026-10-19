import { describe, expect, it, vi } from "vitest";
import type { CanonicalSnapshot, PostVersionRow } from "../src/ingest/canonical-store.js";
import { InMemoryEventBus } from "../src/events/event-bus.js";
import { applySyncBatchToSnapshot } from "../src/ingest/apply-batch.js";
import { enrichBatch } from "../src/ingest/auto-enrich.js";
import type { SyncBatchInput } from "../src/ingest/types.js";
import { IngestService } from "../src/ingest/ingest-service.js";
import { ingestIdempotencyKey, legacyIngestIdempotencyKey } from "../src/ingest/idempotency.js";
import { IngestReplayConflict, type ReplayIdentity } from "../src/ingest/replay-compatibility.js";
import {
  DbCanonicalStore,
  deduplicatePostVersionsForSave
} from "../src/ingest/canonical-store-db.js";

describe("deduplicatePostVersionsForSave", () => {
  it("keeps one row per version_seq; last wins; sorted ascending", () => {
    const v1a: PostVersionRow = {
      version_seq: 1,
      upstream_revision: "a",
      title: "first",
      published_at: "2026-01-01T00:00:00.000Z",
      tag_ids: [],
      tier_ids: [],
      media_ids: [],
      ingested_at: "2026-01-01T00:00:00.000Z"
    };
    const v1b: PostVersionRow = {
      ...v1a,
      upstream_revision: "b",
      title: "second wins"
    };
    const v2: PostVersionRow = {
      ...v1a,
      version_seq: 2,
      upstream_revision: "c",
      title: "v2"
    };
    const out = deduplicatePostVersionsForSave([v1a, v2, v1b]);
    expect(out).toHaveLength(2);
    expect(out[0]!.title).toBe("second wins");
    expect(out[1]!.version_seq).toBe(2);
  });
});

function mockTx() {
  const postCreate = vi.fn().mockResolvedValue({});
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ locked: 1 }]),
    postTier: {
      deleteMany: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
      createMany: vi.fn().mockResolvedValue({})
    },
    mediaAsset: {
      deleteMany: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 1 })
    },
    postVersion: { deleteMany: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([]) },
    post: {
      deleteMany: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: postCreate,
      update: vi.fn().mockResolvedValue({})
    },
    tier: {
      deleteMany: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({})
    },
    campaign: {
      deleteMany: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({})
    },
    ingestIdempotencyKey: { deleteMany: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([]) },
    postPresentation: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}) },
    creativeWorkMember: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "cwm_existing", creativeWorkId: "cw_existing" }),
      create: vi.fn().mockResolvedValue({})
    },
    creativeWork: { upsert: vi.fn().mockResolvedValue({}) },
    platformInstance: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({})
    }
  };
  return { tx, postCreate };
}

function mockPrisma(txFactory: () => { tx: ReturnType<typeof mockTx>["tx"] }) {
  return {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>, _opts?: unknown) => {
      const { tx } = txFactory();
      return fn(tx);
    })
  };
}

describe("DbCanonicalStore legacy replay compatibility", () => {
  it("round-trips legacy proof, unresolved collisions and exact reconciliation without a schema change", async () => {
    const { tx } = mockTx();
    const snapshot: CanonicalSnapshot = { ingest_idempotency: {}, campaigns: {}, tiers: {}, posts: {}, media: {} };
    const timestamp = "2026-10-01T00:00:00.000Z";
    const original: SyncBatchInput = {
      creator_id: "cr1", campaigns: [{ campaign_id: "camp1", name: "Main", upstream_updated_at: timestamp }],
      posts: [{ post_id: "post|part", upstream_revision: "r1", title: "Original", published_at: timestamp, tag_ids: [], tier_ids: [], media: [] }]
    };
    applySyncBatchToSnapshot(snapshot, original, "seed", "trace", new InMemoryEventBus());
    const legacyIdentity: ReplayIdentity = ["ingest_post", "cr1", "post|part", "r1"];
    const legacyKey = legacyIngestIdempotencyKey(legacyIdentity);
    delete snapshot.ingest_idempotency[ingestIdempotencyKey(legacyIdentity)];
    snapshot.ingest_idempotency[legacyKey] = { first_seen_at: timestamp };
    const storeForSeed = new DbCanonicalStore(mockPrisma(() => ({ tx })) as never);
    await storeForSeed.saveForCreator("cr1", snapshot);
    let keys = tx.ingestIdempotencyKey.createMany.mock.calls.at(-1)![0].data;
    const posts = [{ id: "post|part", creatorId: "cr1", campaignId: "camp1", source: "PATREON", upstreamStatus: "active", isPublic: false }];
    const versions = tx.post.create.mock.calls[0]![0].data.versions.create.map((v: object) => ({ ...v, postId: "post|part" }));
    tx.post.create.mockClear();
    const prisma = {
      ...mockPrisma(() => ({ tx })),
      campaign: { findMany: vi.fn().mockResolvedValue([{ id: "camp1", creatorId: "cr1", name: "Main", upstreamUpdatedAt: new Date(timestamp), versionSeq: 1 }]) },
      tier: { findMany: vi.fn().mockResolvedValue([]) },
      post: { findMany: vi.fn(async () => posts) },
      postVersion: { findMany: vi.fn(async () => versions) },
      mediaAsset: { findMany: vi.fn().mockResolvedValue([]) },
      ingestIdempotencyKey: { findMany: vi.fn(async () => keys) }
    };
    tx.post.findMany.mockImplementation(async ({ where }: { where: { creatorId: unknown; source: string } }) =>
      where.creatorId === "cr1" ? posts.filter((p) => !where.source || p.source === where.source).map((p) => ({
        ...p, versions: versions.filter((v: { postId: string }) => v.postId === p.id)
      })) : []
    );
    tx.campaign.findMany.mockImplementation(async ({ select }) => select ? [] : prisma.campaign.findMany());
    tx.postVersion.findMany = prisma.postVersion.findMany;
    tx.ingestIdempotencyKey.findMany = prisma.ingestIdempotencyKey.findMany;
    const store = new DbCanonicalStore(prisma as never);
    const bus = new InMemoryEventBus();
    const service = new IngestService(store, bus);
    expect((await store.loadForCreator("cr1")).ingest_idempotency[legacyKey]).toEqual({ first_seen_at: timestamp });
    expect(await service.runBatch(structuredClone(original), "trace")).toMatchObject({ posts_written: 0, events_emitted: 0 });
    keys = tx.ingestIdempotencyKey.createMany.mock.calls.at(-1)![0].data;
    expect(keys.some((row: { batchKey: string }) => row.batchKey === legacyKey)).toBe(true);
    expect(keys.some((row: { batchKey: string }) => row.batchKey === ingestIdempotencyKey(legacyIdentity))).toBe(true);
    const incoming: SyncBatchInput = { creator_id: "cr1", posts: [{ ...original.posts![0]!, post_id: "post", upstream_revision: "part|r1", title: "Distinct" }] };
    const identity: ReplayIdentity = ["ingest_post", "cr1", "post", "part|r1"];
    const callsBeforeConflict = prisma.$transaction.mock.calls.length;
    const savesBeforeConflict = tx.ingestIdempotencyKey.deleteMany.mock.calls.length;
    await expect(service.runBatch(structuredClone(incoming), "trace")).rejects.toThrow(IngestReplayConflict);
    expect(prisma.$transaction).toHaveBeenCalledTimes(callsBeforeConflict + 1);
    expect(tx.ingestIdempotencyKey.deleteMany).toHaveBeenCalledTimes(savesBeforeConflict);
    expect(bus.getAll()).toEqual([]);
    expect(await service.runBatch(structuredClone(incoming), "trace", undefined, [{ parts: identity, action: "import_once" }]))
      .toMatchObject({ posts_written: 1, events_emitted: 1 });
    expect(tx.post.create).toHaveBeenCalledTimes(1);
    const saved = tx.post.create.mock.calls[0]![0].data;
    expect(saved).toMatchObject({ id: "post", creatorId: "cr1" });
    versions.push(...saved.versions.create.map((v: object) => ({ ...v, postId: "post" })));
    posts.push({ ...posts[0]!, id: "post" });
    keys = tx.ingestIdempotencyKey.createMany.mock.calls.at(-1)![0].data;
    tx.post.create.mockClear();
    expect(await new IngestService(new DbCanonicalStore(prisma as never), bus).runBatch(structuredClone(incoming), "trace"))
      .toMatchObject({ posts_written: 0, events_emitted: 0 });
    expect(tx.post.create).not.toHaveBeenCalled();
    expect((await store.loadForCreator("cr1")).ingest_idempotency[legacyKey]).toEqual({ first_seen_at: timestamp });
    expect(bus.getAll()).toHaveLength(1);
  });

  it("does not use normalized database campaign timestamps as exact legacy identity evidence", async () => {
    const timestamp = "2026-10-01T00:00:00.000Z";
    const identity: ReplayIdentity = ["ingest_campaign", "cr1", "camp|part", timestamp];
    const prisma = {
      campaign: { findMany: vi.fn().mockResolvedValue([{ id: "camp|part", creatorId: "cr1", name: "Main", upstreamUpdatedAt: new Date(timestamp), versionSeq: 1 }]) },
      tier: { findMany: vi.fn().mockResolvedValue([]) }, post: { findMany: vi.fn().mockResolvedValue([]) },
      postVersion: { findMany: vi.fn().mockResolvedValue([]) }, mediaAsset: { findMany: vi.fn().mockResolvedValue([]) },
      ingestIdempotencyKey: { findMany: vi.fn().mockResolvedValue([{ batchKey: legacyIngestIdempotencyKey(identity), firstSeenAt: new Date(timestamp) }]) },
      $queryRaw: vi.fn().mockResolvedValue([{ locked: 1 }]),
      $transaction: vi.fn(async (work: (tx: unknown) => Promise<void>) => work(prisma))
    };
    const input = { creator_id: "cr1", campaigns: [{ campaign_id: "camp|part", name: "New", upstream_updated_at: timestamp }] };
    await expect(new IngestService(new DbCanonicalStore(prisma as never), new InMemoryEventBus()).runBatch(input, "trace"))
      .rejects.toThrow(IngestReplayConflict);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe("DbCanonicalStore refreshed-post relationships", () => {
  it.each(["PATREON", "SUBSCRIBESTAR"] as const)("retains confirmed links, metrics and parent identity through %s refresh and replay", async (source) => {
    const { tx } = mockTx();
    const timestamp = "2026-10-01T00:00:00.000Z";
    const postId = source === "PATREON" ? "patreon_post_123" : "substar_post_123";
    const original: SyncBatchInput = {
      creator_id: "cr1",
      campaigns: [{ campaign_id: "camp1", name: "Main", upstream_updated_at: timestamp }],
      tiers: [{ tier_id: "tier1", campaign_id: "camp1", title: "Paid", upstream_updated_at: timestamp }],
      posts: [{ post_id: postId, upstream_revision: "r1", title: "Original", published_at: timestamp,
        tag_ids: [], tier_ids: [], media: [] }]
    };
    const snapshot: CanonicalSnapshot = { ingest_idempotency: {}, campaigns: {}, tiers: {}, posts: {}, media: {} };
    applySyncBatchToSnapshot(snapshot, original, "seed", "trace", new InMemoryEventBus());
    const parent = {
      id: postId, creatorId: "cr1", campaignId: "camp1", providerPostId: postId, source,
      upstreamStatus: "active", isPublic: true, requiredTierId: "tier1", createdAt: new Date(timestamp),
      versions: [{ versionSeq: 1, upstreamRevision: "r1", title: "Original", description: null,
        publishedAt: new Date(timestamp), tagIds: [] as string[], tierIds: [] as string[], mediaIds: [] as string[],
        ingestedAt: new Date(timestamp) }]
    };
    const posts = [parent];
    const links = [
      { id: "pi_x", creatorId: "cr1", postId, destination: "x", externalUrl: "https://x.com/artist/status/123",
        externalId: "123", linkSource: "manual_url_confirm", status: "active" },
      { id: "pi_provider", creatorId: "cr1", postId, destination: "patreon", externalUrl: "https://www.patreon.com/posts/123",
        externalId: "123", linkSource: "manual_url_confirm", status: "active" }
    ];
    const metrics = [{ id: "metric_1", creatorId: "cr1", postId, platformInstanceId: "pi_x", metricType: "views", value: 42 }];
    const beforeLinks = structuredClone(links);
    const beforeMetrics = structuredClone(metrics);
    let keys = Object.entries(snapshot.ingest_idempotency).map(([batchKey, meta]) => ({ batchKey, firstSeenAt: new Date(meta.first_seen_at) }));
    let tierLinks: { postId: string; tierId: string }[] = [];
    tx.post.findMany.mockImplementation(async ({ where }) =>
      where.creatorId === "cr1" ? posts.filter((p) => !where.source || p.source === where.source) : []
    );
    tx.post.deleteMany.mockImplementation(async () => {
      posts.length = 0;
      links.length = 0;
      metrics.length = 0;
      return { count: 1 };
    });
    tx.postVersion.deleteMany.mockImplementation(async () => { parent.versions = []; });
    tx.post.create.mockImplementation(async ({ data }) => { posts.push(data); return data; });
    tx.post.update.mockImplementation(async ({ data }) => {
      const { versions, ...fields } = data;
      Object.assign(parent, fields, { versions: versions.create });
      return parent;
    });
    tx.postTier.deleteMany.mockImplementation(async () => { tierLinks = []; });
    tx.postTier.createMany.mockImplementation(async ({ data }) => { tierLinks.push(...data); });
    tx.ingestIdempotencyKey.createMany.mockImplementation(async ({ data }) => { keys = data; });
    tx.platformInstance.findUnique.mockImplementation(async ({ where }) =>
      links.find((link) => link.postId === where.postId_destination.postId && link.destination === where.postId_destination.destination) ?? null
    );
    const prisma = {
      ...mockPrisma(() => ({ tx })),
      campaign: { findMany: vi.fn().mockResolvedValue([{ id: "camp1", creatorId: "cr1", name: "Main", upstreamUpdatedAt: new Date(timestamp), versionSeq: 1 }]) },
      tier: { findMany: vi.fn().mockResolvedValue([{ id: "cr1::tier1", relayTierId: "tier1", creatorId: "cr1", campaignId: "camp1", title: "Paid", upstreamUpdatedAt: new Date(timestamp), versionSeq: 1 }]) },
      post: { findMany: vi.fn(async () => posts) },
      postVersion: { findMany: vi.fn(async () => posts.flatMap((p) => p.versions.map((v) => ({ ...v, postId: p.id })))) },
      mediaAsset: { findMany: vi.fn().mockResolvedValue([]) },
      ingestIdempotencyKey: { findMany: vi.fn(async () => keys) }
    };
    tx.campaign.findMany.mockImplementation(async ({ select }) => select ? [] : prisma.campaign.findMany());
    tx.tier.findMany.mockImplementation(async ({ select }) => select ? [] : prisma.tier.findMany());
    tx.postVersion.findMany = prisma.postVersion.findMany;
    tx.ingestIdempotencyKey.findMany = prisma.ingestIdempotencyKey.findMany;
    const store = new DbCanonicalStore(prisma as never);
    const bus = new InMemoryEventBus();
    const service = new IngestService(store, bus);
    const fresh = structuredClone(original);
    Object.assign(fresh.posts![0]!, { upstream_revision: "r2", title: "Refreshed", tier_ids: ["tier1"] });
    expect(await service.runBatch(fresh, "trace")).toMatchObject({ posts_written: 1, events_emitted: 1 });

    expect(tx.post.deleteMany).not.toHaveBeenCalled();
    expect(tx.post.create).not.toHaveBeenCalled();
    expect(tx.post.update).toHaveBeenCalledTimes(1);
    expect(posts[0]).toBe(parent);
    expect(parent).toMatchObject({ creatorId: "cr1", campaignId: "camp1", source, providerPostId: postId, isPublic: true, requiredTierId: "tier1" });
    expect(links).toEqual(beforeLinks);
    expect(metrics).toEqual(beforeMetrics);
    expect(tx.platformInstance.create).not.toHaveBeenCalled();
    expect(tx.platformInstance.update).not.toHaveBeenCalled();
    expect(tierLinks).toEqual([{ postId, tierId: "cr1::tier1" }]);
    const loaded = await store.loadForCreator("cr1");
    expect(loaded.posts.cr1![postId]!.current).toMatchObject({ upstream_revision: "r2", title: "Refreshed", tier_ids: ["tier1"] });
    expect(loaded.posts.cr1![postId]!.versions.map((v) => v.upstream_revision)).toEqual(["r1", "r2"]);

    expect(await service.runBatch(structuredClone(fresh), "replay")).toMatchObject({ posts_written: 0, events_emitted: 0 });
    expect(tx.post.update).toHaveBeenCalledTimes(1);
    expect(tx.postTier.createMany).toHaveBeenCalledTimes(1);
    expect(parent.versions).toHaveLength(2);
    expect(links).toEqual(beforeLinks);
    expect(metrics).toEqual(beforeMetrics);
    expect(bus.getAll()).toHaveLength(1);

    expect(await service.runBatch({ creator_id: "cr1", tombstones: [
      { entity_type: "post", id: postId, deleted_at: "2026-10-02T00:00:00.000Z" }
    ] }, "deleted")).toMatchObject({ events_emitted: 0 });
    expect((await store.loadForCreator("cr1")).posts.cr1![postId]!.upstream_status).toBe("deleted");
    expect(parent.versions).toHaveLength(2);
    expect(posts[0]).toBe(parent);
    expect(tx.post.deleteMany).not.toHaveBeenCalled();
    expect(links).toEqual(beforeLinks);
    expect(metrics).toEqual(beforeMetrics);
  });

  it("moves refreshed posts before removing their orphaned campaign and only deletes omitted posts", async () => {
    const { tx } = mockTx();
    const oldCampaign = { id: "old_camp" };
    const snapshot: CanonicalSnapshot = { ingest_idempotency: {}, campaigns: {}, tiers: {}, posts: {}, media: {} };
    applySyncBatchToSnapshot(snapshot, {
      creator_id: "cr1", campaigns: [{ campaign_id: "new_camp", name: "Main", upstream_updated_at: "2026-10-01T00:00:00Z" }],
      posts: [{ post_id: "patreon_post_123", upstream_revision: "r2", title: "Refreshed", published_at: "2026-10-01T00:00:00Z",
        tag_ids: [], tier_ids: [], media: [] }]
    }, "seed", "trace", new InMemoryEventBus());
    const kept = { id: "patreon_post_123", campaignId: oldCampaign.id, upstreamStatus: "active", versions: [{ versionSeq: 1, upstreamRevision: "r1" }] };
    tx.post.findMany.mockImplementation(async ({ where }) => where.creatorId === "cr1" && where.source === "PATREON"
      ? [kept, { ...kept, id: "omitted_post" }] : []
    );
    tx.campaign.findMany.mockImplementation(async ({ where }) => where.creatorId === "cr1" ? [oldCampaign] : []);
    tx.post.count.mockImplementation(async ({ where }) => kept.campaignId === where.campaignId ? 1 : 0);
    tx.campaign.delete.mockImplementation(async () => {
      if (kept.campaignId === oldCampaign.id) throw new Error("Campaign still referenced by refreshed post");
      return oldCampaign;
    });
    tx.post.update.mockImplementation(async ({ data }) => { kept.campaignId = data.campaignId; return kept; });

    await new DbCanonicalStore(mockPrisma(() => ({ tx })) as never).saveForCreator("cr1", snapshot);

    expect(kept.campaignId).toBe("new_camp");
    expect(tx.campaign.delete).toHaveBeenCalledWith({ where: { id: "old_camp" } });
    expect(tx.post.deleteMany).toHaveBeenCalledExactlyOnceWith({ where: { id: { in: ["omitted_post"] } } });
    expect(tx.postTier.deleteMany).toHaveBeenCalledWith({ where: { postId: { in: [kept.id, "omitted_post"] } } });
    expect(tx.post.create).not.toHaveBeenCalled();
  });
});

describe("DbCanonicalStore expanded all-paid access", () => {
  it("rebuilds tier links for changed legacy access and preserves the resulting replay", async () => {
    const { tx } = mockTx();
    const snapshot: CanonicalSnapshot = { ingest_idempotency: {}, campaigns: {}, tiers: {}, posts: {}, media: {} };
    const bus = new InMemoryEventBus();
    const input: SyncBatchInput = {
      creator_id: "cr1",
      campaigns: [{ campaign_id: "camp1", name: "Main", upstream_updated_at: "2026-10-01T00:00:00Z" }],
      tiers: [1000, 100].map((amount, i) => ({
        tier_id: `patreon_tier_${i}`, title: `Tier ${i}`, amount_cents: amount,
        campaign_id: "camp1", upstream_updated_at: "2026-10-01T00:00:00Z"
      })),
      posts: [{ post_id: "patreon_post_123", title: "Paid", published_at: "2026-10-01T00:00:00Z",
        tag_ids: [], tier_ids: ["patreon_tier_0"], upstream_revision: "r1:tier_expand", media: [] }]
    };
    applySyncBatchToSnapshot(snapshot, input, "legacy", "trace", bus);
    let persistedVersions = [{ versionSeq: 1, upstreamRevision: "r1:tier_expand" }];
    tx.post.findMany.mockImplementation(async ({ where }: { where: { creatorId: unknown; source: string } }) =>
      where.creatorId === "cr1" && where.source === "PATREON"
        ? [{ id: "patreon_post_123", campaignId: "camp1", upstreamStatus: "active", versions: persistedVersions }]
        : []
    );
    input.posts![0]!.tier_ids = ["relay_tier_all_patrons"];
    input.posts![0]!.upstream_revision = "r1";
    const expanded = enrichBatch(input).batch;
    expect(applySyncBatchToSnapshot(snapshot, expanded, "changed", "trace", bus)).toMatchObject({ posts_written: 1 });
    const store = new DbCanonicalStore(mockPrisma(() => ({ tx })) as never);
    await store.saveForCreator("cr1", snapshot);
    expect(tx.postTier.createMany).toHaveBeenCalledWith({ data: [
      { postId: "patreon_post_123", tierId: "cr1::patreon_tier_0" },
      { postId: "patreon_post_123", tierId: "cr1::patreon_tier_1" }
    ] });
    persistedVersions = tx.post.update.mock.calls[0]![0].data.versions.create;
    expect(persistedVersions).toHaveLength(2);
    expect(persistedVersions[1]).toMatchObject({ versionSeq: 2, tierIds: ["patreon_tier_0", "patreon_tier_1"] });
    tx.post.create.mockClear();
    tx.post.update.mockClear();
    tx.postTier.createMany.mockClear();
    expect(applySyncBatchToSnapshot(snapshot, expanded, "replay", "trace", bus)).toMatchObject({ posts_written: 0, events_emitted: 0 });
    await store.saveForCreator("cr1", snapshot);
    expect(tx.post.create).not.toHaveBeenCalled();
    expect(tx.post.update).not.toHaveBeenCalled();
    expect(tx.postTier.createMany).not.toHaveBeenCalled();
    expect(bus.getAll()).toHaveLength(2);
  });
});

describe("DbCanonicalStore.save duplicate version_seq", () => {
  it("does not throw when post.versions has duplicate version_seq", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
    const { tx, postCreate } = mockTx();
    const prisma = mockPrisma(() => ({ tx }));

    const store = new DbCanonicalStore(prisma as never);
    const vBase: PostVersionRow = {
      version_seq: 1,
      upstream_revision: "patreon:x",
      title: "T",
      published_at: "2026-04-01T12:00:00.000Z",
      tag_ids: [],
      tier_ids: ["relay_tier_public"],
      media_ids: [],
      ingested_at: "2026-04-01T12:00:00.000Z"
    };
    const dup: PostVersionRow = { ...vBase, title: "T-dup-same-seq" };

    await store.saveForCreator("cr1", {
      ingest_idempotency: {},
      campaigns: {
        cr1: {
          patreon_campaign_1: {
            campaign_id: "patreon_campaign_1",
            creator_id: "cr1",
            name: "C",
            upstream_updated_at: "2026-01-01T00:00:00.000Z",
            version_seq: 1
          }
        }
      },
      tiers: {
        cr1: {
          relay_tier_public: {
            tier_id: "relay_tier_public",
            creator_id: "cr1",
            campaign_id: "patreon_campaign_1",
            title: "Public",
            upstream_updated_at: "2026-01-01T00:00:00.000Z",
            version_seq: 1
          }
        }
      },
      posts: {
        cr1: {
          patreon_post_999: {
            post_id: "patreon_post_999",
            creator_id: "cr1",
            current: dup,
            versions: [vBase, dup],
            upstream_status: "active"
          }
        }
      },
      media: {}
    });

    expect(postCreate).toHaveBeenCalledTimes(1);
    const createArg = postCreate.mock.calls[0]![0] as {
      data: { versions: { create: unknown[] } };
    };
    expect(createArg.data.versions.create).toHaveLength(1);
    expect(
      (createArg.data.versions.create[0] as { title: string }).title
    ).toBe("T-dup-same-seq");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("patreon_post_999: deduplicated 1 version(s)")
    );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("ensures Creative Work + Patreon Platform Instance for ingested Patreon posts", async () => {
    const { tx } = mockTx();
    tx.creativeWorkMember.findUnique = vi.fn().mockResolvedValue(null);
    tx.creativeWork.upsert = vi.fn().mockResolvedValue({});
    tx.creativeWorkMember.create = vi.fn().mockResolvedValue({});
    tx.platformInstance.findUnique = vi.fn().mockResolvedValue(null);
    tx.platformInstance.create = vi.fn().mockResolvedValue({});

    const prisma = mockPrisma(() => ({ tx }));
    const store = new DbCanonicalStore(prisma as never);
    const vBase: PostVersionRow = {
      version_seq: 1,
      upstream_revision: "patreon:x",
      title: "TEST",
      published_at: "2026-04-01T12:00:00.000Z",
      tag_ids: [],
      tier_ids: ["relay_tier_public"],
      media_ids: [],
      ingested_at: "2026-04-01T12:00:00.000Z"
    };

    await store.saveForCreator("cr1", {
      ingest_idempotency: {},
      campaigns: {
        cr1: {
          patreon_campaign_1: {
            campaign_id: "patreon_campaign_1",
            creator_id: "cr1",
            name: "C",
            upstream_updated_at: "2026-01-01T00:00:00.000Z",
            version_seq: 1
          }
        }
      },
      tiers: {
        cr1: {
          relay_tier_public: {
            tier_id: "relay_tier_public",
            creator_id: "cr1",
            campaign_id: "patreon_campaign_1",
            title: "Public",
            upstream_updated_at: "2026-01-01T00:00:00.000Z",
            version_seq: 1
          }
        }
      },
      posts: {
        cr1: {
          patreon_post_165070564: {
            post_id: "patreon_post_165070564",
            creator_id: "cr1",
            current: vBase,
            versions: [vBase],
            upstream_status: "active",
            source: "PATREON"
          }
        }
      },
      media: {}
    });

    expect(tx.creativeWork.upsert).toHaveBeenCalled();
    expect(tx.creativeWorkMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          postId: "patreon_post_165070564",
          creatorId: "cr1",
          variantRole: "standalone"
        })
      })
    );
    expect(tx.platformInstance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        postId: "patreon_post_165070564",
        destination: "patreon",
        externalUrl: "https://www.patreon.com/posts/165070564",
        linkSource: "api_identity",
        status: "active"
      })
    });
  });
});

describe("DbCanonicalStore preserved-post media URLs", () => {
  it.each(["PATREON", "SUBSCRIBESTAR"] as const)("persists a URL-only replay for %s without recreating posts or media", async (source) => {
    const { tx } = mockTx();
    const postId = source === "PATREON" ? "patreon_post_123" : "substar_post_123";
    const snapshot: CanonicalSnapshot = { ingest_idempotency: {}, campaigns: {}, tiers: {}, posts: {}, media: {} };
    const bus = new InMemoryEventBus();
    const input = {
      creator_id: "cr1",
      campaigns: [{ campaign_id: "camp1", name: "Main", upstream_updated_at: "2026-10-01T00:00:00.000Z" }],
      posts: [{
        post_id: postId, title: "Original", published_at: "2026-10-01T00:00:00.000Z",
        tag_ids: [], tier_ids: [], upstream_revision: "r1",
        media: [{ media_id: "asset1", upstream_revision: "m1", upstream_url: "https://cdn.example/original" }]
      }]
    };
    applySyncBatchToSnapshot(snapshot, input, "j1", "trace", bus);
    tx.post.findMany.mockImplementation(async ({ where }: { where: { creatorId: unknown; source: string } }) =>
      where.creatorId === "cr1" && where.source === source
        ? [{ id: postId, campaignId: "camp1", upstreamStatus: "active", versions: [{ versionSeq: 1, upstreamRevision: "r1" }] }]
        : []
    );
    tx.mediaAsset.findMany.mockResolvedValue([
      { id: "asset1", primaryPostId: postId, currentUpstreamRevision: "m1", currentUpstreamUrl: "https://cdn.example/original" }
    ]);
    input.posts[0]!.media[0]!.upstream_url = "https://cdn.example/refreshed";
    applySyncBatchToSnapshot(snapshot, input, "j2", "trace", bus);
    const store = new DbCanonicalStore(mockPrisma(() => ({ tx })) as never);
    await store.saveForCreator("cr1", snapshot);

    expect(tx.mediaAsset.findMany).toHaveBeenCalledWith({
      where: { creatorId: "cr1", ingestOrigin: source, primaryPostId: { in: [postId] } },
      select: { id: true, primaryPostId: true, currentUpstreamRevision: true, currentUpstreamUrl: true, upstreamStatus: true }
    });
    expect(tx.mediaAsset.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.mediaAsset.updateMany).toHaveBeenCalledWith({
      where: {
        id: "asset1", creatorId: "cr1", primaryPostId: postId, ingestOrigin: source,
        currentUpstreamRevision: "m1", currentUpstreamUrl: "https://cdn.example/original"
      },
      data: { currentUpstreamUrl: "https://cdn.example/refreshed" }
    });
    expect(tx.post.create).not.toHaveBeenCalled();
    expect(tx.post.deleteMany).not.toHaveBeenCalled();
    expect(tx.mediaAsset.createMany).not.toHaveBeenCalled();
    expect(bus.getAll()).toHaveLength(1);

    tx.mediaAsset.updateMany.mockClear();
    tx.mediaAsset.findMany.mockResolvedValue([
      { id: "asset1", primaryPostId: postId, currentUpstreamRevision: "m1", currentUpstreamUrl: "https://cdn.example/refreshed" }
    ]);
    await store.saveForCreator("cr1", snapshot);
    expect(tx.mediaAsset.updateMany).not.toHaveBeenCalled();

    tx.mediaAsset.findMany.mockResolvedValue([
      { id: "asset1", primaryPostId: postId, currentUpstreamRevision: "m2", currentUpstreamUrl: "https://cdn.example/m2" }
    ]);
    await store.saveForCreator("cr1", snapshot);
    expect(tx.mediaAsset.updateMany).not.toHaveBeenCalled();
  });
});

describe("DbCanonicalStore deletion replay", () => {
  it("round-trips deletion markers for absent targets through existing storage", async () => {
    const { tx } = mockTx();
    const snapshot: CanonicalSnapshot = { ingest_idempotency: {}, campaigns: {}, tiers: {}, posts: {}, media: {} };
    const deletion = { creator_id: "cr1", tombstones: [{ entity_type: "post" as const, id: "absent", deleted_at: "2026-10-01T00:00:00.000Z" }] };
    applySyncBatchToSnapshot(snapshot, deletion, "j1", "trace", new InMemoryEventBus());
    const prisma = {
      ...mockPrisma(() => ({ tx })),
      campaign: { findMany: vi.fn().mockResolvedValue([]) },
      tier: { findMany: vi.fn().mockResolvedValue([]) },
      post: { findMany: vi.fn().mockResolvedValue([]) },
      postVersion: { findMany: vi.fn().mockResolvedValue([]) },
      mediaAsset: { findMany: vi.fn().mockResolvedValue([]) },
      ingestIdempotencyKey: { findMany: vi.fn().mockResolvedValue([]) }
    };
    const store = new DbCanonicalStore(prisma as never);
    await store.saveForCreator("cr1", snapshot);
    expect(tx.ingestIdempotencyKey.createMany).toHaveBeenCalledTimes(1);
    const rows = tx.ingestIdempotencyKey.createMany.mock.calls[0]![0].data;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ creatorId: "cr1", batchKey: expect.stringMatching(/^ingest_deletion:v1:/) });
    prisma.ingestIdempotencyKey.findMany.mockResolvedValue(rows);
    const reloaded = await store.loadForCreator("cr1");
    expect(reloaded.ingest_idempotency).toEqual(snapshot.ingest_idempotency);
    expect(applySyncBatchToSnapshot(reloaded, deletion, "j2", "trace", new InMemoryEventBus()))
      .toMatchObject({ tombstones_applied: 0, idempotent_skips: 1 });
  });

  it.each(["PATREON", "SUBSCRIBESTAR"] as const)("persists a media deletion under an unchanged %s post without rewriting its history", async (source) => {
    const { tx } = mockTx();
    const postId = source === "PATREON" ? "patreon_post_123" : "substar_post_123";
    const snapshot: CanonicalSnapshot = { ingest_idempotency: {}, campaigns: {}, tiers: {}, posts: {}, media: {} };
    const bus = new InMemoryEventBus();
    applySyncBatchToSnapshot(snapshot, {
      creator_id: "cr1",
      campaigns: [{ campaign_id: "camp1", name: "Main", upstream_updated_at: "2026-10-01T00:00:00.000Z" }],
      posts: [{ post_id: postId, title: "Original", published_at: "2026-10-01T00:00:00.000Z", tag_ids: [], tier_ids: [], upstream_revision: "r1",
        media: [{ media_id: "asset1", upstream_revision: "m1" }] }]
    }, "j1", "trace", bus);
    const deletion = { creator_id: "cr1", tombstones: [{ entity_type: "media" as const, id: "asset1", deleted_at: "2026-10-02T00:00:00.000Z" }] };
    applySyncBatchToSnapshot(snapshot, deletion, "j2", "trace", bus);
    tx.post.findMany.mockImplementation(async ({ where }: { where: { creatorId: unknown; source: string } }) =>
      where.creatorId === "cr1" && where.source === source
        ? [{ id: postId, campaignId: "camp1", upstreamStatus: "active", versions: [{ versionSeq: 1, upstreamRevision: "r1" }] }]
        : []
    );
    const dbMedia = { id: "asset1", primaryPostId: postId, currentUpstreamRevision: "m1", currentUpstreamUrl: null, upstreamStatus: "active" };
    tx.mediaAsset.findMany.mockResolvedValue([dbMedia]);
    const store = new DbCanonicalStore(mockPrisma(() => ({ tx })) as never);
    await store.saveForCreator("cr1", snapshot);
    expect(tx.mediaAsset.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.mediaAsset.updateMany.mock.calls[0]![0]).toMatchObject({
      where: { id: "asset1", creatorId: "cr1", primaryPostId: postId, ingestOrigin: source, currentUpstreamRevision: "m1", upstreamStatus: "active" },
      data: { upstreamStatus: "deleted" }
    });
    expect(tx.post.create).not.toHaveBeenCalled();
    expect(tx.mediaAsset.createMany).not.toHaveBeenCalled();

    tx.mediaAsset.updateMany.mockClear();
    tx.mediaAsset.findMany.mockResolvedValue([{ ...dbMedia, currentUpstreamRevision: "different-stored-revision" }]);
    await store.saveForCreator("cr1", snapshot);
    expect(tx.mediaAsset.updateMany.mock.calls[0]![0]).toMatchObject({
      where: { currentUpstreamRevision: "different-stored-revision" }, data: { upstreamStatus: "deleted" }
    });

    // Model a later restored revision for this store-level replay check.
    snapshot.media.cr1!.asset1!.upstream_status = "active";
    snapshot.media.cr1!.asset1!.current.upstream_revision = "m2";
    tx.mediaAsset.findMany.mockResolvedValue([{ ...dbMedia, currentUpstreamRevision: "m2" }]);
    tx.mediaAsset.updateMany.mockClear();
    const replay = applySyncBatchToSnapshot(snapshot, deletion, "j3", "trace", bus);
    expect(replay).toMatchObject({ tombstones_applied: 0, idempotent_skips: 1 });
    await store.saveForCreator("cr1", snapshot);
    expect(tx.mediaAsset.updateMany).not.toHaveBeenCalled();

    snapshot.media.cr1!.asset1!.upstream_status = "deleted";
    tx.mediaAsset.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(store.saveForCreator("cr1", snapshot)).rejects.toThrow("Media changed while applying deletion");
  });
});

describe("DbCanonicalStore fresh media reactivation", () => {
  it.each(["PATREON", "SUBSCRIBESTAR"] as const)("saves active m2 and its history with a fresh %s post revision", async (source) => {
    const { tx } = mockTx();
    const postId = source === "PATREON" ? "patreon_post_123" : "substar_post_123";
    const snapshot: CanonicalSnapshot = { ingest_idempotency: {}, campaigns: {}, tiers: {}, posts: {}, media: {} };
    const bus = new InMemoryEventBus();
    const input = {
      creator_id: "cr1",
      campaigns: [{ campaign_id: "camp1", name: "Main", upstream_updated_at: "2026-10-01T00:00:00.000Z" }],
      posts: [{ post_id: postId, title: "Original", published_at: "2026-10-01T00:00:00.000Z", tag_ids: [], tier_ids: [], upstream_revision: "r1",
        media: [{ media_id: "asset1", upstream_revision: "m1" }] }]
    };
    applySyncBatchToSnapshot(snapshot, input, "j1", "trace", bus);
    applySyncBatchToSnapshot(snapshot, {
      creator_id: "cr1", tombstones: [{ entity_type: "media", id: "asset1", deleted_at: "2026-10-02T00:00:00.000Z" }]
    }, "j2", "trace", bus);
    input.posts[0]!.upstream_revision = "r2";
    input.posts[0]!.media[0]!.upstream_revision = "m2";
    applySyncBatchToSnapshot(snapshot, input, "j3", "trace", bus);
    tx.post.findMany.mockImplementation(async ({ where }: { where: { creatorId: unknown; source: string } }) =>
      where.creatorId === "cr1" && where.source === source
        ? [{ id: postId, campaignId: "camp1", upstreamStatus: "active", versions: [{ versionSeq: 1, upstreamRevision: "r1" }] }]
        : []
    );

    await new DbCanonicalStore(mockPrisma(() => ({ tx })) as never).saveForCreator("cr1", snapshot);

    const rows = tx.mediaAsset.createMany.mock.calls[0]![0].data;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "asset1", creatorId: "cr1", upstreamStatus: "active", currentUpstreamRevision: "m2", currentVersionSeq: 2, ingestOrigin: source });
    expect(rows[0].versionsJson.map((version: { upstream_revision: string }) => version.upstream_revision)).toEqual(["m1", "m2"]);
    expect(tx.post.update.mock.calls[0]![0].data.versions.create).toHaveLength(2);
  });
});
