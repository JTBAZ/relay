import { afterEach, describe, expect, it, vi } from "vitest";
import { EntitlementSource } from "@prisma/client";
import {
  DEFAULT_PATRON_ENTITLEMENT_STALE_MS,
  getPatronEntitlementStaleAfterMs,
  invalidatePatronEntitlementSnapshotsForMemberships,
  upsertPatronEntitlementSnapshot,
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

describe("upsertPatronEntitlementSnapshot", () => {
  it("writes the provided EntitlementSource (e.g. webhook)", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const findUnique = vi.fn().mockResolvedValue(null);
    const outboxCreate = vi.fn().mockResolvedValue({});
    const prisma = {
      patronEntitlementSnapshot: { upsert, findUnique },
      creatorProfile: { findFirst: vi.fn().mockResolvedValue(null) },
      outboxEvent: { create: outboxCreate }
    };
    const now = new Date("2026-06-01T12:00:00.000Z");
    await upsertPatronEntitlementSnapshot(prisma as never, {
      patronMembershipId: "mem_1",
      relayCreatorId: "creator_a",
      entitledTierIds: ["t1"],
      source: EntitlementSource.webhook,
      now
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ source: EntitlementSource.webhook }),
        update: expect.objectContaining({ source: EntitlementSource.webhook })
      })
    );
  });

  it("emits patron_entitlement.tier_changed OutboxEvent when tier set changes", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const findUnique = vi
      .fn()
      .mockResolvedValue({ entitledTierIds: ["t1"], active: true });
    const outboxCreate = vi.fn().mockResolvedValue({});
    const prisma = {
      patronEntitlementSnapshot: { upsert, findUnique },
      creatorProfile: { findFirst: vi.fn().mockResolvedValue(null) },
      outboxEvent: { create: outboxCreate }
    };
    const now = new Date("2026-06-01T12:00:00.000Z");

    await upsertPatronEntitlementSnapshot(prisma as never, {
      patronMembershipId: "mem_1",
      relayCreatorId: "creator_a",
      entitledTierIds: ["t1", "t2"],
      source: EntitlementSource.scheduled_refresh,
      now
    });

    expect(outboxCreate).toHaveBeenCalledTimes(1);
    const call = outboxCreate.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(call.data.eventName).toBe("patron_entitlement.tier_changed");
    expect(call.data.tenantId).toBe("creator_a");
    expect(call.data.primaryId).toBe("mem_1");
    expect(call.data.occurredAt).toEqual(now);
    const payload = call.data.payload as Record<string, unknown>;
    expect(payload.prior_tier_ids).toEqual(["t1"]);
    expect(payload.next_tier_ids).toEqual(["t1", "t2"]);
    expect(payload.prior_active).toBe(true);
    expect(payload.next_active).toBe(true);
  });

  it("emits tier_changed when active flips even with same (empty) tier set", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const findUnique = vi
      .fn()
      .mockResolvedValue({ entitledTierIds: ["t1"], active: true });
    const outboxCreate = vi.fn().mockResolvedValue({});
    const prisma = {
      patronEntitlementSnapshot: { upsert, findUnique },
      creatorProfile: { findFirst: vi.fn().mockResolvedValue(null) },
      outboxEvent: { create: outboxCreate }
    };

    await upsertPatronEntitlementSnapshot(prisma as never, {
      patronMembershipId: "mem_1",
      relayCreatorId: "creator_a",
      entitledTierIds: [],
      source: EntitlementSource.scheduled_refresh
    });

    expect(outboxCreate).toHaveBeenCalledTimes(1);
    const payload = (outboxCreate.mock.calls[0]![0] as { data: { payload: Record<string, unknown> } })
      .data.payload;
    expect(payload.prior_active).toBe(true);
    expect(payload.next_active).toBe(false);
  });

  it("does NOT emit when tier set and active flag are unchanged", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const findUnique = vi
      .fn()
      .mockResolvedValue({ entitledTierIds: ["t1", "t2"], active: true });
    const outboxCreate = vi.fn().mockResolvedValue({});
    const prisma = {
      patronEntitlementSnapshot: { upsert, findUnique },
      creatorProfile: { findFirst: vi.fn().mockResolvedValue(null) },
      outboxEvent: { create: outboxCreate }
    };

    await upsertPatronEntitlementSnapshot(prisma as never, {
      patronMembershipId: "mem_1",
      relayCreatorId: "creator_a",
      entitledTierIds: ["t2", "t1"],
      source: EntitlementSource.scheduled_refresh
    });

    expect(outboxCreate).not.toHaveBeenCalled();
  });

  it("does NOT emit on first-write (create) since there's no transition", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const findUnique = vi.fn().mockResolvedValue(null);
    const outboxCreate = vi.fn().mockResolvedValue({});
    const prisma = {
      patronEntitlementSnapshot: { upsert, findUnique },
      creatorProfile: { findFirst: vi.fn().mockResolvedValue(null) },
      outboxEvent: { create: outboxCreate }
    };

    await upsertPatronEntitlementSnapshot(prisma as never, {
      patronMembershipId: "mem_new",
      relayCreatorId: "creator_a",
      entitledTierIds: ["t1"],
      source: EntitlementSource.oauth_exchange
    });

    expect(outboxCreate).not.toHaveBeenCalled();
  });
});

describe("upsertPatronEntitlementSnapshotForOAuth", () => {
  it("upserts with oauth_exchange, asOf, staleAfter, and optional campaign from CreatorProfile", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const findUnique = vi.fn().mockResolvedValue(null);
    const findFirst = vi.fn().mockResolvedValue({ patreonCampaignId: "999" });
    const outboxCreate = vi.fn().mockResolvedValue({});
    const prisma = {
      patronEntitlementSnapshot: { upsert, findUnique },
      creatorProfile: { findFirst },
      outboxEvent: { create: outboxCreate }
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
    const findUnique = vi.fn().mockResolvedValue(null);
    const outboxCreate = vi.fn().mockResolvedValue({});
    const prisma = {
      patronEntitlementSnapshot: { upsert, findUnique },
      creatorProfile: { findFirst: vi.fn().mockResolvedValue(null) },
      outboxEvent: { create: outboxCreate }
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
