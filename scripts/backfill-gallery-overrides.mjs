/**
 * Full-replace backfill: gallery_post_overrides.json → Postgres (`post_overrides`).
 * Requires: `npm run build` first; DATABASE_URL in repo root `.env`.
 *
 * Usage:
 *   node scripts/backfill-gallery-overrides.mjs [path/to/gallery_post_overrides.json]
 */
import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });

const { prisma } = await import("../dist/src/lib/db.js");
const { backfillGalleryOverridesFromFile } = await import(
  "../dist/src/gallery/backfill-overrides-from-file.js"
);

const arg = process.argv[2];
const filePath =
  arg && arg.trim() !== ""
    ? arg
    : process.env.RELAY_GALLERY_POST_OVERRIDES_PATH?.trim() ||
      join(root, ".relay-data", "gallery_post_overrides.json");

const result = await backfillGalleryOverridesFromFile({ prisma, filePath });
// eslint-disable-next-line no-console -- CLI output
console.log(
  `backfill-gallery-overrides: ${result.filePath}\n` +
    `  creators=${result.creatorCount} row_hint≈${result.postOverrideRowsHint}`
);
await prisma.$disconnect();
