import { beforeEach, describe, expect, it, vi } from "vitest";
import * as subscribeStarIdentity from "../../src/subscribestar/subscribestar-identity.js";
import { SubscribeStarCreatorAuthService } from "../../src/auth/subscribestar-auth-service.js";

describe("SubscribeStarCreatorAuthService.exchangeCodeAndPersist → CreatorProfile mirror", () => {
  beforeEach(() => {
    vi.spyOn(subscribeStarIdentity, "fetchSubscribeStarCreatorProviderUserId").mockResolvedValue(
      "substar_prof_from_graphql"
    );
  });

  it("calls creatorProfile.updateMany with subscribestarProfileId scoped to oauth creator relay id", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));

    const client = {
      exchangeCode: vi.fn(async (_code: string, _uri: string) => ({
        access_token: "at",
        refresh_token: "rt",
        expires_in: 3600
      }))
    };

    const tokenStore = {
      getByCreatorId: vi.fn(async () => null),
      upsert: vi.fn(async () => undefined)
    };

    const eventBus = { publish: vi.fn() };

    const prisma = {
      creatorProfile: { updateMany }
    };

    const svc = new SubscribeStarCreatorAuthService(
      client as never,
      tokenStore as never,
      eventBus as never,
      fetch,
      "https://subscribestar.invalid/api/graphql/v1",
      prisma as never
    );

    const result = await svc.exchangeCodeAndPersist(
      "cr_oauth_workspace",
      "auth_code",
      "https://app/callback",
      "trace-unit"
    );

    expect(result.subscribestar_profile_id).toBe("substar_prof_from_graphql");
    expect(updateMany).toHaveBeenCalledWith({
      where: { tenant: { relayCreatorId: "cr_oauth_workspace" } },
      data: { subscribestarProfileId: "substar_prof_from_graphql" }
    });
    expect(tokenStore.upsert).toHaveBeenCalledTimes(1);
  });
});
