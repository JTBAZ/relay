/**
 * Full-replace backfill: gallery_saved_filters.json → Postgres (`saved_filters`).
 * Requires: `npm run build` first; DATABASE_URL in repo root `.env`.
 *
 * Usage:
 *   node scripts/backfill-saved-filters.mjs [path/to/gallery_saved_filters.json]
 */
import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });

const { prisma } = await import("../dist/src/lib/db.js");
const { backfillSavedFiltersFromFile } = await import(
  "../dist/src/gallery/backfill-saved-filters-from-file.js"
);

const arg = process.argv[2];
const filePath =
  arg && arg.trim() !== ""
    ? arg
    : process.env.RELAY_GALLERY_SAVED_FILTERS_PATH?.trim() ||
      join(root, ".relay-data", "gallery_saved_filters.json");

const result = await backfillSavedFiltersFromFile({ prisma, filePath });
// eslint-disable-next-line no-console -- CLI output
console.log(`backfill-saved-filters: ${result.filePath}\n  filters=${result.filterCount}`);
await prisma.$disconnect();
