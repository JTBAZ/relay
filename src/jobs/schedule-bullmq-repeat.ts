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
  type GoalCycleOutcomeRefreshJobData,
  type SubscribeStarGraphqlPostsIngestJobData
} from "./queue-names.js";
import { incrementalAutosyncRepeatEveryMsFromEnv } from "../patreon/incremental-sync-worker.js";
import { patronEntitlementStaleRefreshIntervalFromEnv } from "../patron/patron-entitlement-stale-worker.js";
import { notificationDeliveryRepeatEveryMsFromEnv } from "../patron/notification-delivery-worker.js";
import { notificationDigestSweepRepeatEveryMsFromEnv } from "../patron/notification-digest-worker.js";
import { accountDeletionSweepRepeatEveryMsFromEnv } from "../patron/account-deletion-worker.js";
import { mediaStoragePurgeSweepRepeatEveryMsFromEnv } from "../storage/media-storage-purge-worker.js";
import {
  platformMetricDailyRollupIntervalFromEnv
} from "../platform-metrics/platform-metric-daily-rollup-job.js";
import {
  externalMetricDailyRollupIntervalFromEnv
} from "../analytics/external-metric-rollup-job.js";
import {
  platformInstanceRefreshSweepIntervalFromEnv
} from "../analytics/platform-instance-refresh-sweep-job.js";
import { postingGoalNudgeRepeatEveryMsFromEnv } from "../autopost/posting-goal-nudge-worker.js";
import { scheduleSeriesRepeatEveryMsFromEnv } from "../autopost/schedule-series-worker.js";
import { distributionRulesRepeatEveryMsFromEnv } from "../autopost/distribution-rule-worker.js";
import { distributionScheduleReminderRepeatEveryMsFromEnv } from "../distribution/distribution-schedule-reminder-worker.js";
import { tipGrantRepeatEveryMsFromEnv } from "../tips/tip-grant-worker.js";
import { settlementRepeatEveryMsFromEnv } from "../ledger/settlement-service.js";
import { revealExpiryRepeatEveryMsFromEnv } from "../tips/reveal-expiry-worker.js";
import {
  coachPlanCreditExpiryRepeatEveryMsFromEnv,
  coachPlanCreditGrantRepeatEveryMsFromEnv
} from "../usage/coach-plan-credit-grant-worker.js";
import { goalCycleOutcomeRefreshRepeatEveryMsFromEnv } from "../goal-cycle/outcomes/goal-cycle-outcome-worker.js";
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

    const digestEvery = notificationDigestSweepRepeatEveryMsFromEnv(env);
    if (digestEvery !== null) {
      await replaceRepeatEvery(
        openQueue(RELAY_JOB_QUEUE_NAMES.NOTIFICATION_DIGEST),
        digestEvery,
        {} as NotificationDigestJobData,
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

    const rollupEvery = platformMetricDailyRollupIntervalFromEnv(env);
    if (rollupEvery !== null) {
      await replaceRepeatEvery(
        openQueue(RELAY_JOB_QUEUE_NAMES.PLATFORM_METRIC_DAILY_ROLLUP),
        rollupEvery,
        {} as PlatformMetricDailyRollupJobData,
        log
      );
    }

    const externalRollupEvery = externalMetricDailyRollupIntervalFromEnv(env);
    if (externalRollupEvery !== null) {
      await replaceRepeatEvery(
        openQueue(RELAY_JOB_QUEUE_NAMES.EXTERNAL_METRIC_DAILY_ROLLUP),
        externalRollupEvery,
        {} as ExternalMetricDailyRollupJobData,
        log
      );
    }

    const instanceRefreshEvery = platformInstanceRefreshSweepIntervalFromEnv(env);
    if (instanceRefreshEvery !== null) {
      await replaceRepeatEvery(
        openQueue(RELAY_JOB_QUEUE_NAMES.PLATFORM_INSTANCE_REFRESH_SWEEP),
        instanceRefreshEvery,
        {} as PlatformInstanceRefreshSweepJobData,
        log
      );
    }

    const postingGoalEvery = postingGoalNudgeRepeatEveryMsFromEnv(env);
    if (postingGoalEvery !== null) {
      await replaceRepeatEvery(
        openQueue(RELAY_JOB_QUEUE_NAMES.POSTING_GOAL_NUDGE),
        postingGoalEvery,
        {} as PostingGoalNudgeJobData,
        log
      );
    }

    const scheduleReminderEvery = distributionScheduleReminderRepeatEveryMsFromEnv(env);
    if (scheduleReminderEvery !== null) {
      await replaceRepeatEvery(
        openQueue(RELAY_JOB_QUEUE_NAMES.DISTRIBUTION_SCHEDULE_REMINDER),
        scheduleReminderEvery,
        {} as DistributionScheduleReminderJobData,
        log
      );
    }

    const scheduleSeriesEvery = scheduleSeriesRepeatEveryMsFromEnv(env);
    if (scheduleSeriesEvery !== null) {
      await replaceRepeatEvery(
        openQueue(RELAY_JOB_QUEUE_NAMES.AUTOPOST_SCHEDULE_SERIES),
        scheduleSeriesEvery,
        {} as AutopostScheduleSeriesJobData,
        log
      );
    }

    const distributionRulesEvery = distributionRulesRepeatEveryMsFromEnv(env);
    if (distributionRulesEvery !== null) {
      await replaceRepeatEvery(
        openQueue(RELAY_JOB_QUEUE_NAMES.AUTOPOST_DISTRIBUTION_RULES),
        distributionRulesEvery,
        {} as AutopostDistributionRulesJobData,
        log
      );
    }

    const tipGrantEvery = tipGrantRepeatEveryMsFromEnv(env);
    if (tipGrantEvery !== null) {
      await replaceRepeatEvery(
        openQueue(RELAY_JOB_QUEUE_NAMES.TIP_GRANT),
        tipGrantEvery,
        {} as TipGrantJobData,
        log
      );
    }

    const settlementEvery = settlementRepeatEveryMsFromEnv(env);
    if (settlementEvery !== null) {
      await replaceRepeatEvery(
        openQueue(RELAY_JOB_QUEUE_NAMES.BILL_CREDIT_SETTLEMENT),
        settlementEvery,
        {} as BillCreditSettlementJobData,
        log
      );
    }

    const revealExpiryEvery = revealExpiryRepeatEveryMsFromEnv(env);
    if (revealExpiryEvery !== null) {
      await replaceRepeatEvery(
        openQueue(RELAY_JOB_QUEUE_NAMES.REVEAL_EXPIRY),
        revealExpiryEvery,
        {} as RevealExpiryJobData,
        log
      );
    }

    const coachPlanGrantEvery = coachPlanCreditGrantRepeatEveryMsFromEnv(env);
    if (coachPlanGrantEvery !== null) {
      await replaceRepeatEvery(
        openQueue(RELAY_JOB_QUEUE_NAMES.COACH_PLAN_CREDIT_GRANT),
        coachPlanGrantEvery,
        {} as CoachPlanCreditGrantJobData,
        log
      );
    }

    const coachPlanExpiryEvery = coachPlanCreditExpiryRepeatEveryMsFromEnv(env);
    if (coachPlanExpiryEvery !== null) {
      await replaceRepeatEvery(
        openQueue(RELAY_JOB_QUEUE_NAMES.COACH_PLAN_CREDIT_EXPIRY),
        coachPlanExpiryEvery,
        {} as CoachPlanCreditExpiryJobData,
        log
      );
    }

    const outcomeRefreshEvery = goalCycleOutcomeRefreshRepeatEveryMsFromEnv(env);
    if (outcomeRefreshEvery !== null) {
      await replaceRepeatEvery(
        openQueue(RELAY_JOB_QUEUE_NAMES.GOAL_CYCLE_OUTCOME_REFRESH),
        outcomeRefreshEvery,
        {} as GoalCycleOutcomeRefreshJobData,
        log
      );
    }
  }

  return async () => {
    await Promise.all(queues.map((q) => q.close()));
  };
}
