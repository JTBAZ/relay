/**
 * @fileoverview Process entrypoint: loads env, wires Prisma-backed `createApp`, and starts HTTP + background workers when they run in-process.
 * @description Configures background jobs via `RELAY_JOB_BACKEND` (`memory` = in-process timers, `bullmq` = Redis workers + API-registered BullMQ repeat producers). When `RELAY_SPLIT_WORKER_PROCESS=1`, background work is omitted here — use `npm run worker`. When `memory` and in-process, starts Patreon incremental autosync, patron entitlement refresh, notification delivery, account deletion sweep, and media purge workers when enabled. Exits if `RELAY_TOKEN_ENCRYPTION_KEY` is missing; `bullmq` requires `REDIS_URL`.
 * @see src/server.ts `createApp` — primary Express app and route wiring
 * @see src/lib/db.ts Shared `PrismaClient` singleton
 * @see src/jsdoc-core-entities.ts Canonical `Artist`, `Gallery`, `SyncStatus` typedefs
 * @todo Bounded in-flight HTTP drain; BullMQ worker close uses `RELAY_BULLMQ_WORKER_CLOSE_GRACE_MS`.
 */

import { config as loadEnv } from "dotenv";
import type { Server } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Redis } from "ioredis";
import { prisma } from "./lib/db.js";
import {
  relayJobBackendFromEnv,
  relaySplitWorkerProcessFromEnv
} from "./jobs/relay-job-backend.js";
import { relayBullMqIoredisOptions } from "./jobs/bullmq-shared.js";
import {
  awaitRelayBullMqWorkersClose,
  type RelayBullMqWorkersClose
} from "./jobs/bullmq-shutdown.js";
import { registerRelayBullMqWorkers } from "./jobs/register-workers.js";
import { registerRelayBullMqRepeatSchedulers } from "./jobs/schedule-bullmq-repeat.js";
import {
  shouldScheduleIncrementalAutosyncFromEnv,
  startIncrementalAutosyncWorker
} from "./patreon/incremental-sync-worker.js";
import {
  patronEntitlementStaleRefreshBatchFromEnv,
  patronEntitlementStaleRefreshIntervalFromEnv,
  startPatronEntitlementStaleRefreshWorker
} from "./patron/patron-entitlement-stale-worker.js";
import { startNotificationDeliveryWorker } from "./patron/notification-delivery-worker.js";
import { startAccountDeletionWorker } from "./patron/account-deletion-worker.js";
import { startMediaStoragePurgeWorker } from "./storage/media-storage-purge-worker.js";
import { createLogger } from "./lib/logger.js";
import {
  captureRelaySentryException,
  initRelaySentry
} from "./lib/relay-sentry.js";
import { relayServerConfigFromEnv } from "./relay-server-env.js";
import { createApp } from "./server.js";

/**
 * @description Repo root: `dist/src/main.js` → two levels up; used for `.env` path resolution.
 * @const {string} projectRoot
 */
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
loadEnv({ path: join(projectRoot, ".env") });
initRelaySentry();

const log = createLogger({ name: "relay-api" });

/**
 * @description Log async failures that would otherwise terminate the process (Node 22+ strict mode).
 * @param {unknown} reason Rejection reason forwarded to stderr.
 */
process.on("unhandledRejection", (reason: unknown) => {
  log.error({ err: reason }, "Relay: unhandledRejection");
  captureRelaySentryException(reason);
});
/**
 * @description Fatal guard: log and exit non-zero on uncaught synchronous exceptions.
 * @param {Error} err Uncaught exception instance.
 */
process.on("uncaughtException", (err: Error) => {
  log.fatal({ err }, "Relay: uncaughtException");
  captureRelaySentryException(err);
  process.exit(1);
});

/** `memory` (default) uses in-process timers; `bullmq` uses Redis workers (see `RELAY_JOB_BACKEND` in `.env.example`). */
const jobBackend = relayJobBackendFromEnv();

/**
 * Dual-process pilot: API (`npm start`) only; workers run via `npm run worker` when `RELAY_SPLIT_WORKER_PROCESS=1`.
 */
const splitWorkerProcess = relaySplitWorkerProcessFromEnv();
const startInProcessBackgroundWork = !splitWorkerProcess;

if (!process.env.RELAY_TOKEN_ENCRYPTION_KEY?.trim()) {
  log.error(
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
if (
  jobBackend === "memory" &&
  startInProcessBackgroundWork &&
  shouldScheduleIncrementalAutosyncFromEnv()
) {
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
if (
  jobBackend === "memory" &&
  startInProcessBackgroundWork &&
  patronStaleRefreshMs > 0 &&
  prisma
) {
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
  jobBackend === "memory" && startInProcessBackgroundWork && prisma
  ? startNotificationDeliveryWorker(prisma, (msg, ctx) => {
      log.warn({ ...(ctx ?? {}), relayMsg: msg }, "Relay");
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
  jobBackend === "memory" && startInProcessBackgroundWork && prisma
  ? startAccountDeletionWorker(prisma, (msg, ctx) => {
      log.warn({ ...(ctx ?? {}), relayMsg: msg }, "Relay");
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
  jobBackend === "memory" && startInProcessBackgroundWork && prisma
  ? startMediaStoragePurgeWorker(prisma, (msg, ctx) => {
      log.warn({ ...(ctx ?? {}), relayMsg: msg }, "Relay");
    })
  : null;

/** BullMQ: shared Redis for repeat schedulers + in-process workers; quit on shutdown. */
let bullMqSharedRedis: Redis | undefined;
/** Repeatable job producers (`Queue`); API process only. */
let closeBullMqSchedulers: (() => Promise<void>) | undefined;
/** BullMQ worker closer when workers run in this process. */
let closeBullMqWorkers: RelayBullMqWorkersClose | undefined;

/** @description Bound HTTP server for Express `app`. */
let server: Server;

async function startHttpServer() {
  if (jobBackend === "bullmq") {
    bullMqSharedRedis = new Redis(relayBullMqIoredisOptions());
    try {
      closeBullMqSchedulers = await registerRelayBullMqRepeatSchedulers({
        redis: bullMqSharedRedis,
        prisma,
        log: (msg, ctx) => {
          log.warn({ ...(ctx ?? {}), relayMsg: msg }, "Relay");
        }
      });
    } catch (e) {
      log.error({ err: e }, "Relay: BullMQ repeatable scheduler registration failed");
      process.exit(1);
    }
    if (startInProcessBackgroundWork) {
      closeBullMqWorkers = registerRelayBullMqWorkers({
        prisma,
        tokenStore,
        patreonSyncService,
        syncHealthStore: patreonSyncHealthStore,
        campaignCreatorIndex: patreonCampaignCreatorIndex,
        encryption,
        patreonClient,
        fetchImpl,
        redisConnection: bullMqSharedRedis,
        log: (msg, ctx) => {
          log.warn({ ...(ctx ?? {}), relayMsg: msg }, "Relay");
        }
      });
    }
    log.warn(
      "Relay: RELAY_JOB_BACKEND=bullmq — API registered BullMQ repeat schedules; in-process timers remain off."
    );
  }

  server = app.listen(port, () => {
    log.info({ port }, "Relay API listening");
  });
}

void startHttpServer().catch((e: unknown) => {
  log.error({ err: e }, "Relay: HTTP server failed to start");
  process.exit(1);
});
if (splitWorkerProcess) {
  log.warn(
    jobBackend === "bullmq"
      ? "Relay: RELAY_SPLIT_WORKER_PROCESS=1 — BullMQ workers are not started in this process; run `npm run worker` alongside `npm start`."
      : "Relay: RELAY_SPLIT_WORKER_PROCESS=1 — background timers are not started in this process; run `npm run worker` alongside `npm start`."
  );
}

/**
 * @description Graceful shutdown: stop in-process timers, await delivery runners, close HTTP, drain BullMQ workers (grace + force), close scheduler queues, quit shared Redis, disconnect Prisma.
 * @param {"SIGINT" | "SIGTERM"} signal OS signal being handled.
 */
let relayShutdownStarted = false;

function relayBgLog(msg: string, ctx?: Record<string, unknown>) {
  log.warn({ ...(ctx ?? {}), relayMsg: msg }, "Relay");
}

async function awaitMemoryDeliveryRunnersStopped(): Promise<void> {
  const pending = [
    notificationRunner?.stop(),
    accountDeletionRunner?.stop(),
    mediaStoragePurgeRunner?.stop()
  ].filter((p): p is Promise<void> => p !== undefined);
  await Promise.all(pending);
}

function closeHttpServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function shutdown(signal: "SIGINT" | "SIGTERM") {
  if (relayShutdownStarted) return;
  relayShutdownStarted = true;

  stopAutosync?.();
  stopPatronStaleRefresh?.();

  void (async () => {
    let httpCloseErr: Error | undefined;

    try {
      await awaitMemoryDeliveryRunnersStopped();
    } catch (e) {
      log.error({ err: e }, "Relay: in-process runner stop error");
    }

    log.info({ signal }, "Relay: closing HTTP server");
    try {
      await closeHttpServer();
    } catch (e) {
      httpCloseErr = e instanceof Error ? e : new Error(String(e));
      log.error({ err: e }, "Relay: HTTP server close error");
    }

    try {
      await awaitRelayBullMqWorkersClose(closeBullMqWorkers, relayBgLog);
    } catch (e) {
      log.error({ err: e }, "Relay: BullMQ worker close error");
    }

    try {
      await closeBullMqSchedulers?.();
    } catch (e) {
      log.error({ err: e }, "Relay: BullMQ scheduler close error");
    }

    if (bullMqSharedRedis) {
      try {
        await bullMqSharedRedis.quit();
      } catch (e) {
        log.error({ err: e }, "Relay: shared Redis quit error");
      }
    }

    let prismaErr: unknown;
    try {
      await prisma.$disconnect();
    } catch (e) {
      prismaErr = e;
      log.error({ err: e }, "Relay: prisma.$disconnect error");
    }

    const code = httpCloseErr || prismaErr ? 1 : 0;
    process.exit(code);
  })();
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
