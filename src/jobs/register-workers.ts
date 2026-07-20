import type { PrismaClient } from "@prisma/client";
import { Worker } from "bullmq";
import { isInitialized, withScope } from "@sentry/node";
import { Redis } from "ioredis";
import type { PatreonTokenStore } from "../auth/token-store.js";
import type { TokenEncryption } from "../lib/crypto.js";
import type { PatreonClient } from "../auth/patreon-client.js";
import type { SubscribeStarCreatorAuthService } from "../auth/subscribestar-auth-service.js";
import type { SubscribeStarOAuthClient } from "../subscribestar/subscribestar-client.js";
import type { IngestService } from "../ingest/ingest-service.js";
import { runIncrementalAutosyncOnce } from "../patreon/incremental-sync-worker.js";
import {
  patronEntitlementStaleRefreshBatchFromEnv,
  runPatronEntitlementStaleRefreshOnce
} from "../patron/patron-entitlement-stale-worker.js";
import { processNotificationOutboxOnce } from "../patron/notification-delivery-worker.js";
import { processNotificationDigestOnce } from "../patron/notification-digest-worker.js";
import { processAccountDeletionSweepOnce } from "../patron/account-deletion-worker.js";
import { processMediaStoragePurgeSweepOnce } from "../storage/media-storage-purge-worker.js";
import {
  platformMetricDailyRollupLookbackDaysFromEnv,
  runPlatformMetricDailyRollupOnce
} from "../platform-metrics/platform-metric-daily-rollup-job.js";
import {
  externalMetricDailyRollupLookbackDaysFromEnv,
  runExternalMetricDailyRollupOnce
} from "../analytics/external-metric-rollup-job.js";
import { runPlatformInstanceRefreshSweepOnce } from "../analytics/platform-instance-refresh-sweep-job.js";
import { runPostingGoalNudgeOnce } from "../autopost/posting-goal-nudge-worker.js";
import { runScheduleSeriesReconcileOnce } from "../autopost/schedule-series-worker.js";
import { runDistributionRulesReconcileOnce } from "../autopost/distribution-rule-worker.js";
import { runDistributionScheduleReminderOnce } from "../distribution/distribution-schedule-reminder-worker.js";
import { runTipGrantOnce } from "../tips/tip-grant-worker.js";
import type { PatreonCampaignCreatorIndex } from "../patreon/patreon-campaign-creator-index.js";
import type { PatreonSyncHealthStoreAPI } from "../patreon/patreon-sync-health-store.js";
import type { PatreonSyncService } from "../patreon/patreon-sync-service.js";
import { runSubscribeStarGraphqlIngestAutosyncOnce } from "../subscribestar/subscribestar-graphql-ingest-autosync.js";
import {
  relayBullMqConcurrencyForQueue,
  relayBullMqIoredisOptions,
  relayBullMqWorkerRetentionOptions,
  relayBullMqWorkerStallRecoveryOptions
} from "./bullmq-shared.js";
import {
  RELAY_JOB_QUEUE_NAMES,
  type AccountDeletionSweepJobData,
  type MediaStoragePurgeJobData,
  type NotificationDeliveryJobData,
  type NotificationDigestJobData,
  type PatreonIncrementalAutosyncJobData,
  type PatronEntitlementStaleRefreshJobData,
  type PlatformMetricDailyRollupJobData,
  type ExternalMetricDailyRollupJobData,
  type PlatformInstanceRefreshSweepJobData,
  type PostingGoalNudgeJobData,
  type DistributionScheduleReminderJobData,
  type AutopostScheduleSeriesJobData,
  type AutopostDistributionRulesJobData,
  type TipGrantJobData,
  type BillCreditSettlementJobData,
  type RevealExpiryJobData,
  type CoachPlanCreditGrantJobData,
  type CoachPlanCreditExpiryJobData,
  type GoalCycleTrendResearchJobData,
  type GoalCycleOutcomeRefreshJobData,
  type RelayJobQueueName,
  type RelayJobTraceFields,
  type SubscribeStarGraphqlPostsIngestJobData
} from "./queue-names.js";
import { relayJobTraceIdForProcessing } from "./relay-job-trace.js";
import type { RelayBullMqWorkersClose } from "./bullmq-shutdown.js";
import { runSettlementOnce } from "../ledger/settlement-service.js";
import { getStripeClient } from "../billing/stripe-client.js";
import { runRevealExpiryOnce } from "../tips/reveal-expiry-worker.js";
import {
  runCoachPlanCreditExpiryOnce,
  runCoachPlanCreditGrantOnce
} from "../usage/coach-plan-credit-grant-worker.js";
import { processGoalCycleTrendResearchJob } from "../goal-cycle/trends/trend-research-worker.js";
import { runGoalCycleOutcomeRefreshOnce } from "../goal-cycle/outcomes/goal-cycle-outcome-worker.js";

export type RegisterRelayBullMqWorkersDeps = {
  prisma: PrismaClient | null;
  tokenStore: PatreonTokenStore;
  patreonSyncService: PatreonSyncService;
  syncHealthStore?: PatreonSyncHealthStoreAPI;
  campaignCreatorIndex?: PatreonCampaignCreatorIndex;
  encryption: TokenEncryption;
  patreonClient: PatreonClient;
  fetchImpl: typeof fetch;
  /** Canonical ingest (SubscribeStar GraphQL worker). */
  ingestService: IngestService;
  subscribeStarCreatorAuthService?: SubscribeStarCreatorAuthService;
  subscribeStarGraphqlIngestUrl?: string;
  /** Patron subscriber OAuth + GraphQL URL for entitlement stale refresh (optional). */
  subscribeStarPatronOAuthClient?: SubscribeStarOAuthClient;
  subscribeStarPatronGraphqlUrl?: string;
  log?: (msg: string, ctx?: Record<string, unknown>) => void;
  /**
   * When set, all workers share this client; shutdown will not call `quit` (caller owns lifecycle).
   */
  redisConnection?: Redis;
  /** Parse concurrency and `REDIS_URL` from this object (defaults to `process.env`). */
  env?: NodeJS.ProcessEnv;
};

function workerOptions(queueName: RelayJobQueueName, env: NodeJS.ProcessEnv, redis: Redis) {
  return {
    connection: redis,
    concurrency: relayBullMqConcurrencyForQueue(queueName, env),
    ...relayBullMqWorkerStallRecoveryOptions(env),
    ...relayBullMqWorkerRetentionOptions()
  };
}

function logBullMqJobStart(
  log: (msg: string, ctx?: Record<string, unknown>) => void,
  queue: RelayJobQueueName,
  job: { id?: string; data: RelayJobTraceFields },
  traceId: string
) {
  log("relay-bullmq: job start", {
    queue,
    traceId,
    jobId: job.id
  });
}

/** Emitted when a job is permanently failed (retries exhausted, stall limit, etc.). @see P1-queue-020 */
function logBullMqJobFailed(
  log: (msg: string, ctx?: Record<string, unknown>) => void,
  queue: RelayJobQueueName,
  job:
    | {
        id?: string;
        name?: string;
        data?: RelayJobTraceFields;
        attemptsMade?: number;
      }
    | undefined,
  error: Error,
  prev: string
) {
  const data = job?.data;
  log("relay-bullmq: job failed (final — see BullMQ failed set / removeOnFail)", {
    queue,
    jobId: job?.id,
    jobName: job?.name,
    ...(data !== undefined
      ? { traceId: relayJobTraceIdForProcessing(data) }
      : {}),
    attemptsMade: job?.attemptsMade,
    failedReason: error.message,
    prevState: prev
  });
}

type BullMqJobLike = { id?: string; data: RelayJobTraceFields };

/**
 * Runs a queue processor with start + complete logs (`traceId`, `jobId`) and optional Sentry scope (P2-obs-004).
 */
async function runRelayBullMqJob(
  log: (msg: string, ctx?: Record<string, unknown>) => void,
  queue: RelayJobQueueName,
  job: BullMqJobLike,
  work: () => Promise<void>
): Promise<void> {
  const traceId = relayJobTraceIdForProcessing(job.data);
  logBullMqJobStart(log, queue, job, traceId);
  const jobId = job.id;
  const exec = async () => {
    await work();
    log("relay-bullmq: job complete", { queue, traceId, jobId });
  };
  if (isInitialized()) {
    await withScope(async (scope) => {
      scope.setTag("relay.bullmq.queue", queue);
      scope.setTag("relay.trace_id", traceId);
      if (jobId !== undefined) {
        scope.setTag("relay.bullmq.job_id", String(jobId));
      }
      await exec();
    });
  } else {
    await exec();
  }
}

/**
 * Registers one BullMQ `Worker` per Relay job queue (PE-G, PE-H, PE-J, autosync, media purge).
 * Uses one shared ioredis instance; BullMQ opens dedicated blocking connections as needed.
 * Repeatable producers: {@link registerRelayBullMqRepeatSchedulers} in `schedule-bullmq-repeat.ts` (P1-queue-012; API process only).
 *
 * **Stalled jobs:** every worker uses {@link relayBullMqWorkerStallRecoveryOptions} (`stalledInterval`
 * default 30s, `maxStalledCount` default 1 — BullMQ v5 defaults). If the Node event loop is blocked longer
 * than the interval, or the worker crashes mid-job, the job is moved back to **wait** and retried; after
 * `maxStalledCount` stall recoveries it **fails** with `job stalled more than allowable limit`.
 * Tune with `RELAY_BULLMQ_STALLED_INTERVAL_MS` / `RELAY_BULLMQ_MAX_STALLED_COUNT` (see `.env.example` and Phase P1 runbook).
 *
 * **Final failures (P1-queue-020):** each worker listens for BullMQ **`failed`** (job may be `undefined` if
 * removed per `removeOnFail`). Logs include `failedReason`, `attemptsMade`, and `traceId` when job data exists.
 * **P2-obs-004:** each successful job logs `relay-bullmq: job complete` with `traceId` and `jobId`; when Sentry is
 * initialized, `withScope` sets tags `relay.bullmq.queue`, `relay.trace_id`, `relay.bullmq.job_id` for the run.
 */
export function registerRelayBullMqWorkers(
  deps: RegisterRelayBullMqWorkersDeps
): RelayBullMqWorkersClose {
  const env = deps.env ?? process.env;
  const sharedRedis =
    deps.redisConnection ?? new Redis(relayBullMqIoredisOptions(env));
  const ownsRedis = deps.redisConnection === undefined;
  const log = deps.log ?? (() => undefined);
  const workers: Worker[] = [];

  const mk = (queueName: RelayJobQueueName) =>
    workerOptions(queueName, env, sharedRedis);

  workers.push(
    new Worker<PatreonIncrementalAutosyncJobData>(
      RELAY_JOB_QUEUE_NAMES.PATREON_INCREMENTAL_AUTOSYNC,
      async (job) => {
        await runRelayBullMqJob(
          log,
          RELAY_JOB_QUEUE_NAMES.PATREON_INCREMENTAL_AUTOSYNC,
          job,
          async () => {
            await runIncrementalAutosyncOnce({
              tokenStore: deps.tokenStore,
              patreonSyncService: deps.patreonSyncService,
              syncHealthStore: deps.syncHealthStore,
              campaignCreatorIndex: deps.campaignCreatorIndex,
              prisma: deps.prisma ?? undefined,
              creatorId: job.data?.creatorId
            });
          }
        );
      },
      mk(RELAY_JOB_QUEUE_NAMES.PATREON_INCREMENTAL_AUTOSYNC)
    )
  );

  const subAuth = deps.subscribeStarCreatorAuthService;
  const subUrl = deps.subscribeStarGraphqlIngestUrl?.trim();
  if (subAuth && subUrl) {
    workers.push(
      new Worker<SubscribeStarGraphqlPostsIngestJobData>(
        RELAY_JOB_QUEUE_NAMES.SUBSCRIBESTAR_GRAPHQL_POSTS_INGEST,
        async (job) => {
          await runRelayBullMqJob(
            log,
            RELAY_JOB_QUEUE_NAMES.SUBSCRIBESTAR_GRAPHQL_POSTS_INGEST,
            job,
            async () => {
              await runSubscribeStarGraphqlIngestAutosyncOnce({
                prisma: deps.prisma,
                authService: subAuth,
                graphqlUrl: subUrl,
                ingestService: deps.ingestService,
                fetchImpl: deps.fetchImpl,
                creatorId: job.data?.creatorId,
                log
              });
            }
          );
        },
        mk(RELAY_JOB_QUEUE_NAMES.SUBSCRIBESTAR_GRAPHQL_POSTS_INGEST)
      )
    );
  }

  if (deps.prisma) {
    const prisma = deps.prisma;
    workers.push(
      new Worker<PatronEntitlementStaleRefreshJobData>(
        RELAY_JOB_QUEUE_NAMES.PATRON_ENTITLEMENT_STALE_REFRESH,
        async (job) => {
          await runRelayBullMqJob(
            log,
            RELAY_JOB_QUEUE_NAMES.PATRON_ENTITLEMENT_STALE_REFRESH,
            job,
            async () => {
              await runPatronEntitlementStaleRefreshOnce({
                prisma,
                encryption: deps.encryption,
                patreonClient: deps.patreonClient,
                fetchImpl: deps.fetchImpl,
                batchSize: patronEntitlementStaleRefreshBatchFromEnv(),
                patronMembershipId: job.data?.patronMembershipId,
                subscribeStarPatronOAuthClient: deps.subscribeStarPatronOAuthClient,
                subscribeStarPatronGraphqlUrl: deps.subscribeStarPatronGraphqlUrl
              });
            }
          );
        },
        mk(RELAY_JOB_QUEUE_NAMES.PATRON_ENTITLEMENT_STALE_REFRESH)
      )
    );

    workers.push(
      new Worker<NotificationDeliveryJobData>(
        RELAY_JOB_QUEUE_NAMES.NOTIFICATION_DELIVERY,
        async (job) => {
          await runRelayBullMqJob(
            log,
            RELAY_JOB_QUEUE_NAMES.NOTIFICATION_DELIVERY,
            job,
            async () => {
              await processNotificationOutboxOnce(prisma, {
                outboxEventId: job.data?.outboxEventId
              });
            }
          );
        },
        mk(RELAY_JOB_QUEUE_NAMES.NOTIFICATION_DELIVERY)
      )
    );

    workers.push(
      new Worker<NotificationDigestJobData>(
        RELAY_JOB_QUEUE_NAMES.NOTIFICATION_DIGEST,
        async (job) => {
          await runRelayBullMqJob(
            log,
            RELAY_JOB_QUEUE_NAMES.NOTIFICATION_DIGEST,
            job,
            async () => {
              await processNotificationDigestOnce(prisma, {
                batchSize: job.data?.patronMembershipId ? 1 : undefined
              });
            }
          );
        },
        mk(RELAY_JOB_QUEUE_NAMES.NOTIFICATION_DIGEST)
      )
    );

    workers.push(
      new Worker<AccountDeletionSweepJobData>(
        RELAY_JOB_QUEUE_NAMES.ACCOUNT_DELETION_SWEEP,
        async (job) => {
          await runRelayBullMqJob(
            log,
            RELAY_JOB_QUEUE_NAMES.ACCOUNT_DELETION_SWEEP,
            job,
            async () => {
              await processAccountDeletionSweepOnce(prisma, {
                accountDeletionId: job.data?.accountDeletionId
              });
            }
          );
        },
        mk(RELAY_JOB_QUEUE_NAMES.ACCOUNT_DELETION_SWEEP)
      )
    );

    workers.push(
      new Worker<MediaStoragePurgeJobData>(
        RELAY_JOB_QUEUE_NAMES.MEDIA_STORAGE_PURGE,
        async (job) => {
          await runRelayBullMqJob(
            log,
            RELAY_JOB_QUEUE_NAMES.MEDIA_STORAGE_PURGE,
            job,
            async () => {
              await processMediaStoragePurgeSweepOnce(prisma, {
                purgeQueueRowId: job.data?.purgeQueueRowId
              });
            }
          );
        },
        mk(RELAY_JOB_QUEUE_NAMES.MEDIA_STORAGE_PURGE)
      )
    );

    workers.push(
      new Worker<PlatformMetricDailyRollupJobData>(
        RELAY_JOB_QUEUE_NAMES.PLATFORM_METRIC_DAILY_ROLLUP,
        async (job) => {
          await runRelayBullMqJob(
            log,
            RELAY_JOB_QUEUE_NAMES.PLATFORM_METRIC_DAILY_ROLLUP,
            job,
            async () => {
              await runPlatformMetricDailyRollupOnce({
                prisma,
                dayUtc: job.data?.dayUtc as `${number}-${number}-${number}` | undefined,
                lookbackDays: platformMetricDailyRollupLookbackDaysFromEnv(env)
              });
            }
          );
        },
        mk(RELAY_JOB_QUEUE_NAMES.PLATFORM_METRIC_DAILY_ROLLUP)
      )
    );

    workers.push(
      new Worker<ExternalMetricDailyRollupJobData>(
        RELAY_JOB_QUEUE_NAMES.EXTERNAL_METRIC_DAILY_ROLLUP,
        async (job) => {
          await runRelayBullMqJob(
            log,
            RELAY_JOB_QUEUE_NAMES.EXTERNAL_METRIC_DAILY_ROLLUP,
            job,
            async () => {
              await runExternalMetricDailyRollupOnce({
                prisma,
                creatorId: job.data?.creatorId,
                lookbackDays: externalMetricDailyRollupLookbackDaysFromEnv(env)
              });
            }
          );
        },
        mk(RELAY_JOB_QUEUE_NAMES.EXTERNAL_METRIC_DAILY_ROLLUP)
      )
    );

    workers.push(
      new Worker<PlatformInstanceRefreshSweepJobData>(
        RELAY_JOB_QUEUE_NAMES.PLATFORM_INSTANCE_REFRESH_SWEEP,
        async (job) => {
          await runRelayBullMqJob(
            log,
            RELAY_JOB_QUEUE_NAMES.PLATFORM_INSTANCE_REFRESH_SWEEP,
            job,
            async () => {
              await runPlatformInstanceRefreshSweepOnce({
                prisma,
                creatorId: job.data?.creatorId,
                env
              });
            }
          );
        },
        mk(RELAY_JOB_QUEUE_NAMES.PLATFORM_INSTANCE_REFRESH_SWEEP)
      )
    );

    workers.push(
      new Worker<PostingGoalNudgeJobData>(
        RELAY_JOB_QUEUE_NAMES.POSTING_GOAL_NUDGE,
        async (job) => {
          await runRelayBullMqJob(
            log,
            RELAY_JOB_QUEUE_NAMES.POSTING_GOAL_NUDGE,
            job,
            async () => {
              await runPostingGoalNudgeOnce(prisma, {
                creatorId: job.data?.creatorId,
                log
              });
            }
          );
        },
        mk(RELAY_JOB_QUEUE_NAMES.POSTING_GOAL_NUDGE)
      )
    );

    workers.push(
      new Worker<DistributionScheduleReminderJobData>(
        RELAY_JOB_QUEUE_NAMES.DISTRIBUTION_SCHEDULE_REMINDER,
        async (job) => {
          await runRelayBullMqJob(
            log,
            RELAY_JOB_QUEUE_NAMES.DISTRIBUTION_SCHEDULE_REMINDER,
            job,
            async () => {
              await runDistributionScheduleReminderOnce(prisma, {
                variantId: job.data?.variantId,
                log
              });
            }
          );
        },
        mk(RELAY_JOB_QUEUE_NAMES.DISTRIBUTION_SCHEDULE_REMINDER)
      )
    );

    workers.push(
      new Worker<AutopostScheduleSeriesJobData>(
        RELAY_JOB_QUEUE_NAMES.AUTOPOST_SCHEDULE_SERIES,
        async (job) => {
          await runRelayBullMqJob(
            log,
            RELAY_JOB_QUEUE_NAMES.AUTOPOST_SCHEDULE_SERIES,
            job,
            async () => {
              await runScheduleSeriesReconcileOnce(prisma, {
                creatorId: job.data?.creatorId,
                log
              });
            }
          );
        },
        mk(RELAY_JOB_QUEUE_NAMES.AUTOPOST_SCHEDULE_SERIES)
      )
    );

    workers.push(
      new Worker<AutopostDistributionRulesJobData>(
        RELAY_JOB_QUEUE_NAMES.AUTOPOST_DISTRIBUTION_RULES,
        async (job) => {
          await runRelayBullMqJob(
            log,
            RELAY_JOB_QUEUE_NAMES.AUTOPOST_DISTRIBUTION_RULES,
            job,
            async () => {
              await runDistributionRulesReconcileOnce(prisma, {
                creatorId: job.data?.creatorId,
                log
              });
            }
          );
        },
        mk(RELAY_JOB_QUEUE_NAMES.AUTOPOST_DISTRIBUTION_RULES)
      )
    );

    workers.push(
      new Worker<TipGrantJobData>(
        RELAY_JOB_QUEUE_NAMES.TIP_GRANT,
        async (job) => {
          await runRelayBullMqJob(
            log,
            RELAY_JOB_QUEUE_NAMES.TIP_GRANT,
            job,
            async () => {
              await runTipGrantOnce(prisma, {
                accountId: job.data?.accountId,
                log
              });
            }
          );
        },
        mk(RELAY_JOB_QUEUE_NAMES.TIP_GRANT)
      )
    );

    workers.push(
      new Worker<BillCreditSettlementJobData>(
        RELAY_JOB_QUEUE_NAMES.BILL_CREDIT_SETTLEMENT,
        async (job) => {
          await runRelayBullMqJob(
            log,
            RELAY_JOB_QUEUE_NAMES.BILL_CREDIT_SETTLEMENT,
            job,
            async () => {
              const stripe = await getStripeClient({}, env);
              await runSettlementOnce({
                prisma,
                stripe,
                creatorId: job.data?.creatorId,
                env,
                log
              });
            }
          );
        },
        mk(RELAY_JOB_QUEUE_NAMES.BILL_CREDIT_SETTLEMENT)
      )
    );

    workers.push(
      new Worker<RevealExpiryJobData>(
        RELAY_JOB_QUEUE_NAMES.REVEAL_EXPIRY,
        async (job) => {
          await runRelayBullMqJob(
            log,
            RELAY_JOB_QUEUE_NAMES.REVEAL_EXPIRY,
            job,
            async () => {
              await runRevealExpiryOnce(prisma, { env, log });
            }
          );
        },
        mk(RELAY_JOB_QUEUE_NAMES.REVEAL_EXPIRY)
      )
    );

    workers.push(
      new Worker<CoachPlanCreditGrantJobData>(
        RELAY_JOB_QUEUE_NAMES.COACH_PLAN_CREDIT_GRANT,
        async (job) => {
          await runRelayBullMqJob(
            log,
            RELAY_JOB_QUEUE_NAMES.COACH_PLAN_CREDIT_GRANT,
            job,
            async () => {
              await runCoachPlanCreditGrantOnce(prisma, {
                creatorId: job.data?.creatorId,
                env,
                log
              });
            }
          );
        },
        mk(RELAY_JOB_QUEUE_NAMES.COACH_PLAN_CREDIT_GRANT)
      )
    );

    workers.push(
      new Worker<CoachPlanCreditExpiryJobData>(
        RELAY_JOB_QUEUE_NAMES.COACH_PLAN_CREDIT_EXPIRY,
        async (job) => {
          await runRelayBullMqJob(
            log,
            RELAY_JOB_QUEUE_NAMES.COACH_PLAN_CREDIT_EXPIRY,
            job,
            async () => {
              await runCoachPlanCreditExpiryOnce(prisma, {
                batchSize: job.data?.batchSize,
                env,
                log
              });
            }
          );
        },
        mk(RELAY_JOB_QUEUE_NAMES.COACH_PLAN_CREDIT_EXPIRY)
      )
    );

    workers.push(
      new Worker<GoalCycleTrendResearchJobData>(
        RELAY_JOB_QUEUE_NAMES.GOAL_CYCLE_TREND_RESEARCH,
        async (job) => {
          await runRelayBullMqJob(
            log,
            RELAY_JOB_QUEUE_NAMES.GOAL_CYCLE_TREND_RESEARCH,
            job,
            async () => {
              await processGoalCycleTrendResearchJob(prisma, job.data, { env, log });
            }
          );
        },
        mk(RELAY_JOB_QUEUE_NAMES.GOAL_CYCLE_TREND_RESEARCH)
      )
    );

    workers.push(
      new Worker<GoalCycleOutcomeRefreshJobData>(
        RELAY_JOB_QUEUE_NAMES.GOAL_CYCLE_OUTCOME_REFRESH,
        async (job) => {
          await runRelayBullMqJob(
            log,
            RELAY_JOB_QUEUE_NAMES.GOAL_CYCLE_OUTCOME_REFRESH,
            job,
            async () => {
              await runGoalCycleOutcomeRefreshOnce(prisma, {
                creatorId: job.data?.creatorId,
                cycleId: job.data?.cycleId,
                batchSize: job.data?.batchSize,
                env,
                log
              });
            }
          );
        },
        mk(RELAY_JOB_QUEUE_NAMES.GOAL_CYCLE_OUTCOME_REFRESH)
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
    w.on("failed", (job, error, prev) => {
      logBullMqJobFailed(log, w.name as RelayJobQueueName, job, error, prev);
    });
  }

  return async (opts?: { force?: boolean }) => {
    const force = opts?.force === true;
    await Promise.all(workers.map((w) => w.close(force)));
    if (ownsRedis) {
      await sharedRedis.quit();
    }
  };
}
