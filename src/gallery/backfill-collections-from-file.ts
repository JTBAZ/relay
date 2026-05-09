/**
 * @fileoverview Migration: `collections.json` + canonical snapshot → `library_collections` + links.
 */

import type { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import type { CanonicalSnapshot } from "../ingest/canonical-store.js";
import type { Collection, CollectionsRoot } from "./types.js";

function postsForCreator(snapshot: CanonicalSnapshot, creatorId: string): Set<string> {
  const map = snapshot.posts[creatorId];
  if (!map) {
    return new Set();
  }
  return new Set(Object.keys(map));
}

/**
 * @description Full-replace: `collections.json` → `library_collections` + `collection_posts`. Drops post ids absent from canonical snapshot (ingest truth).
 * @param args.prisma Prisma client.
 * @param args.collectionsPath Collections JSON path.
 * @param args.canonicalPath Canonical snapshot JSON path.
 * @returns Write statistics including dropped ids count.
 * @async
 * @throws Propagates file read / JSON parse / transaction failures.
 * @see prisma/schema.prisma `LibraryCollection`
 */
export async function backfillCollectionsFromFile(args: {
  prisma: PrismaClient;
  collectionsPath: string;
  canonicalPath: string;
}): Promise<{
  collectionsPath: string;
  canonicalPath: string;
  collectionsWritten: number;
  postLinksWritten: number;
  postIdsDropped: number;
}> {
  const collectionsRaw = await readFile(args.collectionsPath, "utf8");
  const canonicalRaw = await readFile(args.canonicalPath, "utf8");
  const root = JSON.parse(collectionsRaw) as CollectionsRoot;
  const snapshot = JSON.parse(canonicalRaw) as CanonicalSnapshot;

  let postIdsDropped = 0;
  const normalized: Collection[] = [];

  for (const c of root.collections) {
    const valid = postsForCreator(snapshot, c.creator_id);
    const kept: string[] = [];
    for (const pid of c.post_ids) {
      if (valid.has(pid)) {
        kept.push(pid);
      } else {
        postIdsDropped += 1;
      }
    }
    normalized.push({ ...c, post_ids: kept });
  }

  const postLinksWritten = normalized.reduce((n, c) => n + c.post_ids.length, 0);

  await args.prisma.$transaction(async (tx) => {
    await tx.libraryCollection.deleteMany({});
    for (const c of normalized) {
      await tx.libraryCollection.create({
        data: {
          id: c.collection_id,
          creatorId: c.creator_id,
          title: c.title,
          description: c.description ?? null,
          coverMediaId: c.cover_media_id ?? null,
          accessCeilingTierId: c.access_ceiling_tier_id ?? null,
          themeTagIds: [...c.theme_tag_ids],
          sortOrder: c.sort_order,
          createdAt: new Date(c.created_at),
          updatedAt: new Date(c.updated_at),
          posts: {
            create: c.post_ids.map((postId, sortIndex) => ({ postId, sortIndex }))
          }
        }
      });
    }
  });

  return {
    collectionsPath: args.collectionsPath,
    canonicalPath: args.canonicalPath,
    collectionsWritten: normalized.length,
    postLinksWritten,
    postIdsDropped
  };
}
