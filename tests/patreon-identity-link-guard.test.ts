import { describe, expect, it, vi } from "vitest";
import {
  DbIdentityStore,
  PatreonAccountLinkConflictError
} from "../src/identity/identity-store-db.js";

describe("Patreon ↔ Account guard (DbIdentityStore.createUser)", () => {
  it("throws when Patreon id and email resolve to different accounts", async () => {
    const accPatron = {
      id: "acc_patron",
      emailNorm: "patron@example.com",
      patronPatreonUserId: "12345"
    };
    const accEmail = {
      id: "acc_email",
      emailNorm: "other@example.com",
      patronPatreonUserId: null
    };
    const prisma = {
      $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          tenant: {
            upsert: vi.fn().mockResolvedValue({ id: "ten_1", relayCreatorId: "cre_1" })
          },
          account: {
            findUnique: vi
              .fn()
              .mockImplementation(async (args: { where: { patronPatreonUserId?: string; emailNorm?: string } }) => {
                if ("patronPatreonUserId" in args.where) return accPatron;
                if ("emailNorm" in args.where) return accEmail;
                return null;
              })
          },
          tenantMembership: { upsert: vi.fn() }
        }),
      account: { findUnique: vi.fn() },
      tenant: { upsert: vi.fn() },
      tenantMembership: { upsert: vi.fn() }
    };

    const store = new DbIdentityStore(prisma as never);
    await expect(
      store.createUser({
        user_id: "usr_test",
        creator_id: "cre_1",
        email: "other@example.com",
        password_hash: "",
        auth_provider: "patreon",
        patreon_user_id: "12345",
        tier_ids: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
    ).rejects.toBeInstanceOf(PatreonAccountLinkConflictError);
  });
});
