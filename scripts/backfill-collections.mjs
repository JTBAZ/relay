/**
 * Full-replace backfill: collections.json → Postgres (`library_collections` + `collection_posts`).
 * Drops collection post_ids that are not present in canonical for that creator.
 * Requires: `npm run build` first; DATABASE_URL in repo root `.env`.
 *
 * Usage:
 *   node scripts/backfill-collections.mjs [collections.json] [canonical.json]
 */
import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });

const { prisma } = await import("../dist/src/lib/db.js");
const { backfillCollectionsFromFile } = await import(
  "../dist/src/gallery/backfill-collections-from-file.js"
);

const a1 = process.argv[2];
const a2 = process.argv[3];
const collectionsPath =
  a1 && a1.trim() !== ""
    ? a1
    : process.env.RELAY_COLLECTIONS_STORE_PATH?.trim() || join(root, ".relay-data", "collections.json");
const canonicalPath =
  a2 && a2.trim() !== ""
    ? a2
    : process.env.RELAY_INGEST_CANONICAL_PATH?.trim() || join(root, ".relay-data", "canonical.json");

const result = await backfillCollectionsFromFile({ prisma, collectionsPath, canonicalPath });
// eslint-disable-next-line no-console -- CLI output
console.log(
  `backfill-collections: ${result.collectionsPath}\n` +
    `  canonical=${result.canonicalPath}\n` +
    `  collections=${result.collectionsWritten} post_links=${result.postLinksWritten} dropped_post_ids=${result.postIdsDropped}`
);
await prisma.$disconnect();
