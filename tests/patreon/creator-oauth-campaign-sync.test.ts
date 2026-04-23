import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/patreon/patreon-resource-api.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../src/patreon/patreon-resource-api.js")>();
  return {
    ...mod,
    fetchCampaignsWithTiers: vi.fn().mockResolvedValue({
      data: [{ type: "campaign", id: "555" }]
    })
  };
});

describe("syncCreatorProfilePatreonCampaignFromOAuthToken", () => {
  it("throws when campaign is already bound to a different relay creator in DB", async () => {
    const { syncCreatorProfilePatreonCampaignFromOAuthToken } = await import(
      "../../src/patreon/creator-oauth-campaign-sync.js"
    );

    const prisma = {
      creatorProfile: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            tenant: { relayCreatorId: "someone_else" }
          })
      },
      tenant: { findUnique: vi.fn() }
    };

    await expect(
      syncCreatorProfilePatreonCampaignFromOAuthToken({
        prisma: prisma as never,
        relayCreatorId: "me",
        accessToken: "tok",
        fetchImpl: fetch
      })
    ).rejects.toThrow(/already registered to a different Relay studio/);
  });
});
