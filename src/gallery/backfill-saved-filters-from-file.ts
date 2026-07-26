/**
 * @fileoverview Migration: saved filters JSON → `saved_filters` via store helper.
 */

import type { PrismaClient } from "@prisma/client";
import { FileSavedFiltersStore } from "./saved-filters-store.js";
import { DbSavedFiltersStore } from "./saved-filters-store-db.js";

/**
 * @description Full-replace: `gallery_saved_filters.json` → `saved_filters` via {@link DbSavedFiltersStore.save}.
 * @param args.prisma Prisma client.
 * @param args.filePath JSON path.
 * @returns Filter count written.
 * @async
 * @throws Propagates load/save failures.
 */
export async function backfillSavedFiltersFromFile(args: {
  prisma: PrismaClient;
  filePath: string;
}): Promise<{ filePath: string; filterCount: number }> {
  const file = new FileSavedFiltersStore(args.filePath);
  const root = await file.load();
  const db = new DbSavedFiltersStore(args.prisma);
  await db.save(root);
  return { filePath: args.filePath, filterCount: root.filters.length };
}
