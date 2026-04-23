import { describe, expect, it, vi } from "vitest";
import { PatreonAuthService } from "../../src/auth/auth-service.js";
import * as identity from "../../src/patreon/patreon-user-identity.js";
import type { PatreonTokenStore } from "../../src/auth/token-store.js";

describe("PatreonAuthService.exchangeCodeAndPersist", () => {
  it("rejects when stored Patreon user id does not match identity from new token", async () => {
    vi.spyOn(identity, "fetchPatreonOAuthIdentityUserId").mockResolvedValue("patreon_user_new");

    const patreonClient = {
      exchangeCode: vi.fn().mockResolvedValue({
        access_token: "a",
        refresh_token: "r",
        expires_in: 3600
      })
    };

    const tokenStore: PatreonTokenStore = {
      upsert: vi.fn().mockResolvedValue(undefined),
      getByCreatorId: vi.fn().mockResolvedValue({
        creator_id: "c1",
        access_token: "old",
        refresh_token: "old",
        access_token_expires_at: new Date().toISOString(),
        credential_health_status: "healthy",
        provider_user_id: "patreon_user_old"
      }),
      listCreatorIds: vi.fn().mockResolvedValue([])
    };

    const eventBus = { publish: vi.fn() };

    const svc = new PatreonAuthService(
      patreonClient as never,
      tokenStore,
      eventBus as never,
      fetch
    );

    await expect(
      svc.exchangeCodeAndPersist("c1", "code", "https://x/cb", "t1")
    ).rejects.toThrow(/correct Patreon account/);

    expect(tokenStore.upsert).not.toHaveBeenCalled();
  });

  it("persists tokens with provider_user_id when identity matches or first connect", async () => {
    vi.spyOn(identity, "fetchPatreonOAuthIdentityUserId").mockResolvedValue("patreon_u1");

    const patreonClient = {
      exchangeCode: vi.fn().mockResolvedValue({
        access_token: "a",
        refresh_token: "r",
        expires_in: 3600
      })
    };

    const tokenStore: PatreonTokenStore = {
      upsert: vi.fn().mockResolvedValue(undefined),
      getByCreatorId: vi.fn().mockResolvedValue(null),
      listCreatorIds: vi.fn().mockResolvedValue([])
    };

    const eventBus = { publish: vi.fn() };

    const svc = new PatreonAuthService(
      patreonClient as never,
      tokenStore,
      eventBus as never,
      fetch
    );

    await svc.exchangeCodeAndPersist("c1", "code", "https://x/cb", "t1");

    expect(tokenStore.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        creator_id: "c1",
        provider_user_id: "patreon_u1",
        credential_health_status: "healthy"
      })
    );
  });
});
