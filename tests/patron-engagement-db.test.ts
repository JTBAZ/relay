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
    const prisma = { patronFavorite: { findUnique, create, deleteMany } };
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
  it("addEntry throws when collection missing", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const prisma = {
      patronSavedCollection: { findFirst },
      patronSavedCollectionEntry: {}
    };
    const store = new DbPatronCollectionsStore(prisma as never);
    await expect(
      store.addEntry("c1", "u1", "pcol_x", "p1", "m1")
    ).rejects.toThrow(/Collection not found/);
  });
});
