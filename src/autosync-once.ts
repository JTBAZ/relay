/**
 * @fileoverview CLI entry: runs a single incremental Patreon autosync cycle (same coordinator as the in-process worker).
 * @description Loads `.env` from the repo root, builds the app via `createApp` + `relayServerConfigFromEnv`, then invokes `runIncrementalAutosyncOnce`. Exits non-zero when any creator fails.
 * @see {@link ./jsdoc-core-entities.ts} Domain typedefs (`Artist`, `SyncStatus`)
 * @see prisma/schema.prisma `CreatorProfile`, `Tenant`, token / sync health models consumed by the sync stack
 * @todo Brittle: assumes `dist` layout and cwd-relative `.env`; failures surface as process exit only.
 */
import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "./lib/db.js";
import { runIncrementalAutosyncOnce } from "./patreon/incremental-sync-worker.js";
import { relayServerConfigFromEnv } from "./relay-server-env.js";
import { createApp } from "./server.js";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
loadEnv({ path: join(projectRoot, ".env") });

if (!process.env.RELAY_TOKEN_ENCRYPTION_KEY?.trim()) {
  console.error("Relay autosync-once: missing RELAY_TOKEN_ENCRYPTION_KEY.");
  process.exit(1);
}

/**
 * Builds services from env, runs one autosync cycle, prints JSON summary, disconnects Prisma.
 * @async
 * @throws {Error} From `createApp`, Patreon HTTP, or Prisma when sync or disconnect fails.
 */
async function main() {
  const {
    patreonSyncService,
    tokenStore,
    patreonSyncHealthStore,
    patreonCampaignCreatorIndex
  } = createApp({
    ...relayServerConfigFromEnv(),
    prisma
  });
  const r = await runIncrementalAutosyncOnce({
    tokenStore,
    patreonSyncService,
    syncHealthStore: patreonSyncHealthStore,
    campaignCreatorIndex: patreonCampaignCreatorIndex,
    prisma
  });
  console.log(JSON.stringify(r, null, 2));
  await prisma.$disconnect();
  process.exit(r.creators_failed > 0 ? 1 : 0);
}

void main().catch((e) => {
  console.error(e);
  void prisma.$disconnect().finally(() => process.exit(1));
});
