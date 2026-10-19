import { describe, expect, it, vi } from "vitest";
import { PatronFavoriteTargetKind as PrismaFavoriteKind } from "@prisma/client";
import { DbPatronFavoritesStore } from "../src/gallery/patron-favorites-store-db.js";
import { DbPatronCollectionsStore } from "../src/gallery/patron-collections-store-db.js";

describe("DbPatronFavoritesStore", () => {
  it("add uses findUnique + create; remove uses deleteMany", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockResolvedValue({
      patronMembershipId: "u1",
      creatorId: "c1",
      targetKind: PrismaFavoriteKind.media,
      targetId: "m1",
      createdAt: new Date("2026-01-01T00:00:00.000Z")
    });
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      patronFavorite: { findUnique, create, deleteMany },
      // store.add looks up the membership accountId to emit a forensic event after saving.
      tenantMembership: { findUnique: vi.fn().mockResolvedValue(null) },
      outboxEvent: { create: vi.fn() }
    };
    const store = new DbPatronFavoritesStore(prisma as never);

    const rec = await store.add({
      user_id: "u1",
      creator_id: "c1",
      target_kind: "media",
      target_id: "m1"
    });
    expect(rec.created_at).toMatch(/^2026-01-01/);
    expect(findUnique).toHaveBeenCalled();
    expect(create).toHaveBeenCalled();

    expect(await store.remove("c1", "u1", "media", "m1")).toBe(true);
    expect(deleteMany).toHaveBeenCalled();
  });
});

describe("DbPatronCollectionsStore", () => {
  it("addEntry returns null when the scoped collection is missing", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const prisma = {
      patronSavedCollection: { findFirst },
      patronSavedCollectionEntry: {}
    };
    const store = new DbPatronCollectionsStore(prisma as never);
    await expect(
      store.addEntry("c1", "u1", "pcol_x", "p1", "m1")
    ).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledWith({ where: { id: "pcol_x", creatorId: "c1", patronMembershipId: "u1" } });
  });

  it("preserves a committed entry when a follow-up update fails and reads it only for its owner", async () => {
    const now = new Date("2026-10-19T12:00:00Z");
    const col = { id: "col1", patronMembershipId: "u1", creatorId: "c1", title: "Mine", sortOrder: 0, createdAt: now, updatedAt: now };
    const entry = { id: "entry1", collectionId: "col1", patronMembershipId: "u1", creatorId: "c1", postId: "p1", mediaId: "m1", createdAt: now };
    const create = vi.fn().mockResolvedValue(entry);
    const prisma = {
      patronSavedCollection: {
        findFirst: vi.fn().mockResolvedValue(col),
        update: vi.fn().mockRejectedValue(new Error("Update unavailable"))
      },
      patronSavedCollectionEntry: {
        findUnique: vi.fn().mockResolvedValue(null), create,
        findMany: vi.fn().mockResolvedValue([entry])
      },
      tenantMembership: { findMany: vi.fn().mockResolvedValue([{ id: "u1" }]) }
    };
    const store = new DbPatronCollectionsStore(prisma as never);
    await expect(store.addEntry("c1", "u1", "col1", "p1", "m1")).rejects.toThrow("Update unavailable");
    const detail = await store.getCollectionWithEntriesForAccount("account1", "col1");
    expect(detail?.entries).toHaveLength(1);
    expect(detail?.entries[0].media_id).toBe("m1");
    expect(prisma.tenantMembership.findMany).toHaveBeenCalledWith({ where: { accountId: "account1" }, select: { id: true } });
    expect(prisma.patronSavedCollection.findFirst).toHaveBeenLastCalledWith({ where: { id: "col1", patronMembershipId: { in: ["u1"] } } });
    expect(create).toHaveBeenCalledTimes(1);
    prisma.tenantMembership.findMany.mockResolvedValueOnce([{ id: "u2" }]);
    prisma.patronSavedCollection.findFirst.mockResolvedValueOnce(null as never);
    expect(await store.getCollectionWithEntriesForAccount("other-account", "col1")).toBeNull();
    expect(prisma.patronSavedCollection.findFirst).toHaveBeenLastCalledWith({ where: { id: "col1", patronMembershipId: { in: ["u2"] } } });
    expect(prisma.patronSavedCollectionEntry.findMany).toHaveBeenCalledTimes(1);
  });

  it("propagates database errors instead of reporting missing collection data", async () => {
    const prisma = {
      patronSavedCollection: { findFirst: vi.fn().mockRejectedValue(new Error("Read unavailable")) },
      tenantMembership: { findMany: vi.fn().mockResolvedValue([{ id: "u1" }]) }
    };
    const store = new DbPatronCollectionsStore(prisma as never);
    await expect(store.addEntry("c1", "u1", "col1", "p1", "m1")).rejects.toThrow("Read unavailable");
    await expect(store.getCollectionWithEntriesForAccount("account1", "col1")).rejects.toThrow("Read unavailable");
  });
});
