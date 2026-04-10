/**
 * Backfill: patron_favorites.json + patron_collections.json → Postgres.
 * Requires: `npm run build` first; DATABASE_URL in repo root `.env`.
 *
 * Usage:
 *   node scripts/backfill-patron-engagement.mjs [favorites.json] [collections.json]
 */
import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });

const { prisma } = await import("../dist/src/lib/db.js");
const { backfillPatronEngagementFromFiles } = await import(
  "../dist/src/gallery/backfill-patron-engagement-from-file.js"
);

const a = process.argv[2];
const b = process.argv[3];
const favoritesPath =
  a && a.trim() !== ""
    ? a
    : process.env.RELAY_PATRON_FAVORITES_PATH?.trim() ||
      join(root, ".relay-data", "patron_favorites.json");
const collectionsPath =
  b && b.trim() !== ""
    ? b
    : process.env.RELAY_PATRON_COLLECTIONS_PATH?.trim() ||
      join(root, ".relay-data", "patron_collections.json");

const result = await backfillPatronEngagementFromFiles({
  prisma,
  favoritesPath,
  collectionsPath
});
// eslint-disable-next-line no-console -- CLI output
console.log(
  `backfill-patron-engagement:\n  favorites=${result.favoritesPath}\n  collections=${result.collectionsPath}\n` +
    `  rows: favorites=${result.favorites} collections=${result.collections} entries=${result.entries}`
);
await prisma.$disconnect();
