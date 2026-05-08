import type { PrismaClient } from "@prisma/client";
import { Worker } from "bullmq";
import type { PatreonTokenStore } from "../auth/token-store.js";
import { getRedisConnectionOptions } from "../lib/redis.js";
import type { TokenEncryption } from "../lib/crypto.js";
import type { PatreonClient } from "../auth/patreon-client.js";
import { runIncrementalAutosyncOnce } from "../patreon/incremental-sync-worker.js";
import {
  patronEntitlementStaleRefreshBatchFromEnv,
  runPatronEntitlementStaleRefreshOnce
} from "../patron/patron-entitlement-stale-worker.js";
import { processNotificationOutboxOnce } from "../patron/notification-delivery-worker.js";
import { processAccountDeletionSweepOnce } from "../patron/account-deletion-worker.js";
import { processMediaStoragePurgeSweepOnce } from "../storage/media-storage-purge-worker.js";
import type { PatreonCampaignCreatorIndex } from "../patreon/patreon-campaign-creator-index.js";
import type { PatreonSyncHealthStoreAPI } from "../patreon/patreon-sync-health-store.js";
import type { PatreonSyncService } from "../patreon/patreon-sync-service.js";
import {
  RELAY_JOB_QUEUE_NAMES,
  type AccountDeletionSweepJobData,
  type MediaStoragePurgeJobData,
  type NotificationDeliveryJobData,
  type PatreonIncrementalAutosyncJobData,
  type PatronEntitlementStaleRefreshJobData
} from "./queue-names.js";

export type RegisterRelayBullMqWorkersDeps = {
  prisma: PrismaClient | null;
  tokenStore: PatreonTokenStore;
  patreonSyncService: PatreonSyncService;
  syncHealthStore?: PatreonSyncHealthStoreAPI;
  campaignCreatorIndex?: PatreonCampaignCreatorIndex;
  encryption: TokenEncryption;
  patreonClient: PatreonClient;
  fetchImpl: typeof fetch;
  log?: (msg: string, ctx?: Record<string, unknown>) => void;
};

/** BullMQ + ioredis: blocking clients must not retry indefinitely. */
function bullMqConnectionOptions() {
  return {
    ...getRedisConnectionOptions(),
    maxRetriesPerRequest: null
  };
}

/**
 * Registers one BullMQ `Worker` per Relay job queue (PE-G, PE-H, PE-J, autosync, media purge).
 * Repeatable producers land in P1-queue-012.
 */
export function registerRelayBullMqWorkers(
  deps: RegisterRelayBullMqWorkersDeps
): () => Promise<void> {
  const connection = bullMqConnectionOptions();
  const log = deps.log ?? (() => undefined);
  const workers: Worker[] = [];

  workers.push(
      new Worker<PatreonIncrementalAutosyncJobData>(
        RELAY_JOB_QUEUE_NAMES.PATREON_INCREMENTAL_AUTOSYNC,
        async (job) => {
          await runIncrementalAutosyncOnce({
            tokenStore: deps.tokenStore,
            patreonSyncService: deps.patreonSyncService,
            syncHealthStore: deps.syncHealthStore,
            campaignCreatorIndex: deps.campaignCreatorIndex,
            prisma: deps.prisma ?? undefined,
            creatorId: job.data?.creatorId
          });
        },
        { connection }
      )
    );

  if (deps.prisma) {
    const prisma = deps.prisma;
    workers.push(
      new Worker<PatronEntitlementStaleRefreshJobData>(
        RELAY_JOB_QUEUE_NAMES.PATRON_ENTITLEMENT_STALE_REFRESH,
        async (job) => {
          await runPatronEntitlementStaleRefreshOnce({
            prisma,
            encryption: deps.encryption,
            patreonClient: deps.patreonClient,
            fetchImpl: deps.fetchImpl,
            batchSize: patronEntitlementStaleRefreshBatchFromEnv(),
            patronMembershipId: job.data?.patronMembershipId
          });
        },
        { connection }
      )
    );

    workers.push(
      new Worker<NotificationDeliveryJobData>(
        RELAY_JOB_QUEUE_NAMES.NOTIFICATION_DELIVERY,
        async (job) => {
          await processNotificationOutboxOnce(prisma, {
            outboxEventId: job.data?.outboxEventId
          });
        },
        { connection }
      )
    );

    workers.push(
      new Worker<AccountDeletionSweepJobData>(
        RELAY_JOB_QUEUE_NAMES.ACCOUNT_DELETION_SWEEP,
        async (job) => {
          await processAccountDeletionSweepOnce(prisma, {
            accountDeletionId: job.data?.accountDeletionId
          });
        },
        { connection }
      )
    );

    workers.push(
      new Worker<MediaStoragePurgeJobData>(
        RELAY_JOB_QUEUE_NAMES.MEDIA_STORAGE_PURGE,
        async (job) => {
          await processMediaStoragePurgeSweepOnce(prisma, {
            purgeQueueRowId: job.data?.purgeQueueRowId
          });
        },
        { connection }
      )
    );
  }

  for (const w of workers) {
    w.on("ready", () => {
      log("relay-bullmq: worker ready", { queue: w.name });
    });
    w.on("error", (err: Error) => {
      log("relay-bullmq: worker error", {
        queue: w.name,
        error: err.message
      });
    });
  }

  return async () => {
    await Promise.all(workers.map((w) => w.close()));
  };
}
