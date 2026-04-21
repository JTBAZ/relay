import { afterEach, describe, expect, it, vi } from "vitest";
import { EntitlementSource } from "@prisma/client";
import {
  DEFAULT_PATRON_ENTITLEMENT_STALE_MS,
  getPatronEntitlementStaleAfterMs,
  invalidatePatronEntitlementSnapshotsForMemberships,
  upsertPatronEntitlementSnapshotForOAuth
} from "../src/identity/patron-entitlement-snapshot.js";

describe("getPatronEntitlementStaleAfterMs", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to 6 hours", () => {
    expect(getPatronEntitlementStaleAfterMs()).toBe(DEFAULT_PATRON_ENTITLEMENT_STALE_MS);
  });

  it("reads RELAY_PATRON_ENTITLEMENT_STALE_AFTER_MS when valid", () => {
    vi.stubEnv("RELAY_PATRON_ENTITLEMENT_STALE_AFTER_MS", "3600000");
    expect(getPatronEntitlementStaleAfterMs()).toBe(3_600_000);
  });
});

describe("upsertPatronEntitlementSnapshotForOAuth", () => {
  it("upserts with oauth_exchange, asOf, staleAfter, and optional campaign from CreatorProfile", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const findFirst = vi.fn().mockResolvedValue({ patreonCampaignId: "999" });
    const prisma = {
      patronEntitlementSnapshot: { upsert },
      creatorProfile: { findFirst }
    };
    const now = new Date("2026-06-01T12:00:00.000Z");

    await upsertPatronEntitlementSnapshotForOAuth(prisma as never, {
      patronMembershipId: "mem_1",
      relayCreatorId: "creator_a",
      entitledTierIds: ["t1", "t2"],
      now
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: { tenant: { relayCreatorId: "creator_a" } },
      select: { patreonCampaignId: true }
    });
    expect(upsert).toHaveBeenCalledWith({
      where: {
        patronMembershipId_relayCreatorId: {
          patronMembershipId: "mem_1",
          relayCreatorId: "creator_a"
        }
      },
      create: expect.objectContaining({
        campaignId: "999",
        entitledTierIds: ["t1", "t2"],
        active: true,
        source: EntitlementSource.oauth_exchange,
        asOf: now,
        staleAfter: new Date(now.getTime() + DEFAULT_PATRON_ENTITLEMENT_STALE_MS)
      }),
      update: expect.objectContaining({
        campaignId: "999",
        entitledTierIds: ["t1", "t2"],
        active: true,
        source: EntitlementSource.oauth_exchange,
        asOf: now,
        staleAfter: new Date(now.getTime() + DEFAULT_PATRON_ENTITLEMENT_STALE_MS)
      })
    });
  });

  it("sets active false when no entitled tiers", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const prisma = {
      patronEntitlementSnapshot: { upsert },
      creatorProfile: { findFirst: vi.fn().mockResolvedValue(null) }
    };
    await upsertPatronEntitlementSnapshotForOAuth(prisma as never, {
      patronMembershipId: "mem_1",
      relayCreatorId: "creator_a",
      entitledTierIds: []
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ active: false, entitledTierIds: [] }),
        update: expect.objectContaining({ active: false })
      })
    );
  });
});

describe("invalidatePatronEntitlementSnapshotsForMemberships", () => {
  it("updateMany with empty tier ids, inactive, stale, manual_support", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const prisma = { patronEntitlementSnapshot: { updateMany } };
    const now = new Date("2026-06-01T12:00:00.000Z");

    const n = await invalidatePatronEntitlementSnapshotsForMemberships(prisma as never, ["a", "b"], now);

    expect(n).toBe(2);
    expect(updateMany).toHaveBeenCalledWith({
      where: { patronMembershipId: { in: ["a", "b"] } },
      data: expect.objectContaining({
        entitledTierIds: [],
        active: false,
        staleAfter: now,
        asOf: now,
        source: EntitlementSource.manual_support
      })
    });
  });

  it("returns 0 when no membership ids", async () => {
    const updateMany = vi.fn();
    const prisma = { patronEntitlementSnapshot: { updateMany } };
    const n = await invalidatePatronEntitlementSnapshotsForMemberships(prisma as never, []);
    expect(n).toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
