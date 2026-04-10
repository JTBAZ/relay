import type { PrismaClient } from "@prisma/client";
import { FileSavedFiltersStore } from "./saved-filters-store.js";
import { DbSavedFiltersStore } from "./saved-filters-store-db.js";

/**
 * Full-replace: `gallery_saved_filters.json` → `saved_filters` via `DbSavedFiltersStore.save`.
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
