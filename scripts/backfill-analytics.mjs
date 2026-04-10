/**
 * Full-replace backfill: analytics.json → Postgres (Action Center tables).
 * Requires: `npm run build` first; DATABASE_URL in repo root `.env`.
 *
 * Usage:
 *   node scripts/backfill-analytics.mjs [path/to/analytics.json]
 */
import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });

const { prisma } = await import("../dist/src/lib/db.js");
const { backfillAnalyticsFromFile } = await import(
  "../dist/src/analytics/backfill-analytics-from-file.js"
);

const arg = process.argv[2];
const filePath =
  arg && arg.trim() !== ""
    ? arg
    : process.env.RELAY_ANALYTICS_STORE_PATH?.trim() ||
      join(root, ".relay-data", "analytics.json");

const result = await backfillAnalyticsFromFile({ prisma, filePath });
// eslint-disable-next-line no-console -- CLI output
console.log(
  `backfill-analytics: ${result.filePath}\n` +
    `  snapshots=${result.snapshots} cards=${result.cards} ` +
    `actions=${result.actions} outcomes=${result.outcomes}`
);
await prisma.$disconnect();
