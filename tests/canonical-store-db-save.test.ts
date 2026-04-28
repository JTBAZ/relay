import { describe, expect, it, vi } from "vitest";
import type { PostVersionRow } from "../src/ingest/canonical-store.js";
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
    mediaAsset: { deleteMany: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({}) },
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
    ingestIdempotencyKey: { deleteMany: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({}) }
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
});
