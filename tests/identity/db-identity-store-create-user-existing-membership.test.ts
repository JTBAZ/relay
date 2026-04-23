import { describe, expect, it, vi } from "vitest";
import { DbIdentityStore } from "../../src/identity/identity-store-db.js";
import { getPlatformRelayCreatorId } from "../../src/identity/platform-tenant.js";

/**
 * Regression — when an Account + TenantMembership already exists for the (account, tenant)
 * pair (e.g. materialized by creator-side member sync, or a prior platform-tenant fallback),
 * `DbIdentityStore.createUser` must:
 *   1. Resolve the upsert against the existing membership id (not the locally generated `usr_*`).
 *   2. Pass that resolved id to `upsertPatronEntitlementSnapshotForOAuth` — otherwise the
 *      snapshot's `patron_user_id` FK violates `patron_entitlement_snapshots_patron_user_id_fkey`
 *      and the whole transaction rolls back.
 *   3. Mutate the in-memory `user.user_id` to the resolved id so the caller's
 *      downstream session / `PatronFollow` seed reference a real `TenantMembership.id`.
 */
describe("DbIdentityStore.createUser — existing TenantMembership for (account, tenant)", () => {
  function buildPrismaStub() {
    const tenant = { id: "ten_relaytest", relayCreatorId: "relaytest_creator_id" };
    const account = {
      id: "acc_existing",
      emailNorm: "davoicework@gmail.com",
      patronPatreonUserId: "12345"
    };
    const existingMembership = {
      id: "mem_existing_cuid",
      accountId: account.id,
      tenantId: tenant.id,
      role: "patron"
    };
    const tenantMembershipUpsert = vi.fn().mockResolvedValue(existingMembership);
    /** PE-H: `upsertPatronEntitlementSnapshot` reads prior row before upsert (tier-change events). */
    const snapshotFindUnique = vi.fn().mockResolvedValue(null);
    const snapshotUpsert = vi.fn().mockResolvedValue({});
    const creatorProfileFindFirst = vi.fn().mockResolvedValue(null);

    const tx = {
      tenant: { upsert: vi.fn().mockResolvedValue(tenant) },
      account: {
        findUnique: vi
          .fn()
          .mockImplementation(
            async (args: { where: { patronPatreonUserId?: string; emailNorm?: string } }) => {
              if (args.where.patronPatreonUserId) return account;
              if (args.where.emailNorm) return account;
              return null;
            }
          ),
        update: vi
          .fn()
          .mockImplementation(async (args: { where: { id: string }; data: Record<string, unknown> }) => ({
            ...account,
            ...args.data
          })),
        create: vi.fn()
      },
      tenantMembership: {
        findUnique: vi
          .fn()
          .mockImplementation(
            async (args: {
              where: { accountId_tenantId?: { accountId: string; tenantId: string } };
            }) => {
              if (args.where.accountId_tenantId) return existingMembership;
              return null;
            }
          ),
        upsert: tenantMembershipUpsert
      },
      patronEntitlementSnapshot: { findUnique: snapshotFindUnique, upsert: snapshotUpsert },
      creatorProfile: { findFirst: creatorProfileFindFirst }
    };

    return {
      tx,
      tenantMembershipUpsert,
      snapshotUpsert,
      existingMembership,
      account,
      tenant,
      prisma: {
        $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(tx)
      }
    };
  }

  it("upserts membership at the existing id and writes snapshot keyed by that id", async () => {
    const { prisma, tx, tenantMembershipUpsert, snapshotUpsert, existingMembership } =
      buildPrismaStub();
    const store = new DbIdentityStore(prisma as never);

    const user = {
      user_id: "usr_brand_new_uuid",
      creator_id: "relaytest_creator_id",
      email: "davoicework@gmail.com",
      password_hash: "",
      auth_provider: "patreon" as const,
      patreon_user_id: "12345",
      tier_ids: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await store.createUser(user);

    // Membership upsert must target the existing id (not the freshly generated usr_*).
    expect(tenantMembershipUpsert).toHaveBeenCalledTimes(1);
    expect(tenantMembershipUpsert.mock.calls[0]?.[0]).toMatchObject({
      where: { id: existingMembership.id }
    });

    // Snapshot upsert MUST receive the resolved membership id, not the local usr_* id —
    // otherwise the FK on patron_entitlement_snapshots.patron_user_id fails (the original
    // davoicework reconnect bug).
    expect(snapshotUpsert).toHaveBeenCalledTimes(1);
    const snapshotCall = snapshotUpsert.mock.calls[0]?.[0] as {
      where: { patronMembershipId_relayCreatorId: { patronMembershipId: string } };
      create: { patronMembershipId: string };
    };
    expect(snapshotCall.where.patronMembershipId_relayCreatorId.patronMembershipId).toBe(
      existingMembership.id
    );
    expect(snapshotCall.create.patronMembershipId).toBe(existingMembership.id);

    // The in-memory UserAccount must reflect the actual TenantMembership.id so the caller
    // (registerPatreonFallback → completeUnifiedPatreonPatronOAuth) issues a session whose
    // user_id resolves in `loadPatronAuthContext` and the PE-C PatronFollow seed.
    expect(user.user_id).toBe(existingMembership.id);

    // Sanity: the existing-membership lookup happened at the natural compound key.
    expect(tx.tenantMembership.findUnique).toHaveBeenCalledWith({
      where: {
        accountId_tenantId: { accountId: "acc_existing", tenantId: "ten_relaytest" }
      }
    });
  });

  it("skips snapshot upsert when creator_id is the platform tenant", async () => {
    const { prisma, snapshotUpsert, existingMembership } = buildPrismaStub();
    const store = new DbIdentityStore(prisma as never);

    const platform = getPlatformRelayCreatorId();

    const user = {
      user_id: "usr_brand_new_uuid",
      creator_id: platform,
      email: "davoicework@gmail.com",
      password_hash: "",
      auth_provider: "patreon" as const,
      patreon_user_id: "12345",
      tier_ids: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await store.createUser(user);

    expect(snapshotUpsert).not.toHaveBeenCalled();
    // Even on the platform skip, the user_id sync must happen so the platform-fallback
    // session/login still resolves to a real membership.
    expect(user.user_id).toBe(existingMembership.id);
  });
});
