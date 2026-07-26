import { describe, expect, it, vi } from "vitest";
import { getPublicPatronCollectionDetail } from "../src/patron/public-patron-collections-service.js";

type Snapshot = { entitledTierIds: string[]; active: boolean };

type CollectionEntrySeed = {
  id: string;
  collectionId: string;
  patronMembershipId: string;
  creatorId: string;
  postId: string;
  mediaId: string;
  createdAt?: Date;
  snapshotTierIds?: string[];
};

type CollectionSeed = {
  id: string;
  title: string;
  isPublic: boolean;
  createdAt?: Date;
  entries: CollectionEntrySeed[];
};

function makePrismaForPublicCollection(args: {
  collections: CollectionSeed[];
  posts: Array<{
    id: string;
    creatorId: string;
    isPublic?: boolean;
    tierIds: string[];
  }>;
  accountSnapshots?: Record<string, Record<string, Snapshot | undefined>>;
}) {
  const memberships = new Map<string, { id: string; creatorId: string }[]>();
  Object.keys(args.accountSnapshots ?? {}).forEach((accountId, i) => {
    const rows: { id: string; creatorId: string }[] = [];
    Object.keys(args.accountSnapshots![accountId]).forEach((creatorId, j) => {
      rows.push({ id: `m_${i}_${j}_${creatorId}`, creatorId });
    });
    memberships.set(accountId, rows);
  });

  return {
    post: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const post = args.posts.find(
          (p) => p.id === where.id && p.creatorId === where.creatorId
        );
        if (!post) return null;
        return {
          isPublic: post.isPublic ?? false,
          versions: [{ tierIds: post.tierIds }]
        };
      }),
      findMany: vi.fn(
        async ({
          where
        }: {
          where: { id: { in: string[] }; creatorId: { in: string[] } };
        }) => {
          return args.posts
            .filter(
              (p) =>
                where.id.in.includes(p.id) && where.creatorId.in.includes(p.creatorId)
            )
            .map((p) => ({
              id: p.id,
              creatorId: p.creatorId,
              isPublic: p.isPublic ?? false,
              versions: [{ tierIds: p.tierIds }]
            }));
        }
      )
    },
    tenantMembership: {
      // loadHideMatureContentForAccount calls findFirst; return null = no hide-mature preference set.
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn(
        async ({
          where
        }: {
          where: {
            accountId: string;
            tenant?: { relayCreatorId?: string | { in: string[] } };
          };
        }) => {
          const rows = memberships.get(where.accountId) ?? [];
          if (where.tenant?.relayCreatorId) {
            const r = where.tenant.relayCreatorId;
            if (typeof r === "string") {
              return rows
                .filter((m) => m.creatorId === r)
                .map((m) => ({
                  id: m.id,
                  tenant: { relayCreatorId: m.creatorId }
                }));
            }
            return rows
              .filter((m) => r.in.includes(m.creatorId))
              .map((m) => ({
                id: m.id,
                tenant: { relayCreatorId: m.creatorId }
              }));
          }
          return rows.map((m) => ({
            id: m.id,
            tenant: { relayCreatorId: m.creatorId }
          }));
        }
      )
    },
    patronEntitlementSnapshot: {
      findFirst: vi.fn(
        async ({
          where
        }: {
          where: {
            patronMembershipId: { in: string[] };
            relayCreatorId: string;
          };
        }) => {
          for (const [accountId, perCreator] of Object.entries(
            args.accountSnapshots ?? {}
          )) {
            const rows = memberships.get(accountId) ?? [];
            for (const m of rows) {
              if (
                where.patronMembershipId.in.includes(m.id) &&
                m.creatorId === where.relayCreatorId
              ) {
                const snap = perCreator[where.relayCreatorId];
                return snap ? { ...snap } : null;
              }
            }
          }
          return null;
        }
      ),
      findMany: vi.fn(
        async ({
          where
        }: {
          where: { patronMembershipId: { in: string[] } };
        }) => {
          const out: Array<{
            patronMembershipId: string;
            relayCreatorId: string;
            entitledTierIds: string[];
            active: boolean;
          }> = [];
          for (const [accountId, perCreator] of Object.entries(
            args.accountSnapshots ?? {}
          )) {
            const rows = memberships.get(accountId) ?? [];
            for (const m of rows) {
              if (where.patronMembershipId.in.includes(m.id)) {
                const snap = perCreator[m.creatorId];
                if (snap) {
                  out.push({
                    patronMembershipId: m.id,
                    relayCreatorId: m.creatorId,
                    ...snap
                  });
                }
              }
            }
          }
          return out;
        }
      )
    },
    tier: {
      // computeViewerEntitlementsForPostsBulk calls getTierCatalogForCreators which queries tiers.
      findMany: vi.fn(
        async ({ where }: { where: { creatorId: { in: string[] } } }) => {
          const rows: Array<{
            relayTierId: string;
            creatorId: string;
            campaignId: null;
            title: string;
            amountCents: number;
            upstreamUpdatedAt: Date;
            versionSeq: number;
          }> = [];
          if (where.creatorId.in.includes("creator_a")) {
            rows.push({
              relayTierId: "tier_paid",
              creatorId: "creator_a",
              campaignId: null,
              title: "Paid",
              amountCents: 500,
              upstreamUpdatedAt: new Date("2026-01-01T00:00:00.000Z"),
              versionSeq: 1
            });
          }
          return rows;
        }
      )
    },
    tipReveal: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([])
    },
    patronSavedCollection: {
      findFirst: vi.fn(
        async ({
          where
        }: {
          where: { id: string; isPublic?: boolean };
        }) => {
          const col = args.collections.find((c) => c.id === where.id);
          if (!col) return null;
          if (where.isPublic === true && !col.isPublic) return null;
          return {
            id: col.id,
            title: col.title,
            createdAt: col.createdAt ?? new Date("2026-04-01T00:00:00.000Z"),
            entries: col.entries.map((e) => ({
              id: e.id,
              collectionId: e.collectionId,
              patronMembershipId: e.patronMembershipId,
              creatorId: e.creatorId,
              postId: e.postId,
              mediaId: e.mediaId,
              createdAt: e.createdAt ?? new Date("2026-04-02T00:00:00.000Z"),
              snapshotTierIds: e.snapshotTierIds ?? []
            }))
          };
        }
      )
    }
  } as never;
}

const CREATOR_A = "creator_a";
const CREATOR_B = "creator_b";
const TIER_PAID = "tier_paid";
const COL_PUBLIC = "pcol_public";
const COL_PRIVATE = "pcol_private";
const COL_OTHER_TENANT = "pcol_other_tenant";

const baseEntries: CollectionEntrySeed[] = [
  {
    id: "pent_free",
    collectionId: COL_PUBLIC,
    patronMembershipId: "patron_m1",
    creatorId: CREATOR_A,
    postId: "post_free",
    mediaId: "media_free"
  },
  {
    id: "pent_gated",
    collectionId: COL_PUBLIC,
    patronMembershipId: "patron_m1",
    creatorId: CREATOR_A,
    postId: "post_gated",
    mediaId: "media_gated"
  }
];

const basePosts = [
  { id: "post_free", creatorId: CREATOR_A, tierIds: [] as string[] },
  { id: "post_gated", creatorId: CREATOR_A, tierIds: [TIER_PAID] }
];

describe("getPublicPatronCollectionDetail — viewer entitlement matrix", () => {
  it("owner views own public collection with active subscription — gated entries visible", async () => {
    const prisma = makePrismaForPublicCollection({
      collections: [
        { id: COL_PUBLIC, title: "Public", isPublic: true, entries: baseEntries }
      ],
      posts: basePosts,
      accountSnapshots: {
        owner_account: {
          [CREATOR_A]: { entitledTierIds: [TIER_PAID], active: true }
        }
      }
    });
    const out = await getPublicPatronCollectionDetail(prisma, COL_PUBLIC, "owner_account");
    expect(out?.entry_count).toBe(2);
    const gated = out!.entries.find((e) => e.post_id === "post_gated");
    const free = out!.entries.find((e) => e.post_id === "post_free");
    expect(gated?.viewer_entitlement.state).toBe("visible");
    expect(free?.viewer_entitlement.state).toBe("visible");
  });

  it("owner views own collection with lapsed subscription — gated locked, free visible", async () => {
    const prisma = makePrismaForPublicCollection({
      collections: [
        { id: COL_PUBLIC, title: "Public", isPublic: true, entries: baseEntries }
      ],
      posts: basePosts,
      accountSnapshots: {
        owner_account: {
          [CREATOR_A]: { entitledTierIds: [TIER_PAID], active: false }
        }
      }
    });
    const out = await getPublicPatronCollectionDetail(prisma, COL_PUBLIC, "owner_account");
    const gated = out!.entries.find((e) => e.post_id === "post_gated");
    const free = out!.entries.find((e) => e.post_id === "post_free");
    expect(gated?.viewer_entitlement.state).toBe("locked");
    expect(gated?.viewer_entitlement.source).toBe("inactive_snapshot");
    expect(free?.viewer_entitlement.state).toBe("visible");
  });

  it("third-party viewer with active sub sees entitled entries as visible", async () => {
    const prisma = makePrismaForPublicCollection({
      collections: [
        { id: COL_PUBLIC, title: "Public", isPublic: true, entries: baseEntries }
      ],
      posts: basePosts,
      accountSnapshots: {
        third_party: {
          [CREATOR_A]: { entitledTierIds: [TIER_PAID], active: true }
        }
      }
    });
    const out = await getPublicPatronCollectionDetail(prisma, COL_PUBLIC, "third_party");
    expect(out!.entries.find((e) => e.post_id === "post_gated")?.viewer_entitlement.state).toBe(
      "visible"
    );
  });

  it("third-party viewer with lapsed sub sees gated entries locked", async () => {
    const prisma = makePrismaForPublicCollection({
      collections: [
        { id: COL_PUBLIC, title: "Public", isPublic: true, entries: baseEntries }
      ],
      posts: basePosts,
      accountSnapshots: {
        third_party: {
          [CREATOR_A]: { entitledTierIds: [TIER_PAID], active: false }
        }
      }
    });
    const out = await getPublicPatronCollectionDetail(prisma, COL_PUBLIC, "third_party");
    const gated = out!.entries.find((e) => e.post_id === "post_gated");
    expect(gated?.viewer_entitlement.state).toBe("locked");
    expect(gated?.viewer_entitlement.source).toBe("inactive_snapshot");
  });

  it("unauthenticated viewer sees gated entries locked and free entries visible", async () => {
    const prisma = makePrismaForPublicCollection({
      collections: [
        { id: COL_PUBLIC, title: "Public", isPublic: true, entries: baseEntries }
      ],
      posts: basePosts
    });
    const out = await getPublicPatronCollectionDetail(prisma, COL_PUBLIC, null);
    expect(out!.entries.find((e) => e.post_id === "post_gated")?.viewer_entitlement).toEqual({
      state: "locked",
      required_tier_ids: [TIER_PAID],
      source: "missing_snapshot"
    });
    expect(out!.entries.find((e) => e.post_id === "post_free")?.viewer_entitlement.state).toBe(
      "visible"
    );
  });

  it("does not leak another tenant's collection entries when scoped by collection id", async () => {
    const prisma = makePrismaForPublicCollection({
      collections: [
        {
          id: COL_PUBLIC,
          title: "Tenant A public",
          isPublic: true,
          entries: baseEntries
        },
        {
          id: COL_OTHER_TENANT,
          title: "Tenant B shelf",
          isPublic: true,
          entries: [
            {
              id: "pent_b_only",
              collectionId: COL_OTHER_TENANT,
              patronMembershipId: "patron_m2",
              creatorId: CREATOR_B,
              postId: "post_b",
              mediaId: "media_b"
            }
          ]
        }
      ],
      posts: [
        ...basePosts,
        { id: "post_b", creatorId: CREATOR_B, tierIds: [TIER_PAID] }
      ],
      accountSnapshots: {
        tenant_b_viewer: {
          [CREATOR_B]: { entitledTierIds: [TIER_PAID], active: true }
        }
      }
    });
    const out = await getPublicPatronCollectionDetail(prisma, COL_PUBLIC, "tenant_b_viewer");
    expect(out?.collection_id).toBe(COL_PUBLIC);
    expect(out?.entries.map((e) => e.post_id).sort()).toEqual(["post_free", "post_gated"]);
    expect(out?.entries.every((e) => e.creator_id === CREATOR_A)).toBe(true);
  });

  it("returns null for private collections (enumeration resistance)", async () => {
    const prisma = makePrismaForPublicCollection({
      collections: [
        {
          id: COL_PRIVATE,
          title: "Private",
          isPublic: false,
          entries: baseEntries
        }
      ],
      posts: basePosts,
      accountSnapshots: {
        owner_account: {
          [CREATOR_A]: { entitledTierIds: [TIER_PAID], active: true }
        }
      }
    });
    expect(await getPublicPatronCollectionDetail(prisma, COL_PRIVATE, "owner_account")).toBeNull();
  });

  it("locks entries referencing deleted/inactive posts with missing_snapshot", async () => {
    const prisma = makePrismaForPublicCollection({
      collections: [
        {
          id: COL_PUBLIC,
          title: "Public",
          isPublic: true,
          entries: [
            {
              id: "pent_orphan",
              collectionId: COL_PUBLIC,
              patronMembershipId: "patron_m1",
              creatorId: CREATOR_A,
              postId: "post_deleted",
              mediaId: "media_orphan"
            }
          ]
        }
      ],
      posts: basePosts,
      accountSnapshots: {
        owner_account: {
          [CREATOR_A]: { entitledTierIds: [TIER_PAID], active: true }
        }
      }
    });
    const out = await getPublicPatronCollectionDetail(prisma, COL_PUBLIC, "owner_account");
    expect(out?.entries[0]?.viewer_entitlement).toEqual({
      state: "locked",
      required_tier_ids: [],
      source: "missing_snapshot"
    });
  });
});
