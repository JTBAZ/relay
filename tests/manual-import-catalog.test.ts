import { describe, expect, it, vi } from "vitest";
import {
  getManualImportSetup,
  manualRelayCampaignId,
  MANUAL_RELAY_TIER_PREFIX,
  upsertManualTierBins
} from "../src/relay/manual-import-catalog.js";

function prismaStub(over: Record<string, unknown>) {
  return over as any;
}

describe("manual import catalog", () => {
  it("creates a manual campaign and manual tier bins without provider tier writes", async () => {
    const campaignId = manualRelayCampaignId("creator_1");
    const prisma = prismaStub({
      campaign: {
        upsert: vi.fn().mockResolvedValue({ id: campaignId, name: "Manual Relay Import" })
      },
      tier: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockImplementation(({ create }: { create: Record<string, unknown> }) =>
          Promise.resolve({
            id: create.id,
            relayTierId: create.relayTierId,
            title: create.title,
            amountCents: create.amountCents,
            manualUploadAccessRelayTierId: create.manualUploadAccessRelayTierId ?? null
          })
        ),
        findFirst: vi.fn().mockResolvedValue(null)
      }
    });

    const rows = await upsertManualTierBins(prisma, "creator_1", [
      { name: "Basic", amountCents: 500 },
      { name: "VIP", amountCents: 2500 }
    ]);

    expect(prisma.campaign.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: campaignId },
        create: expect.objectContaining({ creatorId: "creator_1" })
      })
    );
    expect(prisma.tier.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.tier.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          providerTierId: `${MANUAL_RELAY_TIER_PREFIX}basic`,
          manualUploadAccessRelayTierId: null,
          campaignId
        }),
        update: expect.objectContaining({ campaignId })
      })
    );
    expect(rows.map((row) => row.relay_tier_id)).toEqual([
      `${MANUAL_RELAY_TIER_PREFIX}basic`,
      `${MANUAL_RELAY_TIER_PREFIX}vip`
    ]);
    expect(rows.every((row) => row.upload_enabled === false)).toBe(true);
    expect(rows.every((row) => row.linked_provider_relay_tier_id === null)).toBe(true);
  });

  it("persists provider links when synced tier rows exist", async () => {
    const campaignId = manualRelayCampaignId("creator_1");
    const prisma = prismaStub({
      campaign: {
        upsert: vi.fn().mockResolvedValue({ id: campaignId, name: "Manual Relay Import" })
      },
      tier: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockImplementation(({ create }: { create: Record<string, unknown> }) =>
          Promise.resolve({
            id: create.id,
            relayTierId: create.relayTierId,
            title: create.title,
            amountCents: create.amountCents,
            manualUploadAccessRelayTierId: create.manualUploadAccessRelayTierId ?? null
          })
        ),
        findFirst: vi.fn().mockResolvedValue({
          id: "creator_1::patreon_tier_777",
          relayTierId: "patreon_tier_777"
        })
      }
    });

    const rows = await upsertManualTierBins(prisma, "creator_1", [
      { name: "Basic", amountCents: 500, linked_provider_relay_tier_id: "patreon_tier_777" }
    ]);
    expect(prisma.tier.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ manualUploadAccessRelayTierId: "patreon_tier_777" }),
        update: expect.objectContaining({ manualUploadAccessRelayTierId: "patreon_tier_777" })
      })
    );
    expect(rows[0]?.upload_enabled).toBe(true);
    expect(rows[0]?.linked_provider_relay_tier_id).toBe("patreon_tier_777");
  });

  it("refuses invented provider tier ids for manual bins", async () => {
    const campaignId = manualRelayCampaignId("creator_1");
    const prisma = prismaStub({
      campaign: {
        upsert: vi.fn().mockResolvedValue({ id: campaignId, name: "Manual Relay Import" })
      },
      tier: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null)
      }
    });

    await expect(
      upsertManualTierBins(prisma, "creator_1", [
        { name: "Basic", amountCents: 500, linked_provider_relay_tier_id: "patreon_tier_fake" }
      ])
    ).rejects.toMatchObject({ code: "PROVIDER_LINK_MISSING" });
    expect(prisma.tier.upsert).not.toHaveBeenCalled();
  });

  it("refuses to collide with an existing synced tier key", async () => {
    const prisma = prismaStub({
      campaign: {
        upsert: vi.fn().mockResolvedValue({
          id: manualRelayCampaignId("creator_1"),
          name: "Manual Relay Import"
        })
      },
      tier: {
        findMany: vi.fn().mockResolvedValue([
          {
            relayTierId: `${MANUAL_RELAY_TIER_PREFIX}basic`,
            providerTierId: "patreon_tier_123"
          }
        ]),
        upsert: vi.fn()
      }
    });

    await expect(
      upsertManualTierBins(prisma, "creator_1", [{ name: "Basic", amountCents: 500 }])
    ).rejects.toMatchObject({ code: "TIER_COLLISION" });
    expect(prisma.tier.upsert).not.toHaveBeenCalled();
  });

  it("separates manual bins from synced tier suggestions", async () => {
    const manualCampaign = manualRelayCampaignId("creator_1");
    const prisma = prismaStub({
      campaign: {
        findFirst: vi.fn().mockResolvedValue({ id: manualCampaign, name: "Manual Relay Import" })
      },
      tier: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: `creator_1::${MANUAL_RELAY_TIER_PREFIX}basic`,
            relayTierId: `${MANUAL_RELAY_TIER_PREFIX}basic`,
            providerTierId: `${MANUAL_RELAY_TIER_PREFIX}basic`,
            manualUploadAccessRelayTierId: null,
            title: "Basic",
            amountCents: 500,
            campaignId: manualCampaign
          },
          {
            id: "creator_1::patreon_tier_123",
            relayTierId: "patreon_tier_123",
            providerTierId: "patreon_tier_123",
            manualUploadAccessRelayTierId: null,
            title: "Gold",
            amountCents: 1000,
            campaignId: "patreon_campaign_1"
          }
        ])
      }
    });

    const setup = await getManualImportSetup(prisma, "creator_1", true);

    expect(setup.manual_bins).toHaveLength(1);
    expect(setup.manual_bins[0]?.upload_enabled).toBe(false);
    expect(setup.synced_tiers).toHaveLength(1);
    expect(setup.synced_tiers[0]?.upload_enabled).toBe(true);
    expect(setup.suggestions).toEqual(setup.synced_tiers);
    expect(setup.upload.r2_configured).toBe(true);
  });
});
