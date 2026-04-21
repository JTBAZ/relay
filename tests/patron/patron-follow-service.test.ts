import { describe, expect, it, vi } from "vitest";
import {
  addPatronFollowForMembership,
  listPatronFollowsForMembership,
  relayCreatorIdsForFollowSeed,
  removePatronFollowForMembership,
  upsertPatronFollowsForMembership
} from "../../src/patron/patron-follow-service.js";

describe("relayCreatorIdsForFollowSeed", () => {
  it("dedupes and drops owned studio relay id", () => {
    expect(
      relayCreatorIdsForFollowSeed({
        linkedRelayCreatorIds: ["a", "b", "a", " "],
        ownedRelayCreatorId: "b"
      })
    ).toEqual(["a"]);
  });

  it("returns empty when only owned studio is linked", () => {
    expect(
      relayCreatorIdsForFollowSeed({
        linkedRelayCreatorIds: ["studio_x"],
        ownedRelayCreatorId: "studio_x"
      })
    ).toEqual([]);
  });
});

describe("upsertPatronFollowsForMembership", () => {
  it("dedupes and skips empty ids", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = { patronFollow: { createMany } };
    await upsertPatronFollowsForMembership(prisma as never, "mem1", ["x", "x", "", "y"]);
    expect(createMany).toHaveBeenCalledWith({
      data: [
        { patronMembershipId: "mem1", relayCreatorId: "x" },
        { patronMembershipId: "mem1", relayCreatorId: "y" }
      ],
      skipDuplicates: true
    });
  });
});

describe("addPatronFollowForMembership", () => {
  it("returns null when tenant missing", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = { tenant: { findUnique }, patronFollow: { findUnique: vi.fn(), create: vi.fn() } };
    const r = await addPatronFollowForMembership(prisma as never, "m1", "no_such");
    expect(r).toBeNull();
  });

  it("creates when new", async () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const findUniqueTenant = vi.fn().mockResolvedValue({ id: "t1" });
    const findUniqueFollow = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockResolvedValue({
      relayCreatorId: "c1",
      createdAt
    });
    const prisma = {
      tenant: { findUnique: findUniqueTenant },
      patronFollow: { findUnique: findUniqueFollow, create }
    };
    const r = await addPatronFollowForMembership(prisma as never, "m1", "c1");
    expect(r).toEqual({
      relay_creator_id: "c1",
      created: true,
      created_at: createdAt.toISOString()
    });
  });

  it("returns created false when row exists", async () => {
    const createdAt = new Date("2025-06-01T00:00:00.000Z");
    const findUniqueTenant = vi.fn().mockResolvedValue({ id: "t1" });
    const findUniqueFollow = vi.fn().mockResolvedValue({
      relayCreatorId: "c1",
      createdAt
    });
    const prisma = {
      tenant: { findUnique: findUniqueTenant },
      patronFollow: { findUnique: findUniqueFollow, create: vi.fn() }
    };
    const r = await addPatronFollowForMembership(prisma as never, "m1", "c1");
    expect(r).toEqual({
      relay_creator_id: "c1",
      created: false,
      created_at: createdAt.toISOString()
    });
  });
});

describe("listPatronFollowsForMembership", () => {
  it("maps rows to API shape", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { relayCreatorId: "a", createdAt: new Date("2026-01-02T00:00:00.000Z") }
    ]);
    const prisma = { patronFollow: { findMany } };
    const rows = await listPatronFollowsForMembership(prisma as never, "m1");
    expect(rows).toEqual([
      { relay_creator_id: "a", created_at: "2026-01-02T00:00:00.000Z" }
    ]);
  });
});

describe("removePatronFollowForMembership", () => {
  it("returns false when nothing deleted", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = { patronFollow: { deleteMany } };
    const ok = await removePatronFollowForMembership(prisma as never, "m1", "x");
    expect(ok).toBe(false);
  });

  it("returns true when row removed", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = { patronFollow: { deleteMany } };
    const ok = await removePatronFollowForMembership(prisma as never, "m1", "x");
    expect(ok).toBe(true);
  });
});
