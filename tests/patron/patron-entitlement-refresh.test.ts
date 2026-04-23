import { EntitlementSource } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  getPatronOAuthTokensForAccount: vi.fn(),
  refreshPatronOAuthTokensWithStoredRefreshToken: vi.fn(),
  fetchPatronIdentity: vi.fn(),
  extractPatronSyncFromIdentity: vi.fn(),
  upsertPatronEntitlementSnapshot: vi.fn()
}));

vi.mock("../../src/auth/patron-oauth-credential-store.js", () => ({
  getPatronOAuthTokensForAccount: hoisted.getPatronOAuthTokensForAccount
}));

vi.mock("../../src/patreon/patreon-oauth-refresh.js", () => ({
  refreshPatronOAuthTokensWithStoredRefreshToken: hoisted.refreshPatronOAuthTokensWithStoredRefreshToken
}));

vi.mock("../../src/patreon/patreon-user-identity.js", () => ({
  fetchPatronIdentity: hoisted.fetchPatronIdentity,
  extractPatronSyncFromIdentity: hoisted.extractPatronSyncFromIdentity
}));

vi.mock("../../src/identity/patron-entitlement-snapshot.js", () => ({
  upsertPatronEntitlementSnapshot: hoisted.upsertPatronEntitlementSnapshot
}));

import {
  refreshPatronEntitlementSnapshotFromPatreon,
  refreshPatronEntitlementSnapshotIfStale
} from "../../src/patron/patron-entitlement-refresh.js";

describe("refreshPatronEntitlementSnapshotFromPatreon", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects oauth_exchange source", async () => {
    const prisma = { tenantMembership: { findUnique: vi.fn() } };
    const r = await refreshPatronEntitlementSnapshotFromPatreon({
      prisma: prisma as never,
      encryption: {} as never,
      patreonClient: {} as never,
      fetchImpl: fetch,
      patronMembershipId: "m",
      relayCreatorId: "c",
      snapshotCampaignId: "1",
      source: EntitlementSource.oauth_exchange
    });
    expect(r).toEqual({ ok: false, reason: "invalid_source_for_refresh" });
    expect(prisma.tenantMembership.findUnique).not.toHaveBeenCalled();
  });

  it("refreshes snapshot on happy path", async () => {
    hoisted.getPatronOAuthTokensForAccount.mockResolvedValue({
      access_token: "at",
      refresh_token: "rt"
    });
    hoisted.fetchPatronIdentity.mockResolvedValue({ data: null } as never);
    hoisted.extractPatronSyncFromIdentity.mockReturnValue({
      patreon_user_id: "pu",
      email: "e@x.com",
      tier_ids: ["patreon_tier_1"]
    });

    const prisma = {
      tenantMembership: {
        findUnique: vi.fn().mockResolvedValue({ accountId: "acc1" })
      },
      creatorProfile: {
        findFirst: vi.fn().mockResolvedValue({ patreonCampaignId: "99" })
      }
    };

    const r = await refreshPatronEntitlementSnapshotFromPatreon({
      prisma: prisma as never,
      encryption: {} as never,
      patreonClient: {} as never,
      fetchImpl: fetch,
      patronMembershipId: "mem",
      relayCreatorId: "creator_x",
      snapshotCampaignId: null,
      source: EntitlementSource.scheduled_refresh
    });

    expect(r).toEqual({ ok: true });
    expect(hoisted.upsertPatronEntitlementSnapshot).toHaveBeenCalledWith(prisma, {
      patronMembershipId: "mem",
      relayCreatorId: "creator_x",
      entitledTierIds: ["patreon_tier_1"],
      source: EntitlementSource.scheduled_refresh,
      campaignId: null
    });
    expect(hoisted.refreshPatronOAuthTokensWithStoredRefreshToken).not.toHaveBeenCalled();
  });

  it("returns identity_fetch_failed on non-auth Patreon errors (no token refresh)", async () => {
    hoisted.getPatronOAuthTokensForAccount.mockResolvedValue({
      access_token: "at",
      refresh_token: "rt"
    });
    hoisted.fetchPatronIdentity.mockRejectedValue(
      new Error("Patreon identity request failed (500): x")
    );

    const prisma = {
      tenantMembership: {
        findUnique: vi.fn().mockResolvedValue({ accountId: "acc1" })
      },
      creatorProfile: {
        findFirst: vi.fn().mockResolvedValue({ patreonCampaignId: "99" })
      }
    };

    const r = await refreshPatronEntitlementSnapshotFromPatreon({
      prisma: prisma as never,
      encryption: {} as never,
      patreonClient: {} as never,
      fetchImpl: fetch,
      patronMembershipId: "mem",
      relayCreatorId: "creator_x",
      snapshotCampaignId: "99",
      source: EntitlementSource.webhook
    });

    expect(r).toEqual({ ok: false, reason: "identity_fetch_failed" });
    expect(hoisted.refreshPatronOAuthTokensWithStoredRefreshToken).not.toHaveBeenCalled();
  });
});

describe("refreshPatronEntitlementSnapshotIfStale (PE-H pre-action)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("no-ops when snapshot is still fresh", async () => {
    const now = new Date("2026-06-01T12:00:00.000Z");
    const future = new Date(now.getTime() + 60 * 60 * 1000);
    const prisma = {
      patronEntitlementSnapshot: {
        findUnique: vi.fn().mockResolvedValue({ staleAfter: future, campaignId: "99" })
      },
      tenantMembership: { findUnique: vi.fn() },
      creatorProfile: { findFirst: vi.fn() }
    };

    const r = await refreshPatronEntitlementSnapshotIfStale({
      prisma: prisma as never,
      encryption: {} as never,
      patreonClient: {} as never,
      fetchImpl: fetch,
      patronMembershipId: "mem",
      relayCreatorId: "creator_x",
      now
    });

    expect(r).toEqual({ refreshed: false, reason: "fresh" });
    expect(prisma.tenantMembership.findUnique).not.toHaveBeenCalled();
    expect(hoisted.upsertPatronEntitlementSnapshot).not.toHaveBeenCalled();
  });

  it("refreshes with source=webhook when snapshot is stale", async () => {
    const now = new Date("2026-06-01T12:00:00.000Z");
    const past = new Date(now.getTime() - 60 * 1000);
    hoisted.getPatronOAuthTokensForAccount.mockResolvedValue({
      access_token: "at",
      refresh_token: "rt"
    });
    hoisted.fetchPatronIdentity.mockResolvedValue({ data: null } as never);
    hoisted.extractPatronSyncFromIdentity.mockReturnValue({
      patreon_user_id: "pu",
      email: "e@x.com",
      tier_ids: ["patreon_tier_2"]
    });

    const prisma = {
      patronEntitlementSnapshot: {
        findUnique: vi.fn().mockResolvedValue({ staleAfter: past, campaignId: "99" })
      },
      tenantMembership: {
        findUnique: vi.fn().mockResolvedValue({ accountId: "acc1" })
      },
      creatorProfile: {
        findFirst: vi.fn().mockResolvedValue({ patreonCampaignId: "99" })
      }
    };

    const r = await refreshPatronEntitlementSnapshotIfStale({
      prisma: prisma as never,
      encryption: {} as never,
      patreonClient: {} as never,
      fetchImpl: fetch,
      patronMembershipId: "mem",
      relayCreatorId: "creator_x",
      now
    });

    expect(r).toEqual({ refreshed: true });
    expect(hoisted.upsertPatronEntitlementSnapshot).toHaveBeenCalledWith(prisma, {
      patronMembershipId: "mem",
      relayCreatorId: "creator_x",
      entitledTierIds: ["patreon_tier_2"],
      source: EntitlementSource.webhook,
      campaignId: "99"
    });
  });

  it("returns reason from refresh failure (no credential)", async () => {
    const now = new Date("2026-06-01T12:00:00.000Z");
    const past = new Date(now.getTime() - 60 * 1000);
    hoisted.getPatronOAuthTokensForAccount.mockResolvedValue(null);

    const prisma = {
      patronEntitlementSnapshot: {
        findUnique: vi.fn().mockResolvedValue({ staleAfter: past, campaignId: null })
      },
      tenantMembership: {
        findUnique: vi.fn().mockResolvedValue({ accountId: "acc1" })
      },
      creatorProfile: {
        findFirst: vi.fn().mockResolvedValue({ patreonCampaignId: "99" })
      }
    };

    const r = await refreshPatronEntitlementSnapshotIfStale({
      prisma: prisma as never,
      encryption: {} as never,
      patreonClient: {} as never,
      fetchImpl: fetch,
      patronMembershipId: "mem",
      relayCreatorId: "creator_x",
      now
    });

    expect(r).toEqual({ refreshed: false, reason: "no_credential" });
  });
});
