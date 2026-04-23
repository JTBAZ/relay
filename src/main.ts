import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "./lib/db.js";
import { startIncrementalAutosyncWorker } from "./patreon/incremental-sync-worker.js";
import {
  patronEntitlementStaleRefreshBatchFromEnv,
  patronEntitlementStaleRefreshIntervalFromEnv,
  startPatronEntitlementStaleRefreshWorker
} from "./patron/patron-entitlement-stale-worker.js";
import { startNotificationDeliveryWorker } from "./patron/notification-delivery-worker.js";
import { startAccountDeletionWorker } from "./patron/account-deletion-worker.js";
import { relayServerConfigFromEnv } from "./relay-server-env.js";
import { createApp } from "./server.js";

/** Repo root: `dist/src/main.js` → two levels up. */
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
loadEnv({ path: join(projectRoot, ".env") });

/** Log async failures that would otherwise terminate the process (Node 22+ strict mode). */
process.on("unhandledRejection", (reason: unknown) => {
  // eslint-disable-next-line no-console -- fatal diagnostics
  console.error("Relay: unhandledRejection", reason);
});
process.on("uncaughtException", (err: Error) => {
  // eslint-disable-next-line no-console -- fatal diagnostics
  console.error("Relay: uncaughtException", err);
  process.exit(1);
});

function relayEnvTruthy(raw: string | undefined): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Background incremental autosync when `RELAY_AUTOSYNC_ENABLED` or `RELAY_PATREON_INCREMENTAL_AUTOSYNC_MS` (≥ 10s). */
function shouldStartPatreonIncrementalAutosync(): boolean {
  if (relayEnvTruthy(process.env.RELAY_AUTOSYNC_ENABLED)) return true;
  const raw = process.env.RELAY_PATREON_INCREMENTAL_AUTOSYNC_MS?.trim();
  if (!raw) return false;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 10_000;
}

if (!process.env.RELAY_TOKEN_ENCRYPTION_KEY?.trim()) {
  // eslint-disable-next-line no-console -- CLI entrypoint
  console.error(
    `Relay: missing RELAY_TOKEN_ENCRYPTION_KEY.\n` +
      `  Add it to: ${join(projectRoot, ".env")}\n` +
      `  Generate:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"\n` +
      `  Name must be exactly: RELAY_TOKEN_ENCRYPTION_KEY=...`
  );
  process.exit(1);
}

const port = Number(process.env.PORT ?? "8787");
const serverConfig = relayServerConfigFromEnv();
const fetchImpl = serverConfig.fetch_impl ?? globalThis.fetch;

const {
  app,
  tokenStore,
  patreonSyncService,
  patreonSyncHealthStore,
  patreonCampaignCreatorIndex,
  encryption,
  patreonClient
} = createApp({
  ...serverConfig,
  prisma
});

let stopAutosync: (() => void) | undefined;
if (shouldStartPatreonIncrementalAutosync()) {
  stopAutosync = startIncrementalAutosyncWorker({
    tokenStore,
    patreonSyncService,
    syncHealthStore: patreonSyncHealthStore,
    campaignCreatorIndex: patreonCampaignCreatorIndex,
    prisma
  });
}

const patronStaleRefreshMs = patronEntitlementStaleRefreshIntervalFromEnv();
let stopPatronStaleRefresh: (() => void) | undefined;
if (patronStaleRefreshMs > 0 && prisma) {
  stopPatronStaleRefresh = startPatronEntitlementStaleRefreshWorker({
    prisma,
    encryption,
    patreonClient,
    fetchImpl,
    intervalMs: patronStaleRefreshMs,
    batchSize: patronEntitlementStaleRefreshBatchFromEnv()
  });
}

// PE-G (BO-P3-03) — notification delivery loop. Reads OutboxEvent rows, fan-outs to per-
// recipient Notification rows. Disable with RELAY_NOTIFICATION_DELIVERY_MS=0; defaults to
// 5s otherwise. Multi-node deploys swap this for a BullMQ-backed runner once Redis lands
// (interface-compatible; same processOnce body).
const notificationRunner = prisma
  ? startNotificationDeliveryWorker(prisma, (msg, ctx) => {
      // eslint-disable-next-line no-console -- background diagnostic
      console.warn(`Relay: ${msg}`, ctx ?? {});
    })
  : null;

// PE-J (BO-P4-02) — account deletion sweeper. Periodically executes pending deletions whose
// grace period (default 7 days, RELAY_ACCOUNT_DELETION_GRACE_DAYS) has elapsed. Disable
// with RELAY_ACCOUNT_DELETION_SWEEP_MS=0; defaults to 1h otherwise.
const accountDeletionRunner = prisma
  ? startAccountDeletionWorker(prisma, (msg, ctx) => {
      // eslint-disable-next-line no-console -- background diagnostic
      console.warn(`Relay: ${msg}`, ctx ?? {});
    })
  : null;

const server = app.listen(port, () => {
  // eslint-disable-next-line no-console -- CLI entrypoint
  console.log(`Relay API listening on http://127.0.0.1:${port}`);
});

function shutdown(signal: "SIGINT" | "SIGTERM") {
  stopAutosync?.();
  stopPatronStaleRefresh?.();
  void notificationRunner?.stop();
  void accountDeletionRunner?.stop();
  // eslint-disable-next-line no-console -- CLI entrypoint
  console.log(`Relay: ${signal}, closing HTTP server…`);
  server.close((err) => {
    if (err) {
      // eslint-disable-next-line no-console -- CLI entrypoint
      console.error("Relay: HTTP server close error", err);
    }
    void prisma
      .$disconnect()
      .then(() => {
        process.exit(err ? 1 : 0);
      })
      .catch((e: unknown) => {
        // eslint-disable-next-line no-console -- CLI entrypoint
        console.error("Relay: prisma.$disconnect error", e);
        process.exit(1);
      });
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
