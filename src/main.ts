/**
 * @fileoverview Process entrypoint: loads env, wires Prisma-backed `createApp`, and starts HTTP + background workers.
 * @description Configures background jobs via `RELAY_JOB_BACKEND` (`memory` = in-process timers, `bullmq` = Redis workers). When `memory`, starts Patreon incremental autosync, patron entitlement refresh, notification delivery, account deletion sweep, and media purge workers when enabled. Exits if `RELAY_TOKEN_ENCRYPTION_KEY` is missing; `bullmq` requires `REDIS_URL`.
 * @see src/server.ts `createApp` — primary Express app and route wiring
 * @see src/lib/db.ts Shared `PrismaClient` singleton
 * @see src/jsdoc-core-entities.ts Canonical `Artist`, `Gallery`, `SyncStatus` typedefs
 * @todo Consider structured shutdown (drain HTTP + wait for in-flight idempotent jobs) before `prisma.$disconnect`.
 */

import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "./lib/db.js";
import { relayJobBackendFromEnv } from "./jobs/relay-job-backend.js";
import { registerRelayBullMqWorkers } from "./jobs/register-workers.js";
import { startIncrementalAutosyncWorker } from "./patreon/incremental-sync-worker.js";
import {
  patronEntitlementStaleRefreshBatchFromEnv,
  patronEntitlementStaleRefreshIntervalFromEnv,
  startPatronEntitlementStaleRefreshWorker
} from "./patron/patron-entitlement-stale-worker.js";
import { startNotificationDeliveryWorker } from "./patron/notification-delivery-worker.js";
import { startAccountDeletionWorker } from "./patron/account-deletion-worker.js";
import { startMediaStoragePurgeWorker } from "./storage/media-storage-purge-worker.js";
import { relayServerConfigFromEnv } from "./relay-server-env.js";
import { createApp } from "./server.js";

/**
 * @description Repo root: `dist/src/main.js` → two levels up; used for `.env` path resolution.
 * @const {string} projectRoot
 */
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
loadEnv({ path: join(projectRoot, ".env") });

/**
 * @description Log async failures that would otherwise terminate the process (Node 22+ strict mode).
 * @param {unknown} reason Rejection reason forwarded to stderr.
 */
process.on("unhandledRejection", (reason: unknown) => {
  // eslint-disable-next-line no-console -- fatal diagnostics
  console.error("Relay: unhandledRejection", reason);
});
/**
 * @description Fatal guard: log and exit non-zero on uncaught synchronous exceptions.
 * @param {Error} err Uncaught exception instance.
 */
process.on("uncaughtException", (err: Error) => {
  // eslint-disable-next-line no-console -- fatal diagnostics
  console.error("Relay: uncaughtException", err);
  process.exit(1);
});

/**
 * @description Interprets common truthy env string values (`1`, `true`, `yes`, case-insensitive).
 * @param {string | undefined} raw Environment variable value or undefined.
 * @returns {boolean} True when the value is considered enabled.
 */
function relayEnvTruthy(raw: string | undefined): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * @description Background incremental autosync when `RELAY_AUTOSYNC_ENABLED` or `RELAY_PATREON_INCREMENTAL_AUTOSYNC_MS` (≥ 10s).
 * @returns {boolean} Whether to start the Patreon incremental autosync worker.
 * @see src/patreon/incremental-sync-worker.ts Worker implementation and failure modes
 */
function shouldStartPatreonIncrementalAutosync(): boolean {
  if (relayEnvTruthy(process.env.RELAY_AUTOSYNC_ENABLED)) return true;
  const raw = process.env.RELAY_PATREON_INCREMENTAL_AUTOSYNC_MS?.trim();
  if (!raw) return false;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 10_000;
}

/** `memory` (default) uses in-process timers; `bullmq` uses Redis workers (see `RELAY_JOB_BACKEND` in `.env.example`). */
const jobBackend = relayJobBackendFromEnv();

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

/**
 * @description HTTP listen port; defaults to `8787` when `PORT` unset.
 * @const {number} port
 */
const port = Number(process.env.PORT ?? "8787");
/**
 * @description Normalized Relay server env (`src/relay-server-env.ts`).
 * @const serverConfig
 */
const serverConfig = relayServerConfigFromEnv();
/**
 * @description Fetch implementation for outbound Patreon/Supabase calls (configurable for tests).
 * @const {typeof fetch} fetchImpl
 */
const fetchImpl = serverConfig.fetch_impl ?? globalThis.fetch;

/**
 * @description Express app and core services from `createApp` (see server module for route-level `@security-audit-required` scope).
 * @description Synchronous factory; background workers started below perform async I/O.
 * @throws {Error} When `createApp` throws for invalid config (e.g. DB flags without `prisma`).
 * @see src/server.ts `createApp`
 */
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

/**
 * @description Stop handle for Patreon incremental autosync loop; undefined when not started.
 */
let stopAutosync: (() => void) | undefined;
if (jobBackend === "memory" && shouldStartPatreonIncrementalAutosync()) {
  stopAutosync = startIncrementalAutosyncWorker({
    tokenStore,
    patreonSyncService,
    syncHealthStore: patreonSyncHealthStore,
    campaignCreatorIndex: patreonCampaignCreatorIndex,
    prisma
  });
}

/**
 * @description Interval for patron entitlement stale refresh; `0` disables the worker.
 * @const {number} patronStaleRefreshMs
 */
const patronStaleRefreshMs = patronEntitlementStaleRefreshIntervalFromEnv();
/**
 * @description Stop handle for patron entitlement refresh worker.
 */
let stopPatronStaleRefresh: (() => void) | undefined;
if (jobBackend === "memory" && patronStaleRefreshMs > 0 && prisma) {
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
/**
 * @description Notification delivery runner; `null` when Prisma unavailable.
 * @async Worker performs DB reads/writes on `OutboxEvent` / `Notification` tables.
 * @throws {Error} DB connectivity failures surface through worker logs / `stop()` promise.
 * @see prisma/schema.prisma Outbox and notification models
 * @security-audit-required Delivers user-targeted notifications; ensure recipient scoping matches `user_id` / tenant in store queries.
 */
const notificationRunner =
  jobBackend === "memory" && prisma
  ? startNotificationDeliveryWorker(prisma, (msg, ctx) => {
      // eslint-disable-next-line no-console -- background diagnostic
      console.warn(`Relay: ${msg}`, ctx ?? {});
    })
  : null;

// PE-J (BO-P4-02) — account deletion sweeper. Periodically executes pending deletions whose
// grace period (default 7 days, RELAY_ACCOUNT_DELETION_GRACE_DAYS) has elapsed. Disable
// with RELAY_ACCOUNT_DELETION_SWEEP_MS=0; defaults to 1h otherwise.
/**
 * @description Account deletion sweeper; `null` when Prisma unavailable.
 * @async Mutates account deletion / PII purge state per configured grace period.
 * @throws {Error} Persistence failures during sweep; logged via callback.
 * @security-audit-required Processes user deletion requests; verify each mutation keys off correct `user_id` / account rows.
 * @see src/patron/account-deletion-worker.ts
 */
const accountDeletionRunner =
  jobBackend === "memory" && prisma
  ? startAccountDeletionWorker(prisma, (msg, ctx) => {
      // eslint-disable-next-line no-console -- background diagnostic
      console.warn(`Relay: ${msg}`, ctx ?? {});
    })
  : null;

/**
 * @description Background processor for deferred R2/object purge queue entries.
 * @async Performs transactional enqueue consumption and storage deletes.
 * @throws {Error} Worker errors propagate to stderr via logger callback.
 * @see src/storage/media-storage-purge-worker.ts
 * @see prisma/schema.prisma Media purge queue / `MediaAsset` relations
 */
const mediaStoragePurgeRunner =
  jobBackend === "memory" && prisma
  ? startMediaStoragePurgeWorker(prisma, (msg, ctx) => {
      // eslint-disable-next-line no-console -- background diagnostic
      console.warn(`Relay: ${msg}`, ctx ?? {});
    })
  : null;

/** BullMQ worker close handles when `RELAY_JOB_BACKEND=bullmq`. */
let closeBullMqWorkers: (() => Promise<void>) | undefined;
if (jobBackend === "bullmq") {
  closeBullMqWorkers = registerRelayBullMqWorkers({
    prisma,
    tokenStore,
    patreonSyncService,
    syncHealthStore: patreonSyncHealthStore,
    campaignCreatorIndex: patreonCampaignCreatorIndex,
    encryption,
    patreonClient,
    fetchImpl,
    log: (msg, ctx) => {
      // eslint-disable-next-line no-console -- background diagnostic
      console.warn(`Relay: ${msg}`, ctx ?? {});
    }
  });
  // eslint-disable-next-line no-console -- CLI entrypoint
  console.warn(
    "Relay: RELAY_JOB_BACKEND=bullmq — in-process job timers are off; enqueue work or add repeatable jobs (P1-queue-012)."
  );
}

/**
 * @description Bound HTTP server for Express `app`.
 * @const server
 * @throws {Error} When listen fails (port in use, etc.).
 */
const server = app.listen(port, () => {
  // eslint-disable-next-line no-console -- CLI entrypoint
  console.log(`Relay API listening on http://127.0.0.1:${port}`);
});

/**
 * @description Graceful shutdown: stop workers, close HTTP, disconnect Prisma.
 * @param {"SIGINT" | "SIGTERM"} signal OS signal being handled.
 * @async Side-effects: stops background timers; `prisma.$disconnect()` on exit path.
 * @throws {Error} Does not throw; logs Prisma disconnect failures and exits `1`.
 * @todo Add bounded wait for in-flight HTTP requests before `server.close`.
 */
function shutdown(signal: "SIGINT" | "SIGTERM") {
  stopAutosync?.();
  stopPatronStaleRefresh?.();
  void notificationRunner?.stop();
  void accountDeletionRunner?.stop();
  void mediaStoragePurgeRunner?.stop();
  void (async () => {
    try {
      await closeBullMqWorkers?.();
    } catch (e) {
      // eslint-disable-next-line no-console -- CLI entrypoint
      console.error("Relay: BullMQ worker close error", e);
    }
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
  })();
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
