/**
 * Full-replace backfill: page_layout.json → Postgres (`page_layouts`).
 * Requires: `npm run build` first; DATABASE_URL in repo root `.env`.
 *
 * Usage:
 *   node scripts/backfill-page-layout.mjs [path/to/page_layout.json]
 */
import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });

const { prisma } = await import("../dist/src/lib/db.js");
const { backfillPageLayoutFromFile } = await import("../dist/src/gallery/backfill-layout-from-file.js");

const arg = process.argv[2];
const filePath =
  arg && arg.trim() !== ""
    ? arg
    : process.env.RELAY_PAGE_LAYOUT_STORE_PATH?.trim() || join(root, ".relay-data", "page_layout.json");

const result = await backfillPageLayoutFromFile({ prisma, filePath });
// eslint-disable-next-line no-console -- CLI output
console.log(`backfill-page-layout: ${result.filePath}\n  layouts=${result.layoutCount}`);
await prisma.$disconnect();
