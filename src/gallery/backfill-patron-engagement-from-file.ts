import type { PrismaClient } from "@prisma/client";
import { PatronFavoriteTargetKind as PrismaFavoriteKind } from "@prisma/client";
import { FilePatronCollectionsStore } from "./patron-collections-store.js";
import { FilePatronFavoritesStore } from "./patron-favorites-store.js";

function toPrismaKind(kind: "post" | "media"): PrismaFavoriteKind {
  return kind === "post" ? PrismaFavoriteKind.post : PrismaFavoriteKind.media;
}

export async function backfillPatronEngagementFromFiles(args: {
  prisma: PrismaClient;
  favoritesPath: string;
  collectionsPath: string;
}): Promise<{
  favoritesPath: string;
  collectionsPath: string;
  favorites: number;
  collections: number;
  entries: number;
}> {
  const favFile = new FilePatronFavoritesStore(args.favoritesPath);
  const colFile = new FilePatronCollectionsStore(args.collectionsPath);
  const favRoot = await favFile.load();
  const colRoot = await colFile.load();

  let favorites = 0;
  for (const f of favRoot.favorites) {
    const targetKind = toPrismaKind(f.target_kind);
    await args.prisma.patronFavorite.upsert({
      where: {
        patronUserId_creatorId_targetKind_targetId: {
          patronUserId: f.user_id,
          creatorId: f.creator_id,
          targetKind,
          targetId: f.target_id
        }
      },
      create: {
        patronUserId: f.user_id,
        creatorId: f.creator_id,
        targetKind,
        targetId: f.target_id,
        createdAt: new Date(f.created_at)
      },
      update: {}
    });
    favorites += 1;
  }

  let collections = 0;
  for (const c of colRoot.collections) {
    await args.prisma.patronSavedCollection.upsert({
      where: { id: c.collection_id },
      create: {
        id: c.collection_id,
        userId: c.user_id,
        creatorId: c.creator_id,
        title: c.title,
        sortOrder: c.sort_order,
        createdAt: new Date(c.created_at),
        updatedAt: new Date(c.updated_at)
      },
      update: {
        userId: c.user_id,
        creatorId: c.creator_id,
        title: c.title,
        sortOrder: c.sort_order,
        updatedAt: new Date(c.updated_at)
      }
    });
    collections += 1;
  }

  let entries = 0;
  for (const e of colRoot.entries) {
    await args.prisma.patronSavedCollectionEntry.upsert({
      where: { id: e.entry_id },
      create: {
        id: e.entry_id,
        collectionId: e.collection_id,
        userId: e.user_id,
        creatorId: e.creator_id,
        postId: e.post_id,
        mediaId: e.media_id,
        createdAt: new Date(e.created_at)
      },
      update: {
        collectionId: e.collection_id,
        userId: e.user_id,
        creatorId: e.creator_id,
        postId: e.post_id,
        mediaId: e.media_id
      }
    });
    entries += 1;
  }

  return {
    favoritesPath: args.favoritesPath,
    collectionsPath: args.collectionsPath,
    favorites,
    collections,
    entries
  };
}
