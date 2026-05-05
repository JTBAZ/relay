import { describe, expect, it, vi } from "vitest";

import type { CanonicalSnapshot } from "../src/ingest/canonical-store.js";
import { DbCanonicalStore } from "../src/ingest/canonical-store-db.js";

/**
 * Validates that when Patreon posts are stomped and recreated (`post.deleteMany` +
 * `post.create`), Relay `PostPresentation` rows backed up beforehand are recreated so
 * merge-at-read overlays survive ingest (BO-RPB-03).
 */
describe("DbCanonicalStore — PostPresentation survives Patreon stomp", () => {
  it("backups Relay presentation rows before deletes and restores after post recreation", async () => {
    const relayPresentationBackup = [
      {
        id: "pp_row_1",
        creatorId: "cr_pres",
        postId: "patreon_post_stomp_me",
        relayTitle: "Relay-only title",
        relayDescription: null,
        mediaOrder: [],
        tierPreviewSettings: null,
        updatedAt: new Date("2026-02-01T12:00:00.000Z")
      }
    ];

    const findPresentation = vi.fn().mockResolvedValue(relayPresentationBackup);
    const createPresentation = vi.fn().mockResolvedValue({});

    const existingPatreonRow = {
      id: "patreon_post_stomp_me",
      campaignId: "patreon_campaign_1",
      upstreamStatus: "active" as const,
      versions: [{ versionSeq: 1, upstreamRevision: "rev_before" }]
    };

    const postFindMany = vi.fn().mockImplementation(async (args: { where?: Record<string, unknown> }) => {
      const w = args.where ?? {};
      if (w.id && (w as { creatorId?: { not?: string } }).creatorId?.not) {
        return [];
      }
      return [existingPatreonRow];
    });
    const postDeleteMany = vi.fn().mockResolvedValue({ count: 1 });
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
        findMany: postFindMany,
        deleteMany: postDeleteMany,
        create: postCreate,
        count: vi.fn().mockResolvedValue(0)
      },
      postPresentation: {
        findMany: findPresentation,
        create: createPresentation
      },
      tier: {
        deleteMany: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([{ id: "cr_pres::relay_tier_public" }]),
        upsert: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({})
      },
      campaign: {
        findMany: vi.fn().mockResolvedValue([{ id: "patreon_campaign_1" }]),
        upsert: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({})
      },
      ingestIdempotencyKey: { deleteMany: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({}) }
    };

    const prisma = {
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx))
    };

    const store = new DbCanonicalStore(prisma as never);

    const vIncoming = {
      version_seq: 1,
      upstream_revision: "rev_after",
      title: "Ingest title",
      published_at: "2026-04-01T12:00:00.000Z",
      tag_ids: [] as string[],
      tier_ids: ["relay_tier_public"],
      media_ids: [] as string[],
      ingested_at: "2026-04-01T12:00:00.000Z"
    };

    const snapshot: CanonicalSnapshot = {
      ingest_idempotency: {},
      campaigns: {
        cr_pres: {
          patreon_campaign_1: {
            campaign_id: "patreon_campaign_1",
            creator_id: "cr_pres",
            name: "Camp",
            upstream_updated_at: "2026-01-01T00:00:00.000Z",
            version_seq: 1
          }
        }
      },
      tiers: {
        cr_pres: {
          relay_tier_public: {
            tier_id: "relay_tier_public",
            creator_id: "cr_pres",
            campaign_id: "patreon_campaign_1",
            title: "Public",
            upstream_updated_at: "2026-01-01T00:00:00.000Z",
            version_seq: 1
          }
        }
      },
      posts: {
        cr_pres: {
          patreon_post_stomp_me: {
            post_id: "patreon_post_stomp_me",
            creator_id: "cr_pres",
            upstream_status: "active",
            current: vIncoming,
            versions: [vIncoming]
          }
        }
      },
      media: {}
    };

    await store.saveForCreator("cr_pres", snapshot);

    expect(tx.mediaAsset.deleteMany).toHaveBeenCalledWith({
      where: {
        primaryPostId: { in: ["patreon_post_stomp_me"] },
        ingestOrigin: "PATREON"
      }
    });

    expect(findPresentation).toHaveBeenCalledWith({
      where: { postId: { in: ["patreon_post_stomp_me"] } }
    });
    expect(postDeleteMany).toHaveBeenCalled();
    expect(createPresentation).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: "pp_row_1",
        creatorId: "cr_pres",
        postId: "patreon_post_stomp_me",
        relayTitle: "Relay-only title"
      })
    });
  });
});
