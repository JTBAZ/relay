import { describe, expect, it, vi } from "vitest";
import {
  ensureCreatorProfilePatreonCampaignId,
  getRelayCreatorIdForPatreonCampaignDb,
  resolvePatreonWebhookCampaignOwnership
} from "../src/patreon/campaign-tenant-resolve.js";

describe("getRelayCreatorIdForPatreonCampaignDb", () => {
  it("returns tenant relay_creator_id for a CreatorProfile row", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      tenant: { relayCreatorId: "relay_creator_1" }
    });
    const prisma = { creatorProfile: { findFirst } };
    const out = await getRelayCreatorIdForPatreonCampaignDb(prisma as never, " 12345 ");
    expect(out).toBe("relay_creator_1");
    expect(findFirst).toHaveBeenCalledWith({
      where: { patreonCampaignId: "12345" },
      select: { tenant: { select: { relayCreatorId: true } } }
    });
  });

  it("returns null when no profile matches", async () => {
    const prisma = { creatorProfile: { findFirst: vi.fn().mockResolvedValue(null) } };
    const out = await getRelayCreatorIdForPatreonCampaignDb(prisma as never, "99");
    expect(out).toBeNull();
  });
});

describe("resolvePatreonWebhookCampaignOwnership", () => {
  it("ok when no campaign in payload", async () => {
    const r = await resolvePatreonWebhookCampaignOwnership({
      creatorIdFromRoute: "a",
      campaignNumericId: null,
      fileIndexGetCreatorId: vi.fn(),
      prisma: undefined
    });
    expect(r).toEqual({ ok: true });
  });

  it("conflicts when file index maps campaign to another creator", async () => {
    const r = await resolvePatreonWebhookCampaignOwnership({
      creatorIdFromRoute: "owner",
      campaignNumericId: "111",
      fileIndexGetCreatorId: vi.fn().mockResolvedValue("other"),
      prisma: undefined
    });
    expect(r).toEqual({ ok: false, reason: "file_index" });
  });

  it("conflicts when CreatorProfile DB row maps campaign to another creator", async () => {
    const r = await resolvePatreonWebhookCampaignOwnership({
      creatorIdFromRoute: "owner",
      campaignNumericId: "222",
      fileIndexGetCreatorId: vi.fn().mockResolvedValue(null),
      prisma: {
        creatorProfile: {
          findFirst: vi.fn().mockResolvedValue({
            tenant: { relayCreatorId: "wrong_creator" }
          })
        }
      } as never
    });
    expect(r).toEqual({ ok: false, reason: "creator_profile" });
  });

  it("ok when DB maps campaign to same creator", async () => {
    const r = await resolvePatreonWebhookCampaignOwnership({
      creatorIdFromRoute: "same",
      campaignNumericId: "333",
      fileIndexGetCreatorId: vi.fn().mockResolvedValue(null),
      prisma: {
        creatorProfile: {
          findFirst: vi.fn().mockResolvedValue({
            tenant: { relayCreatorId: "same" }
          })
        }
      } as never
    });
    expect(r).toEqual({ ok: true });
  });
});

describe("ensureCreatorProfilePatreonCampaignId", () => {
  it("updates when profile exists and campaign id was null", async () => {
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      tenant: {
        findUnique: vi.fn().mockResolvedValue({ id: "ten1" })
      },
      creatorProfile: {
        findFirst: vi.fn().mockResolvedValue({
          id: "cp1",
          patreonCampaignId: null
        }),
        update
      }
    };
    const out = await ensureCreatorProfilePatreonCampaignId(prisma as never, {
      relayCreatorId: "cr_x",
      patreonCampaignId: "777"
    });
    expect(out).toEqual({ kind: "written", profileId: "cp1" });
    expect(update).toHaveBeenCalledWith({
      where: { id: "cp1" },
      data: { patreonCampaignId: "777" }
    });
  });

  it("does not overwrite a different existing campaign id", async () => {
    const update = vi.fn();
    const prisma = {
      tenant: {
        findUnique: vi.fn().mockResolvedValue({ id: "ten1" })
      },
      creatorProfile: {
        findFirst: vi.fn().mockResolvedValue({
          id: "cp1",
          patreonCampaignId: "111"
        }),
        update
      }
    };
    const out = await ensureCreatorProfilePatreonCampaignId(prisma as never, {
      relayCreatorId: "cr_x",
      patreonCampaignId: "222"
    });
    expect(out).toEqual({
      kind: "conflict",
      existingCampaignId: "111",
      attemptedCampaignId: "222"
    });
    expect(update).not.toHaveBeenCalled();
  });
});
