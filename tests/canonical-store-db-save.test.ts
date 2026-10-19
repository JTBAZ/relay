import { describe, expect, it, vi } from "vitest";
import type { CanonicalSnapshot, PostVersionRow } from "../src/ingest/canonical-store.js";
import { InMemoryEventBus } from "../src/events/event-bus.js";
import { applySyncBatchToSnapshot } from "../src/ingest/apply-batch.js";
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
    postTier: {
      deleteMany: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
      createMany: vi.fn().mockResolvedValue({})
    },
    mediaAsset: {
      deleteMany: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 1 })
    },
    postVersion: { deleteMany: vi.fn().mockResolvedValue({}) },
    post: {
      deleteMany: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: postCreate
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
    ingestIdempotencyKey: { deleteMany: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({}) },
    creativeWorkMember: {
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
      select: { id: true, primaryPostId: true, currentUpstreamRevision: true, currentUpstreamUrl: true }
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
