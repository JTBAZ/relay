/**
 * @fileoverview Dedicated worker process: background jobs only (no HTTP).
 * @description Use with `RELAY_SPLIT_WORKER_PROCESS=1` on the API (`npm start`); run this entry as `npm run worker`.
 * For `--smoke`, wires workers then exits (used by tests; requires same `.env` as a normal boot e.g. `RELAY_JOB_BACKEND=memory`).
 * @see src/main.ts API process
 * @see docs/pilot-build-plan.md Phase P1-queue-011
 */

import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { prisma } from "./lib/db.js";
import {
  relayJobBackendFromEnv,
  relaySplitWorkerProcessFromEnv
} from "./jobs/relay-job-backend.js";
import {
  awaitRelayBullMqWorkersClose,
  type RelayBullMqWorkersClose
} from "./jobs/bullmq-shutdown.js";
import { registerRelayBullMqWorkers } from "./jobs/register-workers.js";
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
import {
  subscribeStarGraphqlIngestAutosyncRepeatEveryMsFromEnv,
  startSubscribeStarGraphqlIngestAutosyncTimer
} from "./subscribestar/subscribestar-graphql-ingest-autosync.js";
import { createLogger } from "./lib/logger.js";
import {
  captureRelaySentryException,
  initRelaySentry
} from "./lib/relay-sentry.js";
import { relayServerConfigFromEnv } from "./relay-server-env.js";
import { createApp } from "./server.js";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
loadEnv({ path: join(projectRoot, ".env") });

const log = createLogger({ name: "relay-worker" });

process.on("unhandledRejection", (reason: unknown) => {
  log.error({ err: reason }, "Relay worker: unhandledRejection");
  captureRelaySentryException(reason);
});
process.on("uncaughtException", (err: Error) => {
  log.fatal({ err }, "Relay worker: uncaughtException");
  captureRelaySentryException(err);
  process.exit(1);
});

export type RunRelayWorkerProcessOptions = {
  /** Exit after wiring workers (for CI smoke tests). */
  smoke?: boolean;
};

function isMainCliModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

/**
 * Starts background workers for the current `RELAY_JOB_BACKEND` (same rules as [src/main.ts](../main.ts), without HTTP).
 */
export async function runRelayWorkerProcess(
  options: RunRelayWorkerProcessOptions = {}
): Promise<void> {
  const { smoke = false } = options;

  if (!process.env.RELAY_TOKEN_ENCRYPTION_KEY?.trim()) {
    log.error(
      `Relay worker: missing RELAY_TOKEN_ENCRYPTION_KEY.\n` +
        `  Add it to: ${join(projectRoot, ".env")}`
    );
    process.exit(1);
  }

  if (relaySplitWorkerProcessFromEnv()) {
    log.warn(
      "Relay worker: RELAY_SPLIT_WORKER_PROCESS=1 is for the API process only; this entry always runs workers."
    );
  }

  const jobBackend = relayJobBackendFromEnv();
  const serverConfig = relayServerConfigFromEnv();
  const fetchImpl = serverConfig.fetch_impl ?? globalThis.fetch;

  const {
    tokenStore,
    patreonSyncService,
    patreonSyncHealthStore,
    patreonCampaignCreatorIndex,
    encryption,
    patreonClient,
    ingestService,
    subscribeStarCreatorAuthService,
    subscribeStarGraphqlIngestUrl
  } = createApp({
    ...serverConfig,
    prisma
  });

  let stopAutosync: (() => void) | undefined;
  if (jobBackend === "memory" && shouldScheduleIncrementalAutosyncFromEnv()) {
    stopAutosync = startIncrementalAutosyncWorker({
      tokenStore,
      patreonSyncService,
      syncHealthStore: patreonSyncHealthStore,
      campaignCreatorIndex: patreonCampaignCreatorIndex,
      prisma
    });
  }

  let stopSubscribeStarGraphqlAutosync: (() => void) | undefined;
  const subRepeatMsWorker = subscribeStarGraphqlIngestAutosyncRepeatEveryMsFromEnv();
  if (
    jobBackend === "memory" &&
    subRepeatMsWorker !== null &&
    subscribeStarCreatorAuthService &&
    subscribeStarGraphqlIngestUrl?.trim()
  ) {
    stopSubscribeStarGraphqlAutosync = startSubscribeStarGraphqlIngestAutosyncTimer({
      intervalMs: subRepeatMsWorker,
      prisma,
      authService: subscribeStarCreatorAuthService,
      graphqlUrl: subscribeStarGraphqlIngestUrl.trim(),
      ingestService,
      fetchImpl,
      log: (msg, ctx) => {
        log.warn({ ...(ctx ?? {}), relayMsg: msg }, "Relay worker");
      }
    });
  }

  const patronStaleRefreshMs = patronEntitlementStaleRefreshIntervalFromEnv();
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

  const notificationRunner =
    jobBackend === "memory" && prisma
      ? startNotificationDeliveryWorker(prisma, (msg, ctx) => {
          log.warn({ ...(ctx ?? {}), relayMsg: msg }, "Relay worker");
        })
      : null;

  const accountDeletionRunner =
    jobBackend === "memory" && prisma
      ? startAccountDeletionWorker(prisma, (msg, ctx) => {
          log.warn({ ...(ctx ?? {}), relayMsg: msg }, "Relay worker");
        })
      : null;

  const mediaStoragePurgeRunner =
    jobBackend === "memory" && prisma
      ? startMediaStoragePurgeWorker(prisma, (msg, ctx) => {
          log.warn({ ...(ctx ?? {}), relayMsg: msg }, "Relay worker");
        })
      : null;

  let closeBullMqWorkers: RelayBullMqWorkersClose | undefined;
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
      ingestService,
      subscribeStarCreatorAuthService,
      subscribeStarGraphqlIngestUrl,
      log: (msg, ctx) => {
        log.warn({ ...(ctx ?? {}), relayMsg: msg }, "Relay worker");
      }
    });
    log.warn(
      "Relay worker: RELAY_JOB_BACKEND=bullmq — consuming queues; repeat schedules are owned by the API process."
    );
  }

  log.info({ jobBackend }, "Relay worker process running (no HTTP)");

  function relayBgLog(msg: string, ctx?: Record<string, unknown>) {
    log.warn({ ...(ctx ?? {}), relayMsg: msg }, "Relay worker");
  }

  async function awaitMemoryDeliveryRunnersStopped(): Promise<void> {
    const pending = [
      notificationRunner?.stop(),
      accountDeletionRunner?.stop(),
      mediaStoragePurgeRunner?.stop()
    ].filter((p): p is Promise<void> => p !== undefined);
    await Promise.all(pending);
  }

  let shuttingDown = false;
  const shutdown = async (signal: "SIGINT" | "SIGTERM" | "smoke") => {
    if (shuttingDown) return;
    shuttingDown = true;
    let hadError = false;
    stopAutosync?.();
    stopSubscribeStarGraphqlAutosync?.();
    stopPatronStaleRefresh?.();

    try {
      await awaitMemoryDeliveryRunnersStopped();
    } catch (e) {
      hadError = true;
      log.error({ err: e }, "Relay worker: in-process runner stop error");
    }

    try {
      await awaitRelayBullMqWorkersClose(closeBullMqWorkers, relayBgLog);
    } catch (e) {
      hadError = true;
      log.error({ err: e }, "Relay worker: BullMQ worker close error");
    }

    log.info({ signal }, "Relay worker: disconnecting Prisma");
    try {
      await prisma.$disconnect();
    } catch (e) {
      hadError = true;
      log.error({ err: e }, "Relay worker: prisma.$disconnect error");
    }
    process.exit(hadError ? 1 : 0);
  };

  if (smoke) {
    await shutdown("smoke");
    return;
  }

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

const smokeFlag = process.argv.includes("--smoke");
if (isMainCliModule()) {
  runRelayWorkerProcess({ smoke: smokeFlag }).catch((e: unknown) => {
    log.error({ err: e }, "Relay worker: fatal");
    process.exit(1);
  });
}
