import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/db.js";
import {
  clearSupabaseRlsContext,
  setSupabaseRlsContext
} from "../../src/lib/supabase-rls-context.js";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());

/** Stable ids so reruns do not collide with dev data. */
const P = {
  t1: "rls_tw_tenant_t1",
  t2: "rls_tw_tenant_t2",
  cr1: "rls_tw_cr1",
  cr2: "rls_tw_cr2",
  camp: "rls_tw_campaign",
  accA: "rls_tw_acc_a",
  accB: "rls_tw_acc_b",
  accC: "rls_tw_acc_c",
  accD: "rls_tw_acc_d",
  memC: "rls_tw_mem_c",
  memD: "rls_tw_mem_d",
  tierGold: "rls_tw_tier_gold",
  postPub: "rls_tw_post_pub",
  postGold: "rls_tw_post_gold",
  postDraft: "rls_tw_post_draft",
  commentC: "rls_tw_comment_c"
} as const;

async function withRlsFixture<T>(
  accountId: string | null,
  fn: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    if (accountId) {
      await setSupabaseRlsContext(tx, accountId);
    } else {
      await clearSupabaseRlsContext(tx);
    }
    await tx.$executeRawUnsafe(`SET LOCAL ROLE rls_fixture_tester`);
    return fn(tx);
  });
}

async function countPostsVisible(tx: {
  $queryRaw: typeof prisma.$queryRaw;
}): Promise<number> {
  const rows = await tx.$queryRaw<[{ c: bigint }]>`
    SELECT count(*)::bigint AS c FROM posts
  `;
  return Number(rows[0]?.c ?? 0);
}

async function countPostById(
  tx: { $queryRaw: typeof prisma.$queryRaw },
  postId: string
): Promise<number> {
  const rows = await tx.$queryRaw<[{ c: bigint }]>`
    SELECT count(*)::bigint AS c FROM posts WHERE id = ${postId}
  `;
  return Number(rows[0]?.c ?? 0);
}

describe.skipIf(!hasDatabaseUrl)("Tier 1.2 — two-sided RLS paywall", () => {
  beforeAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.tenant.createMany({
        data: [
          { id: P.t1, relayCreatorId: P.cr1 },
          { id: P.t2, relayCreatorId: P.cr2 }
        ],
        skipDuplicates: true
      });
      await tx.account.createMany({
        data: [
          {
            id: P.accA,
            emailNorm: "rls_tw_a@test.local",
            identityAuthProvider: "independent",
            primaryRelayCreatorId: P.cr1
          },
          {
            id: P.accB,
            emailNorm: "rls_tw_b@test.local",
            identityAuthProvider: "independent",
            primaryRelayCreatorId: P.cr2
          },
          {
            id: P.accC,
            emailNorm: "rls_tw_c@test.local",
            identityAuthProvider: "patreon"
          },
          {
            id: P.accD,
            emailNorm: "rls_tw_d@test.local",
            identityAuthProvider: "patreon"
          }
        ],
        skipDuplicates: true
      });
      await tx.tenantMembership.createMany({
        data: [
          {
            id: P.memC,
            accountId: P.accC,
            tenantId: P.t1,
            role: "patron",
            tierIds: [P.tierGold]
          },
          {
            id: P.memD,
            accountId: P.accD,
            tenantId: P.t2,
            role: "patron",
            tierIds: []
          }
        ],
        skipDuplicates: true
      });
      await tx.campaign.createMany({
        data: [
          {
            id: P.camp,
            creatorId: P.cr1,
            name: "rls fixture",
            upstreamUpdatedAt: new Date(),
            versionSeq: 1
          }
        ],
        skipDuplicates: true
      });
      await tx.post.createMany({
        data: [
          {
            id: P.postPub,
            campaignId: P.camp,
            creatorId: P.cr1,
            providerPostId: P.postPub,
            upstreamStatus: "active",
            createdAt: new Date(),
            isPublic: true,
            requiredTierId: null
          },
          {
            id: P.postGold,
            campaignId: P.camp,
            creatorId: P.cr1,
            providerPostId: P.postGold,
            upstreamStatus: "active",
            createdAt: new Date(),
            isPublic: false,
            requiredTierId: P.tierGold
          },
          {
            id: P.postDraft,
            campaignId: P.camp,
            creatorId: P.cr1,
            providerPostId: P.postDraft,
            upstreamStatus: "active",
            createdAt: new Date(),
            isPublic: false,
            requiredTierId: null
          }
        ],
        skipDuplicates: true
      });
    });
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.comment.deleteMany({ where: { id: P.commentC } }).catch(() => {});
      await tx.post.deleteMany({
        where: { id: { in: [P.postPub, P.postGold, P.postDraft] } }
      });
      await tx.campaign.deleteMany({ where: { id: P.camp } });
      await tx.tenantMembership.deleteMany({
        where: { id: { in: [P.memC, P.memD] } }
      });
      await tx.account.deleteMany({
        where: { id: { in: [P.accA, P.accB, P.accC, P.accD] } }
      });
      await tx.tenant.deleteMany({ where: { id: { in: [P.t1, P.t2] } } });
    });
  });

  it("anon: public post visible; gold and draft not", async () => {
    const pub = await withRlsFixture(null, (tx) => countPostById(tx, P.postPub));
    const gold = await withRlsFixture(null, (tx) => countPostById(tx, P.postGold));
    const draft = await withRlsFixture(null, (tx) => countPostById(tx, P.postDraft));
    expect(pub).toBe(1);
    expect(gold).toBe(0);
    expect(draft).toBe(0);
  });

  it("supporter_unentitled (D): T1 public visible; T1 gold not", async () => {
    const pub = await withRlsFixture(P.accD, (tx) => countPostById(tx, P.postPub));
    const gold = await withRlsFixture(P.accD, (tx) => countPostById(tx, P.postGold));
    expect(pub).toBe(1);
    expect(gold).toBe(0);
  });

  it("supporter_entitled (C): gold post visible", async () => {
    const gold = await withRlsFixture(P.accC, (tx) => countPostById(tx, P.postGold));
    expect(gold).toBe(1);
  });

  it("creator_self (A): all three posts visible", async () => {
    const n = await withRlsFixture(P.accA, (tx) => countPostsVisible(tx));
    expect(n).toBe(3);
  });

  it("creator_other (B): cannot see T1 gold/draft; may see T1 public only", async () => {
    const pub = await withRlsFixture(P.accB, (tx) => countPostById(tx, P.postPub));
    const gold = await withRlsFixture(P.accB, (tx) => countPostById(tx, P.postGold));
    const draft = await withRlsFixture(P.accB, (tx) => countPostById(tx, P.postDraft));
    expect(pub).toBe(1);
    expect(gold).toBe(0);
    expect(draft).toBe(0);
  });

  it("supporter_entitled: draft not visible", async () => {
    const draft = await withRlsFixture(P.accC, (tx) => countPostById(tx, P.postDraft));
    expect(draft).toBe(0);
  });

  it("without relay.account_id: tenant_memberships returns zero rows (fail-closed)", async () => {
    const n = await withRlsFixture(null, async (tx) => {
      const rows = await tx.$queryRaw<[{ c: bigint }]>`
        SELECT count(*)::bigint AS c FROM tenant_memberships
      `;
      return Number(rows[0]?.c ?? 0);
    });
    expect(n).toBe(0);
  });

  it("with context: membership visible to owner only", async () => {
    const n = await withRlsFixture(P.accC, async (tx) => {
      const rows = await tx.$queryRaw<[{ c: bigint }]>`
        SELECT count(*)::bigint AS c FROM tenant_memberships WHERE id = ${P.memC}
      `;
      return Number(rows[0]?.c ?? 0);
    });
    expect(n).toBe(1);
  });

  it("forgetting RLS context yields zero membership rows for entitled user", async () => {
    const n = await prisma.$transaction(async (tx) => {
      await clearSupabaseRlsContext(tx);
      await tx.$executeRawUnsafe(`SET LOCAL ROLE rls_fixture_tester`);
      const rows = await tx.$queryRaw<[{ c: bigint }]>`
        SELECT count(*)::bigint AS c FROM tenant_memberships WHERE id = ${P.memC}
      `;
      return Number(rows[0]?.c ?? 0);
    });
    expect(n).toBe(0);
  });

  it("comment insert: patron may insert with own membership on readable post", async () => {
    await prisma.comment.deleteMany({ where: { id: P.commentC } });
    await withRlsFixture(P.accC, async (tx) => {
      await tx.$executeRaw`
        INSERT INTO relay_comments (id, relay_creator_id, post_id, patron_user_id, body, created_at, mod_state)
        VALUES (${P.commentC}, ${P.cr1}, ${P.postGold}, ${P.memC}, 'ok', NOW(), 'visible')
      `;
    });
    const n = await withRlsFixture(P.accC, async (tx) => {
      const rows = await tx.$queryRaw<[{ c: bigint }]>`
        SELECT count(*)::bigint AS c FROM relay_comments WHERE id = ${P.commentC}
      `;
      return Number(rows[0]?.c ?? 0);
    });
    expect(n).toBe(1);
  });

  it("comment insert: wrong account cannot forge another membership id", async () => {
    await expect(
      withRlsFixture(P.accD, async (tx) => {
        await tx.$executeRaw`
          INSERT INTO relay_comments (id, relay_creator_id, post_id, patron_user_id, body, created_at, mod_state)
          VALUES ('rls_tw_bad_cmt', ${P.cr1}, ${P.postGold}, ${P.memC}, 'forge', NOW(), 'visible')
        `;
      })
    ).rejects.toThrow();
  });
});
