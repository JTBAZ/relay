/**
 * @fileoverview Migration: gallery overrides JSON → `post_overrides` rows.
 */

import type { PrismaClient } from "@prisma/client";
import { FileGalleryOverridesStore } from "./overrides-store.js";
import { DbGalleryOverridesStore } from "./overrides-store-db.js";

/**
 * @description Full-replace: `gallery_post_overrides.json` → `post_overrides` via {@link DbGalleryOverridesStore.save}.
 * @param args.prisma Prisma client.
 * @param args.filePath Overrides JSON path.
 * @returns Creator count + flattened row hint for logs.
 * @async
 * @throws Propagates file + DB transaction failures.
 */
export async function backfillGalleryOverridesFromFile(args: {
  prisma: PrismaClient;
  filePath: string;
}): Promise<{ filePath: string; creatorCount: number; postOverrideRowsHint: number }> {
  const file = new FileGalleryOverridesStore(args.filePath);
  const root = await file.load();
  const db = new DbGalleryOverridesStore(args.prisma);
  await db.save(root);
  let postOverrideRowsHint = 0;
  for (const c of Object.values(root.creators)) {
    for (const po of Object.values(c.posts)) {
      postOverrideRowsHint += 1;
      postOverrideRowsHint += Object.keys(po.media ?? {}).length;
    }
  }
  return {
    filePath: args.filePath,
    creatorCount: Object.keys(root.creators).length,
    postOverrideRowsHint
  };
}
