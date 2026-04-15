/**
 * One-shot unattended incremental sync (same logic as the background worker).
 * Run after `npm run build`: `node dist/src/autosync-once.js`
 */
import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "./lib/db.js";
import { runIncrementalAutosyncCycle } from "./patreon/incremental-sync-worker.js";
import { relayServerConfigFromEnv } from "./relay-server-env.js";
import { createApp } from "./server.js";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
loadEnv({ path: join(projectRoot, ".env") });

if (!process.env.RELAY_TOKEN_ENCRYPTION_KEY?.trim()) {
  console.error("Relay autosync-once: missing RELAY_TOKEN_ENCRYPTION_KEY.");
  process.exit(1);
}

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
  const r = await runIncrementalAutosyncCycle({
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
