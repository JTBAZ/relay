/**
 * PILOT-002 — print which RELAY_DB_STORE_* flags are on for the current shell .env.
 *
 * Usage:
 *   node scripts/pilot-env-check.mjs
 *
 * Loads repo-root `.env` via dotenv (does not print secrets).
 */
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });

const { getPilotDbStoreStatus, PILOT_UX_REQUIRED_STORE_ENVS } = await import(
  "../dist/src/pilot/pilot-db-cutover.js"
);

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
const rows = getPilotDbStoreStatus();

// eslint-disable-next-line no-console -- CLI
console.log("Pilot DB cutover — RELAY_DB_STORE_* status\n");
// eslint-disable-next-line no-console -- CLI
console.log(`  DATABASE_URL: ${hasDatabaseUrl ? "set" : "MISSING"}`);

for (const row of rows) {
  const mark = row.enabled ? "ON " : "off";
  const tags = [
    row.requiredForPilotUx ? "required" : null,
    row.recommendedForPilotUx ? "recommended" : null
  ]
    .filter(Boolean)
    .join(", ");
  const suffix = tags ? ` (${tags})` : "";
  // eslint-disable-next-line no-console -- CLI
  console.log(`  ${mark}  ${row.env}${suffix}`);
  // eslint-disable-next-line no-console -- CLI
  console.log(`         → ${row.pilotSurface}`);
}

const missingRequired = PILOT_UX_REQUIRED_STORE_ENVS.filter(
  (name) => !rows.find((r) => r.env === name)?.enabled
);

if (!hasDatabaseUrl) {
  // eslint-disable-next-line no-console -- CLI
  console.log("\n⚠ Set DATABASE_URL before migrate deploy or seed:pilot-ux.");
}

if (missingRequired.length > 0) {
  // eslint-disable-next-line no-console -- CLI
  console.log(
    `\n⚠ Pilot UX minimum not met (off): ${missingRequired.join(", ")}`
  );
  // eslint-disable-next-line no-console -- CLI
  console.log("  See docs/pilot-db-cutover.md");
  process.exitCode = 1;
} else if (hasDatabaseUrl) {
  // eslint-disable-next-line no-console -- CLI
  console.log("\n✓ Pilot UX minimum store flags are on.");
}
