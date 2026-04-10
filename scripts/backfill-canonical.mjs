/**
 * Full-replace backfill: canonical.json → Postgres (`DbCanonicalStore.save`).
 * Requires: `npm run build` first; DATABASE_URL in repo root `.env`.
 *
 * Usage:
 *   node scripts/backfill-canonical.mjs [path/to/canonical.json]
 * Default path: RELAY_INGEST_CANONICAL_PATH or .relay-data/canonical.json
 */
import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });

const { prisma } = await import("../dist/src/lib/db.js");
const { backfillCanonicalFromFile } = await import(
  "../dist/src/ingest/backfill-canonical-from-file.js"
);

const arg = process.argv[2];
const filePath =
  arg && arg.trim() !== ""
    ? arg
    : process.env.RELAY_INGEST_CANONICAL_PATH?.trim() ||
      join(root, ".relay-data", "canonical.json");

const result = await backfillCanonicalFromFile({ prisma, filePath });
// eslint-disable-next-line no-console -- CLI output
console.log(
  `backfill-canonical: ${result.filePath}\n` +
    `  campaigns=${result.counts.campaigns} tiers=${result.counts.tiers} posts=${result.counts.posts} ` +
    `media=${result.counts.media} idempotency_keys=${result.counts.ingestIdempotencyKeys}`
);
await prisma.$disconnect();
