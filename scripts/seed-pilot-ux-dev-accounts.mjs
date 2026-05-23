/**
 * PUX-000 — seed two faux creators + one faux patron (no Patreon OAuth/API).
 *
 * Usage:
 *   npm run build && node scripts/seed-pilot-ux-dev-accounts.mjs
 *
 * Requires DATABASE_URL. Refuses production unless RELAY_ALLOW_PILOT_UX_SEED=1.
 * Dev password: RELAY_PILOT_UX_DEV_PASSWORD or fixture default (see pilot-ux-seed.json).
 */
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });

function assertSeedAllowed() {
  const nodeEnv = (process.env.NODE_ENV ?? "").trim().toLowerCase();
  if (nodeEnv === "production" && process.env.RELAY_ALLOW_PILOT_UX_SEED !== "1") {
    throw new Error(
      "Refusing pilot UX seed in production. Set RELAY_ALLOW_PILOT_UX_SEED=1 to override."
    );
  }
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required for pilot UX seed.");
  }
}

assertSeedAllowed();

const { assertPilotUxRequiredDbStores } = await import(
  "../dist/src/pilot/pilot-db-cutover.js"
);
assertPilotUxRequiredDbStores();

const { prisma } = await import("../dist/src/lib/db.js");
const { seedPilotUxDevAccounts } = await import(
  "../dist/src/pilot-ux/seed-pilot-ux-dev-accounts.js"
);

const fixtureArg = process.argv[2]?.trim();
const defaultFixture = join(root, "tests", "fixtures", "pilot-ux-seed.json");
const result = await seedPilotUxDevAccounts(prisma, {
  fixturePath: fixtureArg || defaultFixture
});

// eslint-disable-next-line no-console -- CLI output
console.log(
  `seed-pilot-ux-dev-accounts: ok\n` +
    `  fixture=${result.specPath}\n` +
    `  creators=${result.creators.map((c) => c.relayCreatorId).join(", ")}\n` +
    `  patron_membership=${result.patron.membershipId}\n` +
    `  counts: tiers=${result.counts.tiers} posts=${result.counts.posts} ` +
    `media=${result.counts.mediaAssets} follows=${result.counts.patronFollows} ` +
    `snapshots=${result.counts.entitlementSnapshots}\n` +
    `  dev login (web): /login/pilot-ux\n` +
    `  verify: npx vitest run tests/pilot-ux-permission-parity.test.ts`
);

await prisma.$disconnect();
