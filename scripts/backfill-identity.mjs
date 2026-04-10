/**
 * Idempotent backfill: identity.json → Postgres (users + hashed sessions).
 * Requires: `npm run build` first; DATABASE_URL in repo root `.env`.
 *
 * Usage:
 *   node scripts/backfill-identity.mjs [path/to/identity.json]
 * Default path: RELAY_IDENTITY_STORE_PATH or .relay-data/identity.json
 */
import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });

const { prisma } = await import("../dist/src/lib/db.js");
const { backfillIdentityFromFile } = await import(
  "../dist/src/identity/backfill-identity-from-file.js"
);

const arg = process.argv[2];
const filePath =
  arg && arg.trim() !== ""
    ? arg
    : process.env.RELAY_IDENTITY_STORE_PATH?.trim() ||
      join(root, ".relay-data", "identity.json");

const result = await backfillIdentityFromFile({ prisma, filePath });
// eslint-disable-next-line no-console -- CLI output
console.log(
  `backfill-identity: ${filePath} → users=${result.usersUpserted} sessions=${result.sessionsUpserted}`
);
await prisma.$disconnect();
