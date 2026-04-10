import { describe, expect, it, vi } from "vitest";
import { DbCloneSiteStore } from "../src/clone/clone-store-db.js";
import { DbPatronCollectionsStore } from "../src/gallery/patron-collections-store-db.js";
import { DbPatronFavoritesStore } from "../src/gallery/patron-favorites-store-db.js";

/**
 * M10.1.4 — query shapes must scope by Relay `creator_id` (or equivalent) so two tenants
 * cannot read each other's rows when stores are implemented correctly.
 */
describe("M10 cross-tenant isolation (DB store query scope)", () => {
  it("DbPatronFavoritesStore.listForUser filters by creatorId and patronUserId", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { patronFavorite: { findMany } };
    const store = new DbPatronFavoritesStore(prisma as never);
    await store.listForUser("creator_aaa", "user_u1");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { creatorId: "creator_aaa", patronUserId: "user_u1" }
      })
    );
  });

  it("DbCloneSiteStore.getByCreator loads only the requested creator row", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = { cloneSite: { findUnique } };
    const store = new DbCloneSiteStore(prisma as never);
    await store.getByCreator("creator_bbb");
    expect(findUnique).toHaveBeenCalledWith({
      where: { creatorId: "creator_bbb" }
    });
  });

  it("DbPatronCollectionsStore.listCollectionsWithEntries filters by creatorId and userId", async () => {
    const findManyCols = vi.fn().mockResolvedValue([]);
    const findManyEntries = vi.fn().mockResolvedValue([]);
    const prisma = {
      patronSavedCollection: { findMany: findManyCols },
      patronSavedCollectionEntry: { findMany: findManyEntries }
    };
    const store = new DbPatronCollectionsStore(prisma as never);
    await store.listCollectionsWithEntries("creator_ccc", "user_u2");
    expect(findManyCols).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { creatorId: "creator_ccc", userId: "user_u2" }
      })
    );
  });
});
