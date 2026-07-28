/**
 * Backfill Creative Work + Patreon Platform Instance for ingested Patreon posts.
 * Requires: `npm run build` first; DATABASE_URL in repo root `.env`.
 *
 * Usage:
 *   node scripts/backfill-patreon-packaging.mjs
 *   node scripts/backfill-patreon-packaging.mjs --creator-id=cr_…
 */
import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });

const { prisma } = await import("../dist/src/lib/db.js");
const { backfillPatreonPackaging } = await import(
  "../dist/src/analytics/backfill-patreon-packaging.js"
);

const creatorArg = process.argv.find((a) => a.startsWith("--creator-id="));
const creatorId = creatorArg?.slice("--creator-id=".length)?.trim() || undefined;

const result = await backfillPatreonPackaging(prisma, { creatorId });
// eslint-disable-next-line no-console -- CLI output
console.log(
  `backfill-patreon-packaging${creatorId ? ` creator=${creatorId}` : ""}:\n` +
    `  scanned=${result.scanned}\n` +
    `  creative_works_created=${result.creative_works_created}\n` +
    `  platform_instances_created=${result.platform_instances_created}\n` +
    `  platform_instances_updated=${result.platform_instances_updated}\n` +
    `  skipped_non_patreon_id=${result.skipped_non_patreon_id}`
);
await prisma.$disconnect();
