/**
 * Read-only identity ownership audit (Unified Relay Identity).
 *
 * Usage:
 *   npm run build
 *   node scripts/audit-identity-ownership.mjs
 *   node scripts/audit-identity-ownership.mjs --json
 *
 * Never mutates ownership. Review conflicts before any backfill/claim.
 */
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });

const asJson = process.argv.includes("--json");

const { prisma } = await import("../dist/src/lib/db.js");
const { auditIdentityOwnership } = await import(
  "../dist/src/identity/identity-reconciliation.js"
);

const findings = await auditIdentityOwnership(prisma);
const summary = {
  total: findings.length,
  conflicts: findings.filter((f) => f.severity === "conflict").length,
  warns: findings.filter((f) => f.severity === "warn").length,
  infos: findings.filter((f) => f.severity === "info").length,
  findings
};

if (asJson) {
  // eslint-disable-next-line no-console -- CLI
  console.log(JSON.stringify(summary, null, 2));
} else {
  // eslint-disable-next-line no-console -- CLI
  console.log(
    `Identity audit: ${summary.total} findings (${summary.conflicts} conflict, ${summary.warns} warn, ${summary.infos} info)`
  );
  for (const f of findings) {
    // eslint-disable-next-line no-console -- CLI
    console.log(`- [${f.severity}] ${f.kind}: ${f.detail}`);
  }
}

await prisma.$disconnect();
process.exit(summary.conflicts > 0 ? 2 : 0);
