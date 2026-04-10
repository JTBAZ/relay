/**
 * Backfill Part 2 JSON → Postgres (clone, payments, migrations, deploys).
 * Requires: `npm run build` first; DATABASE_URL in repo root `.env`.
 *
 * Usage:
 *   node scripts/backfill-part2.mjs [clone_sites.json] [payments.json] [migrations.json] [deploys.json]
 */
import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });

const { prisma } = await import("../dist/src/lib/db.js");
const { backfillPart2FromFiles } = await import("../dist/src/backfill-part2-from-files.js");

const a = process.argv[2];
const b = process.argv[3];
const c = process.argv[4];
const d = process.argv[5];

const clonePath =
  a && a.trim() !== ""
    ? a
    : process.env.RELAY_CLONE_STORE_PATH?.trim() || join(root, ".relay-data", "clone_sites.json");
const paymentsPath =
  b && b.trim() !== ""
    ? b
    : process.env.RELAY_PAYMENT_STORE_PATH?.trim() || join(root, ".relay-data", "payments.json");
const migrationsPath =
  c && c.trim() !== ""
    ? c
    : process.env.RELAY_MIGRATION_STORE_PATH?.trim() || join(root, ".relay-data", "migrations.json");
const deploysPath =
  d && d.trim() !== ""
    ? d
    : process.env.RELAY_DEPLOY_STORE_PATH?.trim() || join(root, ".relay-data", "deploys.json");

const result = await backfillPart2FromFiles({
  prisma,
  clonePath,
  paymentsPath,
  migrationsPath,
  deploysPath
});
// eslint-disable-next-line no-console -- CLI output
console.log(
  "backfill-part2:\n" +
    `  clone=${clonePath}\n  payments=${paymentsPath}\n  migrations=${migrationsPath}\n  deploys=${deploysPath}\n` +
    `  cloneSites=${result.cloneSites} paymentConfigs=${result.paymentConfigs} checkouts=${result.paymentCheckouts}\n` +
    `  migrationCampaigns=${result.migrationCampaigns} auditEntries=${result.migrationAuditEntries}\n` +
    `  suppressionEmails=${result.suppressionEmails} signedLinks=${result.signedLinks}\n` +
    `  deployments=${result.deployments} activeDeployments=${result.activeDeployments}`
);
await prisma.$disconnect();
