import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/db.js";
import {
  clearSupabaseRlsContext,
  setSupabaseRlsContext
} from "../../src/lib/supabase-rls-context.js";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());

/** Stable ids so reruns do not collide with pilot seed data. */
const P = {
  t1: "rls_e2_tenant_t1",
  t2: "rls_e2_tenant_t2",
  cr1: "rls_e2_cr1",
  cr2: "rls_e2_cr2",
  accPatronA: "rls_e2_acc_patron_a",
  accPatronB: "rls_e2_acc_patron_b",
  accCreatorA: "rls_e2_acc_creator_a",
  accCreatorB: "rls_e2_acc_creator_b",
  memA: "rls_e2_mem_a",
  memB: "rls_e2_mem_b",
  followA: "rls_e2_follow_a",
  snapA: "rls_e2_snap_a",
  overrideA: "rls_e2_override_a",
  postA: "rls_e2_post_a"
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

describe.skipIf(!hasDatabaseUrl)("PILOT-017 ENV-2 — patron/override RLS policies", () => {
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
            id: P.accPatronA,
            emailNorm: "rls_e2_patron_a@test.local",
            identityAuthProvider: "patreon"
          },
          {
            id: P.accPatronB,
            emailNorm: "rls_e2_patron_b@test.local",
            identityAuthProvider: "patreon"
          },
          {
            id: P.accCreatorA,
            emailNorm: "rls_e2_creator_a@test.local",
            identityAuthProvider: "independent",
            primaryRelayCreatorId: P.cr1
          },
          {
            id: P.accCreatorB,
            emailNorm: "rls_e2_creator_b@test.local",
            identityAuthProvider: "independent",
            primaryRelayCreatorId: P.cr2
          }
        ],
        skipDuplicates: true
      });
      await tx.tenantMembership.createMany({
        data: [
          {
            id: P.memA,
            accountId: P.accPatronA,
            tenantId: P.t1,
            role: "patron",
            tierIds: []
          },
          {
            id: P.memB,
            accountId: P.accPatronB,
            tenantId: P.t2,
            role: "patron",
            tierIds: []
          }
        ],
        skipDuplicates: true
      });
      await tx.patronFollow.deleteMany({
        where: { id: { in: [P.followA] } }
      });
      await tx.patronEntitlementSnapshot.deleteMany({
        where: { id: { in: [P.snapA] } }
      });
      await tx.postOverride.deleteMany({
        where: { id: { in: [P.overrideA] } }
      });
      await tx.patronFollow.create({
        data: {
          id: P.followA,
          patronMembershipId: P.memA,
          relayCreatorId: P.cr1
        }
      });
      await tx.patronEntitlementSnapshot.create({
        data: {
          id: P.snapA,
          patronMembershipId: P.memA,
          relayCreatorId: P.cr1,
          entitledTierIds: ["tier_gold"],
          active: true,
          source: "oauth_exchange",
          asOf: new Date("2026-07-01T00:00:00.000Z")
        }
      });
      await tx.postOverride.create({
        data: {
          id: P.overrideA,
          creatorId: P.cr1,
          postId: P.postA,
          mediaId: "",
          visibility: "hidden",
          discoveryEligible: false
        }
      });
    });
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.patronFollow.deleteMany({
        where: {
          OR: [
            { id: P.followA },
            { patronMembershipId: { in: [P.memA, P.memB] } }
          ]
        }
      });
      await tx.patronEntitlementSnapshot.deleteMany({
        where: {
          OR: [
            { id: P.snapA },
            { patronMembershipId: { in: [P.memA, P.memB] } }
          ]
        }
      });
      await tx.postOverride.deleteMany({
        where: {
          OR: [{ id: P.overrideA }, { creatorId: { in: [P.cr1, P.cr2] } }]
        }
      });
      await tx.tenantMembership.deleteMany({
        where: { id: { in: [P.memA, P.memB] } }
      });
      await tx.account.deleteMany({
        where: {
          id: {
            in: [P.accPatronA, P.accPatronB, P.accCreatorA, P.accCreatorB]
          }
        }
      });
      await tx.tenant.deleteMany({ where: { id: { in: [P.t1, P.t2] } } });
    });
  });

  it("patron A can SELECT own follow; missing/wrong context cannot", async () => {
    const own = await withRlsFixture(P.accPatronA, async (tx) => {
      const rows = await tx.$queryRaw<[{ c: bigint }]>`
        SELECT count(*)::bigint AS c FROM patron_follows WHERE id = ${P.followA}
      `;
      return Number(rows[0]?.c ?? 0);
    });
    const missing = await withRlsFixture(null, async (tx) => {
      const rows = await tx.$queryRaw<[{ c: bigint }]>`
        SELECT count(*)::bigint AS c FROM patron_follows WHERE id = ${P.followA}
      `;
      return Number(rows[0]?.c ?? 0);
    });
    const wrong = await withRlsFixture(P.accPatronB, async (tx) => {
      const rows = await tx.$queryRaw<[{ c: bigint }]>`
        SELECT count(*)::bigint AS c FROM patron_follows WHERE id = ${P.followA}
      `;
      return Number(rows[0]?.c ?? 0);
    });
    expect(own).toBe(1);
    expect(missing).toBe(0);
    expect(wrong).toBe(0);
  });

  it("patron A can INSERT and DELETE own follow; cannot forge another membership", async () => {
    const createdId = "rls_e2_follow_insert";
    await prisma.patronFollow.deleteMany({ where: { id: createdId } });

    await withRlsFixture(P.accPatronA, async (tx) => {
      await tx.$executeRaw`
        INSERT INTO patron_follows (id, patron_user_id, relay_creator_id, created_at)
        VALUES (${createdId}, ${P.memA}, ${P.cr2}, NOW())
      `;
    });

    const visible = await withRlsFixture(P.accPatronA, async (tx) => {
      const rows = await tx.$queryRaw<[{ c: bigint }]>`
        SELECT count(*)::bigint AS c FROM patron_follows WHERE id = ${createdId}
      `;
      return Number(rows[0]?.c ?? 0);
    });
    expect(visible).toBe(1);

    await expect(
      withRlsFixture(P.accPatronB, async (tx) => {
        await tx.$executeRaw`
          INSERT INTO patron_follows (id, patron_user_id, relay_creator_id, created_at)
          VALUES ('rls_e2_follow_forge', ${P.memA}, ${P.cr2}, NOW())
        `;
      })
    ).rejects.toThrow();

    await withRlsFixture(P.accPatronA, async (tx) => {
      await tx.$executeRaw`
        DELETE FROM patron_follows WHERE id = ${createdId}
      `;
    });

    const afterDelete = await prisma.patronFollow.count({
      where: { id: createdId }
    });
    expect(afterDelete).toBe(0);
  });

  it("patron A can SELECT own entitlement snapshot; wrong/missing cannot; INSERT denied", async () => {
    const own = await withRlsFixture(P.accPatronA, async (tx) => {
      const rows = await tx.$queryRaw<[{ c: bigint }]>`
        SELECT count(*)::bigint AS c
        FROM patron_entitlement_snapshots
        WHERE id = ${P.snapA}
      `;
      return Number(rows[0]?.c ?? 0);
    });
    const wrong = await withRlsFixture(P.accPatronB, async (tx) => {
      const rows = await tx.$queryRaw<[{ c: bigint }]>`
        SELECT count(*)::bigint AS c
        FROM patron_entitlement_snapshots
        WHERE id = ${P.snapA}
      `;
      return Number(rows[0]?.c ?? 0);
    });
    const missing = await withRlsFixture(null, async (tx) => {
      const rows = await tx.$queryRaw<[{ c: bigint }]>`
        SELECT count(*)::bigint AS c
        FROM patron_entitlement_snapshots
        WHERE id = ${P.snapA}
      `;
      return Number(rows[0]?.c ?? 0);
    });
    expect(own).toBe(1);
    expect(wrong).toBe(0);
    expect(missing).toBe(0);

    await expect(
      withRlsFixture(P.accPatronA, async (tx) => {
        await tx.$executeRaw`
          INSERT INTO patron_entitlement_snapshots (
            id, patron_user_id, relay_creator_id, entitled_tier_ids,
            active, source, as_of
          ) VALUES (
            'rls_e2_snap_write', ${P.memA}, ${P.cr2}, ARRAY[]::text[],
            true, 'oauth_exchange', NOW()
          )
        `;
      })
    ).rejects.toThrow();
  });

  it("creator A can SELECT/UPDATE own override; other creator and patron cannot", async () => {
    const own = await withRlsFixture(P.accCreatorA, async (tx) => {
      const rows = await tx.$queryRaw<[{ c: bigint }]>`
        SELECT count(*)::bigint AS c FROM post_overrides WHERE id = ${P.overrideA}
      `;
      return Number(rows[0]?.c ?? 0);
    });
    const otherCreator = await withRlsFixture(P.accCreatorB, async (tx) => {
      const rows = await tx.$queryRaw<[{ c: bigint }]>`
        SELECT count(*)::bigint AS c FROM post_overrides WHERE id = ${P.overrideA}
      `;
      return Number(rows[0]?.c ?? 0);
    });
    const patron = await withRlsFixture(P.accPatronA, async (tx) => {
      const rows = await tx.$queryRaw<[{ c: bigint }]>`
        SELECT count(*)::bigint AS c FROM post_overrides WHERE id = ${P.overrideA}
      `;
      return Number(rows[0]?.c ?? 0);
    });
    expect(own).toBe(1);
    expect(otherCreator).toBe(0);
    expect(patron).toBe(0);

    await withRlsFixture(P.accCreatorA, async (tx) => {
      await tx.$executeRaw`
        UPDATE post_overrides
        SET discovery_eligible = true
        WHERE id = ${P.overrideA}
      `;
    });
    const updated = await prisma.postOverride.findUnique({
      where: { id: P.overrideA },
      select: { discoveryEligible: true }
    });
    expect(updated?.discoveryEligible).toBe(true);

    await expect(
      withRlsFixture(P.accCreatorB, async (tx) => {
        await tx.$executeRaw`
          UPDATE post_overrides
          SET discovery_eligible = false
          WHERE id = ${P.overrideA}
        `;
      })
    ).resolves.toBeUndefined();
    const unchanged = await prisma.postOverride.findUnique({
      where: { id: P.overrideA },
      select: { discoveryEligible: true }
    });
    expect(unchanged?.discoveryEligible).toBe(true);
  });

  it("creator cannot reassign override creator_id via UPDATE WITH CHECK", async () => {
    await expect(
      withRlsFixture(P.accCreatorA, async (tx) => {
        await tx.$executeRaw`
          UPDATE post_overrides
          SET creator_id = ${P.cr2}
          WHERE id = ${P.overrideA}
        `;
      })
    ).rejects.toThrow();
  });

  it("creator A can INSERT and DELETE own override row", async () => {
    const id = "rls_e2_override_crud";
    await prisma.postOverride.deleteMany({ where: { id } });

    await withRlsFixture(P.accCreatorA, async (tx) => {
      await tx.$executeRaw`
        INSERT INTO post_overrides (
          id, creator_id, post_id, media_id, add_tag_ids, remove_tag_ids,
          discovery_eligible, updated_at
        ) VALUES (
          ${id}, ${P.cr1}, 'rls_e2_post_b', '', ARRAY[]::text[], ARRAY[]::text[],
          false, NOW()
        )
      `;
    });

    await expect(
      withRlsFixture(P.accCreatorB, async (tx) => {
        await tx.$executeRaw`
          INSERT INTO post_overrides (
            id, creator_id, post_id, media_id, add_tag_ids, remove_tag_ids,
            discovery_eligible, updated_at
          ) VALUES (
            'rls_e2_override_forge', ${P.cr1}, 'rls_e2_post_c', '', ARRAY[]::text[], ARRAY[]::text[],
            false, NOW()
          )
        `;
      })
    ).rejects.toThrow();

    await withRlsFixture(P.accCreatorA, async (tx) => {
      await tx.$executeRaw`DELETE FROM post_overrides WHERE id = ${id}`;
    });
    expect(await prisma.postOverride.count({ where: { id } })).toBe(0);
  });
});
