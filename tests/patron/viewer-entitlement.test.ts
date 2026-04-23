import { describe, expect, it, vi } from "vitest";

import {
  computeViewerEntitlementForPost,
  computeViewerEntitlementsForPostsBulk,
  resolveCurrentEntitledTierIdsForAccount
} from "../../src/patron/viewer-entitlement.js";

/**
 * PE-D / D29 — viewer-aware entitlement re-check unit tests.
 *
 * The whole point of this helper is the LIVE re-check: a viewer's access state for a saved
 * favorite/collection-entry must reflect their CURRENT entitlement, not whatever they had at
 * save time. These tests pin that contract.
 */

type Snapshot = { entitledTierIds: string[]; active: boolean };

function makePrismaWith(args: {
  posts: Array<{
    id: string;
    creatorId: string;
    isPublic?: boolean;
    tierIds: string[];
  }>;
  /** Keyed by accountId. Each entry maps relayCreatorId → snapshot row (or undefined for none). */
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
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] }; creatorId: { in: string[] } } }) => {
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
      })
    },
    tenantMembership: {
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
    }
  } as never;
}

describe("computeViewerEntitlementForPost", () => {
  it("returns visible/free_post when the post requires no tiers", async () => {
    const prisma = makePrismaWith({
      posts: [{ id: "p1", creatorId: "c1", tierIds: [] }]
    });
    const decision = await computeViewerEntitlementForPost({
      prisma,
      viewer_account_id: null,
      source_creator_id: "c1",
      source_post_id: "p1"
    });
    expect(decision).toEqual({
      state: "visible",
      required_tier_ids: [],
      source: "free_post"
    });
  });

  it("returns visible/free_post when the post is marked is_public regardless of tier ids", async () => {
    const prisma = makePrismaWith({
      posts: [{ id: "p1", creatorId: "c1", isPublic: true, tierIds: ["t_paid"] }]
    });
    const decision = await computeViewerEntitlementForPost({
      prisma,
      viewer_account_id: null,
      source_creator_id: "c1",
      source_post_id: "p1"
    });
    expect(decision.state).toBe("visible");
    expect(decision.source).toBe("free_post");
  });

  it("locks when no viewer account is supplied and the post requires tiers", async () => {
    const prisma = makePrismaWith({
      posts: [{ id: "p1", creatorId: "c1", tierIds: ["t1"] }]
    });
    const decision = await computeViewerEntitlementForPost({
      prisma,
      viewer_account_id: null,
      source_creator_id: "c1",
      source_post_id: "p1"
    });
    expect(decision).toEqual({
      state: "locked",
      required_tier_ids: ["t1"],
      source: "missing_snapshot"
    });
  });

  it("returns visible when viewer's active snapshot intersects required tiers", async () => {
    const prisma = makePrismaWith({
      posts: [{ id: "p1", creatorId: "c1", tierIds: ["t1", "t2"] }],
      accountSnapshots: {
        a1: { c1: { entitledTierIds: ["t2"], active: true } }
      }
    });
    const decision = await computeViewerEntitlementForPost({
      prisma,
      viewer_account_id: "a1",
      source_creator_id: "c1",
      source_post_id: "p1"
    });
    expect(decision.state).toBe("visible");
    expect(decision.required_tier_ids).toEqual(["t1", "t2"]);
    expect(decision.source).toBe("active_snapshot");
  });

  it("locks (active_snapshot) when viewer's tiers do NOT intersect — D29 lapsed-tier semantic", async () => {
    const prisma = makePrismaWith({
      posts: [{ id: "p1", creatorId: "c1", tierIds: ["t1"] }],
      accountSnapshots: {
        a1: { c1: { entitledTierIds: ["t_other"], active: true } }
      }
    });
    const decision = await computeViewerEntitlementForPost({
      prisma,
      viewer_account_id: "a1",
      source_creator_id: "c1",
      source_post_id: "p1"
    });
    expect(decision.state).toBe("locked");
    expect(decision.source).toBe("active_snapshot");
  });

  it("locks (inactive_snapshot) when snapshot is present but flagged inactive", async () => {
    const prisma = makePrismaWith({
      posts: [{ id: "p1", creatorId: "c1", tierIds: ["t1"] }],
      accountSnapshots: {
        a1: { c1: { entitledTierIds: ["t1"], active: false } }
      }
    });
    const decision = await computeViewerEntitlementForPost({
      prisma,
      viewer_account_id: "a1",
      source_creator_id: "c1",
      source_post_id: "p1"
    });
    expect(decision.state).toBe("locked");
    expect(decision.source).toBe("inactive_snapshot");
  });

  it("locks (missing_snapshot) when account has no snapshot row for the source creator", async () => {
    const prisma = makePrismaWith({
      posts: [{ id: "p1", creatorId: "c1", tierIds: ["t1"] }],
      accountSnapshots: {
        a1: { c2: { entitledTierIds: ["t1"], active: true } }
      }
    });
    const decision = await computeViewerEntitlementForPost({
      prisma,
      viewer_account_id: "a1",
      source_creator_id: "c1",
      source_post_id: "p1"
    });
    expect(decision.state).toBe("locked");
    expect(decision.source).toBe("missing_snapshot");
  });
});

describe("computeViewerEntitlementsForPostsBulk", () => {
  it("returns empty map for empty input without touching prisma", async () => {
    const prisma = makePrismaWith({ posts: [] });
    const out = await computeViewerEntitlementsForPostsBulk({
      prisma,
      viewer_account_id: null,
      targets: []
    });
    expect(out.size).toBe(0);
    expect((prisma as never as { post: { findMany: { mock: { calls: unknown[] } } } }).post.findMany.mock.calls.length).toBe(0);
  });

  it("emits one decision per unique target and re-uses bulk fetches", async () => {
    const prisma = makePrismaWith({
      posts: [
        { id: "p1", creatorId: "c1", tierIds: ["t1"] },
        { id: "p2", creatorId: "c2", tierIds: [] }
      ],
      accountSnapshots: {
        a1: { c1: { entitledTierIds: ["t1"], active: true } }
      }
    });
    const out = await computeViewerEntitlementsForPostsBulk({
      prisma,
      viewer_account_id: "a1",
      targets: [
        { source_creator_id: "c1", source_post_id: "p1" },
        { source_creator_id: "c1", source_post_id: "p1" },
        { source_creator_id: "c2", source_post_id: "p2" }
      ]
    });
    expect(out.size).toBe(2);
    expect(out.get("c1\0p1")?.state).toBe("visible");
    expect(out.get("c2\0p2")?.state).toBe("visible");
    expect(
      (prisma as never as { post: { findMany: { mock: { calls: unknown[] } } } }).post.findMany.mock.calls.length
    ).toBe(1);
  });

  it("returns missing_snapshot for unknown post ids without crashing", async () => {
    const prisma = makePrismaWith({ posts: [] });
    const out = await computeViewerEntitlementsForPostsBulk({
      prisma,
      viewer_account_id: "a1",
      targets: [{ source_creator_id: "c1", source_post_id: "ghost" }]
    });
    expect(out.get("c1\0ghost")).toEqual({
      state: "locked",
      required_tier_ids: [],
      source: "missing_snapshot"
    });
  });
});

describe("resolveCurrentEntitledTierIdsForAccount", () => {
  it("returns [] when accountId is null (forensic snapshot for unlinked viewers)", async () => {
    const prisma = makePrismaWith({ posts: [] });
    const ids = await resolveCurrentEntitledTierIdsForAccount(prisma, null, "c1");
    expect(ids).toEqual([]);
  });

  it("returns the active snapshot's tier ids", async () => {
    const prisma = makePrismaWith({
      posts: [],
      accountSnapshots: {
        a1: { c1: { entitledTierIds: ["t_premium", "t_basic"], active: true } }
      }
    });
    const ids = await resolveCurrentEntitledTierIdsForAccount(prisma, "a1", "c1");
    expect(ids).toEqual(["t_premium", "t_basic"]);
  });

  it("returns [] when the snapshot exists but is inactive", async () => {
    const prisma = makePrismaWith({
      posts: [],
      accountSnapshots: {
        a1: { c1: { entitledTierIds: ["t_basic"], active: false } }
      }
    });
    const ids = await resolveCurrentEntitledTierIdsForAccount(prisma, "a1", "c1");
    expect(ids).toEqual([]);
  });
});
