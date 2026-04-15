import { describe, expect, it, vi } from "vitest";
import { IdentityService } from "../src/identity/identity-service.js";
import { FileIdentityStore } from "../src/identity/identity-store.js";
import { DbIdentityStore } from "../src/identity/identity-store-db.js";
import { getPlatformRelayCreatorId } from "../src/identity/platform-tenant.js";

describe("MT-007 / MT-008 account-scoped email auth", () => {
  it("FileIdentityStore does not implement registerAccountEmailPassword", () => {
    const svc = new IdentityService(
      new FileIdentityStore(".relay-data/test-auth-account-identity.json")
    );
    expect(svc.supportsAccountScopedEmailAuth()).toBe(false);
  });

  it("DbIdentityStore exposes account-scoped methods", () => {
    const prisma = {} as never;
    const store = new DbIdentityStore(prisma);
    expect(typeof store.registerAccountEmailPassword).toBe("function");
    expect(typeof store.loginAccountEmailPassword).toBe("function");
  });

  it("registerAccountEmailPassword creates Account + platform Tenant + membership", async () => {
    const tenantUpsert = vi.fn().mockResolvedValue({ id: "ten_platform", relayCreatorId: "__relay_platform" });
    const accountCreate = vi.fn().mockResolvedValue({ id: "acc_1" });
    const membershipCreate = vi.fn().mockImplementation(async (args: { data: { accountId: string }; include: object }) => ({
      id: "mem_1",
      role: "patron",
      tierIds: [],
      accountId: args.data.accountId,
      tenantId: "ten_platform",
      createdAt: new Date(),
      updatedAt: new Date(),
      account: {
        id: args.data.accountId,
        emailNorm: "a@b.com",
        passwordHash: "x",
        identityAuthProvider: "independent",
        patronPatreonUserId: null
      },
      tenant: { id: "ten_platform", relayCreatorId: getPlatformRelayCreatorId() }
    }));

    const prisma = {
      $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          account: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: () => accountCreate()
          },
          tenant: { upsert: tenantUpsert },
          tenantMembership: { create: membershipCreate }
        }),
      account: { findUnique: vi.fn() },
      tenant: { upsert: tenantUpsert },
      tenantMembership: { create: membershipCreate }
    };

    const store = new DbIdentityStore(prisma as never);
    const user = await store.registerAccountEmailPassword("a@b.com", "secret123");
    expect(user.creator_id).toBe(getPlatformRelayCreatorId());
    expect(user.email).toBe("a@b.com");
    expect(user.user_id).toBe("mem_1");
    expect(tenantUpsert).toHaveBeenCalled();
  });

  it("IdentityService.issueSessionForUser returns a session for a UserAccount", async () => {
    const createSession = vi.fn().mockResolvedValue(undefined);
    const store = {
      createSession,
      registerAccountEmailPassword: vi.fn().mockResolvedValue({
        user_id: "mem_x",
        creator_id: "__relay_platform",
        email: "x@y.com",
        password_hash: "h",
        auth_provider: "independent" as const,
        tier_ids: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }),
      loginAccountEmailPassword: vi.fn()
    };
    const svc = new IdentityService(store as never);
    const user = await svc.registerAccount("x@y.com", "pw");
    const session = await svc.issueSessionForUser(user);
    expect(session.user_id).toBe(user.user_id);
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({ token: expect.stringMatching(/^sess_/) })
    );
  });
});
