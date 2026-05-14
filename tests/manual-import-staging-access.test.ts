import { describe, expect, it, vi } from "vitest";
import { manualRelayCampaignId, MANUAL_RELAY_TIER_PREFIX } from "../src/relay/manual-import-catalog.js";
import { resolveManualImportUploadStagingPayload } from "../src/relay/manual-import-staging-access.js";

function prismaStub(over: Record<string, unknown>) {
  return over as unknown as import("@prisma/client").PrismaClient;
}

describe("manual import upload staging resolver", () => {
  const campaignId = manualRelayCampaignId("creator_1");
  const folderId = "creator_1::relay_manual_tier_basic";

  it("rejects folders without linked provider tier row", async () => {
    const prisma = prismaStub({
      tier: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            id: folderId,
            relayTierId: `${MANUAL_RELAY_TIER_PREFIX}basic`,
            title: "Basic",
            manualUploadAccessRelayTierId: null,
            campaignId,
            creatorId: "creator_1"
          })
          .mockResolvedValue(null)
      }
    });

    const res = await resolveManualImportUploadStagingPayload(prisma, "creator_1", folderId);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/Link this folder/i);
  });

  it("resolves patreon linkage when synced tier exists", async () => {
    const prisma = prismaStub({
      tier: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            id: folderId,
            relayTierId: `${MANUAL_RELAY_TIER_PREFIX}basic`,
            title: "Basic",
            manualUploadAccessRelayTierId: "patreon_tier_777",
            campaignId,
            creatorId: "creator_1"
          })
          .mockResolvedValueOnce({
            id: "creator_1::patreon_tier_777",
            relayTierId: "patreon_tier_777"
          })
      }
    });

    const res = await resolveManualImportUploadStagingPayload(prisma, "creator_1", folderId);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.payload.provider).toBe("patreon");
    expect(res.payload.provider_tier_relay_id).toBe("patreon_tier_777");
    expect(res.payload.bin_title).toBe("Basic");
  });

  it("rejects bogus linked ids not present for creator", async () => {
    const prisma = prismaStub({
      tier: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            id: folderId,
            relayTierId: `${MANUAL_RELAY_TIER_PREFIX}basic`,
            title: "Basic",
            manualUploadAccessRelayTierId: "substar_tier_fake",
            campaignId,
            creatorId: "creator_1"
          })
          .mockResolvedValueOnce(null)
      }
    });

    const res = await resolveManualImportUploadStagingPayload(prisma, "creator_1", folderId);
    expect(res.ok).toBe(false);
  });
});
