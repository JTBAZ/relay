/**
 * Registers BullMQ repeatable producers on the API process (`RELAY_JOB_BACKEND=bullmq`).
 * Intervals mirror in-process worker env semantics (Phase P1-queue-012).
 */

import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import type { PrismaClient } from "@prisma/client";
import { RELAY_BULLMQ_DEFAULT_JOB_OPTIONS } from "./bullmq-shared.js";
import {
  RELAY_JOB_QUEUE_NAMES,
  type AccountDeletionSweepJobData,
  type MediaStoragePurgeJobData,
  type NotificationDeliveryJobData,
  type PatreonIncrementalAutosyncJobData,
  type PatronEntitlementStaleRefreshJobData,
  type SubscribeStarGraphqlPostsIngestJobData
} from "./queue-names.js";
import { incrementalAutosyncRepeatEveryMsFromEnv } from "../patreon/incremental-sync-worker.js";
import { patronEntitlementStaleRefreshIntervalFromEnv } from "../patron/patron-entitlement-stale-worker.js";
import { notificationDeliveryRepeatEveryMsFromEnv } from "../patron/notification-delivery-worker.js";
import { accountDeletionSweepRepeatEveryMsFromEnv } from "../patron/account-deletion-worker.js";
import { mediaStoragePurgeSweepRepeatEveryMsFromEnv } from "../storage/media-storage-purge-worker.js";
import { subscribeStarGraphqlIngestAutosyncRepeatEveryMsFromEnv } from "../subscribestar/subscribestar-graphql-ingest-autosync.js";

const REPEAT_JOB_NAME = "relay-tick";

function repeatJobId(queueLiteral: string): string {
  return `relay-repeat:${queueLiteral}`;
}

async function replaceRepeatEvery(
  queue: Queue,
  everyMs: number,
  /**
   * Repeat template. Omit `traceId` so each execution gets a fresh `job_<uuid>` in the worker
   * ([relay-job-trace.ts](./relay-job-trace.ts)).
   */
  data: Record<string, unknown>,
  log?: (msg: string, ctx?: Record<string, unknown>) => void
): Promise<void> {
  const existing = await queue.getRepeatableJobs();
  for (const job of existing) {
    if (job.name === REPEAT_JOB_NAME) {
      await queue.removeRepeatableByKey(job.key);
    }
  }
  await queue.add(REPEAT_JOB_NAME, data, {
    jobId: repeatJobId(queue.name),
    repeat: { every: everyMs },
    ...RELAY_BULLMQ_DEFAULT_JOB_OPTIONS
  });
  log?.("relay-bullmq: repeat scheduled", { queue: queue.name, everyMs });
}

export type RegisterRelayBullMqRepeatSchedulersArgs = {
  redis: Redis;
  prisma: PrismaClient | null;
  env?: NodeJS.ProcessEnv;
  log?: (msg: string, ctx?: Record<string, unknown>) => void;
};

/**
 * Ensures one `relay-tick` repeatable job per enabled queue. Call from the API only (not `src/worker.ts`).
 */
export async function registerRelayBullMqRepeatSchedulers(
  args: RegisterRelayBullMqRepeatSchedulersArgs
): Promise<() => Promise<void>> {
  const env = args.env ?? process.env;
  const log = args.log;
  const queues: Queue[] = [];

  const openQueue = (name: string) => {
    const q = new Queue(name, {
      connection: args.redis,
      defaultJobOptions: RELAY_BULLMQ_DEFAULT_JOB_OPTIONS
    });
    queues.push(q);
    return q;
  };

  const autosyncEvery = incrementalAutosyncRepeatEveryMsFromEnv(env);
  if (autosyncEvery !== null) {
    await replaceRepeatEvery(
      openQueue(RELAY_JOB_QUEUE_NAMES.PATREON_INCREMENTAL_AUTOSYNC),
      autosyncEvery,
      {} as PatreonIncrementalAutosyncJobData,
      log
    );
  }

  const subStarSsEvery = subscribeStarGraphqlIngestAutosyncRepeatEveryMsFromEnv(env);
  if (subStarSsEvery !== null) {
    await replaceRepeatEvery(
      openQueue(RELAY_JOB_QUEUE_NAMES.SUBSCRIBESTAR_GRAPHQL_POSTS_INGEST),
      subStarSsEvery,
      {} as SubscribeStarGraphqlPostsIngestJobData,
      log
    );
  }

  if (args.prisma) {
    const staleEvery = patronEntitlementStaleRefreshIntervalFromEnv(env);
    if (staleEvery > 0) {
      await replaceRepeatEvery(
        openQueue(RELAY_JOB_QUEUE_NAMES.PATRON_ENTITLEMENT_STALE_REFRESH),
        staleEvery,
        {} as PatronEntitlementStaleRefreshJobData,
        log
      );
    }

    const notifEvery = notificationDeliveryRepeatEveryMsFromEnv(env);
    if (notifEvery !== null) {
      await replaceRepeatEvery(
        openQueue(RELAY_JOB_QUEUE_NAMES.NOTIFICATION_DELIVERY),
        notifEvery,
        {} as NotificationDeliveryJobData,
        log
      );
    }

    const acctEvery = accountDeletionSweepRepeatEveryMsFromEnv(env);
    if (acctEvery !== null) {
      await replaceRepeatEvery(
        openQueue(RELAY_JOB_QUEUE_NAMES.ACCOUNT_DELETION_SWEEP),
        acctEvery,
        {} as AccountDeletionSweepJobData,
        log
      );
    }

    const purgeEvery = mediaStoragePurgeSweepRepeatEveryMsFromEnv(env);
    if (purgeEvery !== null) {
      await replaceRepeatEvery(
        openQueue(RELAY_JOB_QUEUE_NAMES.MEDIA_STORAGE_PURGE),
        purgeEvery,
        {} as MediaStoragePurgeJobData,
        log
      );
    }
  }

  return async () => {
    await Promise.all(queues.map((q) => q.close()));
  };
}
