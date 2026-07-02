/**
 * BullMQ queue names and job `data` shapes for Relay background work (Phase P1).
 * Import from job producers/workers only — not wired into HTTP routes.
 */

/** Stable queue name literals (BullMQ `Queue`/`Worker` name). */
export const RELAY_JOB_QUEUE_NAMES = {
  PATREON_INCREMENTAL_AUTOSYNC: "patreon_incremental_autosync",
  SUBSCRIBESTAR_GRAPHQL_POSTS_INGEST: "subscribestar_graphql_posts_ingest",
  PATRON_ENTITLEMENT_STALE_REFRESH: "patron_entitlement_stale_refresh",
  NOTIFICATION_DELIVERY: "notification_delivery",
  ACCOUNT_DELETION_SWEEP: "account_deletion_sweep",
  MEDIA_STORAGE_PURGE: "media_storage_purge",
  PLATFORM_METRIC_DAILY_ROLLUP: "platform_metric_daily_rollup",
  EXTERNAL_METRIC_DAILY_ROLLUP: "external_metric_daily_rollup",
  PLATFORM_INSTANCE_REFRESH_SWEEP: "platform_instance_refresh_sweep",
  NOTIFICATION_DIGEST: "notification_digest",
  POSTING_GOAL_NUDGE: "posting_goal_nudge"
} as const;

export type RelayJobQueueName =
  (typeof RELAY_JOB_QUEUE_NAMES)[keyof typeof RELAY_JOB_QUEUE_NAMES];

/** All queues in registration order (repeatable schedulers, dashboards). */
export const ALL_RELAY_JOB_QUEUE_NAMES: readonly RelayJobQueueName[] = [
  RELAY_JOB_QUEUE_NAMES.PATREON_INCREMENTAL_AUTOSYNC,
  RELAY_JOB_QUEUE_NAMES.SUBSCRIBESTAR_GRAPHQL_POSTS_INGEST,
  RELAY_JOB_QUEUE_NAMES.PATRON_ENTITLEMENT_STALE_REFRESH,
  RELAY_JOB_QUEUE_NAMES.NOTIFICATION_DELIVERY,
  RELAY_JOB_QUEUE_NAMES.ACCOUNT_DELETION_SWEEP,
  RELAY_JOB_QUEUE_NAMES.MEDIA_STORAGE_PURGE,
  RELAY_JOB_QUEUE_NAMES.PLATFORM_METRIC_DAILY_ROLLUP,
  RELAY_JOB_QUEUE_NAMES.EXTERNAL_METRIC_DAILY_ROLLUP,
  RELAY_JOB_QUEUE_NAMES.PLATFORM_INSTANCE_REFRESH_SWEEP,
  RELAY_JOB_QUEUE_NAMES.NOTIFICATION_DIGEST,
  RELAY_JOB_QUEUE_NAMES.POSTING_GOAL_NUDGE
];

export function isRelayJobQueueName(value: string): value is RelayJobQueueName {
  return (ALL_RELAY_JOB_QUEUE_NAMES as readonly string[]).includes(value);
}

/** Correlation for logs / tracing (see P1-queue-014). */
export type RelayJobTraceFields = {
  traceId?: string;
};

/** Scheduled incremental Patreon autosync cycle (see incremental-sync-worker). */
export type PatreonIncrementalAutosyncJobData = RelayJobTraceFields & {
  /** Optional: restrict cycle to one Relay creator id (ops / replay). */
  creatorId?: string;
};

/** SubscribeStar GraphQL posts → ingest autosync cycle (see subscribestar-graphql-ingest-autosync). */
export type SubscribeStarGraphqlPostsIngestJobData = RelayJobTraceFields & {
  /** Optional: restrict cycle to one Relay creator id (ops / replay). */
  creatorId?: string;
};

/** Patron entitlement stale snapshot refresh batch (see patron-entitlement-stale-worker). */
export type PatronEntitlementStaleRefreshJobData = RelayJobTraceFields & {
  /** Optional: refresh a single `PatronEntitlementSnapshot.patronMembershipId`. */
  patronMembershipId?: string;
};

/** Notification outbox drain — tick or single event (see notification-delivery-worker). */
export type NotificationDeliveryJobData = RelayJobTraceFields & {
  /** When set, process only this `OutboxEvent.eventId` (stable domain id). */
  outboxEventId?: string;
};

/** Account deletion grace sweeper (see account-deletion-worker). */
export type AccountDeletionSweepJobData = RelayJobTraceFields & {
  /** Optional: run `executeDeletion` for this `AccountDeletion.id` only. */
  accountDeletionId?: string;
};

/** Media storage purge batch processor (see media-storage-purge-worker). */
export type MediaStoragePurgeJobData = RelayJobTraceFields & {
  /** Optional: process one `MediaStoragePurgeQueue.id` row. */
  purgeQueueRowId?: string;
};

/** Platform metric daily rollup job (see platform-metric-daily-rollup-job). */
export type PlatformMetricDailyRollupJobData = RelayJobTraceFields & {
  /** Optional: roll up only this UTC day (YYYY-MM-DD). */
  dayUtc?: string;
};

/** External post metric daily rollup job (see external-metric-rollup-job). */
export type ExternalMetricDailyRollupJobData = RelayJobTraceFields & {
  /** Optional: restrict cycle to one Relay creator id (ops / replay). */
  creatorId?: string;
};

/** Conservative platform instance refresh sweep (see platform-instance-refresh-sweep-job). */
export type PlatformInstanceRefreshSweepJobData = RelayJobTraceFields & {
  /** Optional: restrict cycle to one Relay creator id (ops / replay). */
  creatorId?: string;
};

/** Patron digest email sweep (see notification-digest-worker). */
export type NotificationDigestJobData = RelayJobTraceFields & {
  /** Optional: process one patron membership only (ops / replay). */
  patronMembershipId?: string;
};

/** Posting goal nudge sweep (see posting-goal-nudge-worker). */
export type PostingGoalNudgeJobData = RelayJobTraceFields & {
  /** Optional: restrict cycle to one Relay creator id (ops / replay). */
  creatorId?: string;
};

/** Maps queue name → default job payload shape for typing `Job<T>` / processors. */
export type RelayJobPayloadByQueue = {
  [RELAY_JOB_QUEUE_NAMES.PATREON_INCREMENTAL_AUTOSYNC]: PatreonIncrementalAutosyncJobData;
  [RELAY_JOB_QUEUE_NAMES.SUBSCRIBESTAR_GRAPHQL_POSTS_INGEST]: SubscribeStarGraphqlPostsIngestJobData;
  [RELAY_JOB_QUEUE_NAMES.PATRON_ENTITLEMENT_STALE_REFRESH]: PatronEntitlementStaleRefreshJobData;
  [RELAY_JOB_QUEUE_NAMES.NOTIFICATION_DELIVERY]: NotificationDeliveryJobData;
  [RELAY_JOB_QUEUE_NAMES.ACCOUNT_DELETION_SWEEP]: AccountDeletionSweepJobData;
  [RELAY_JOB_QUEUE_NAMES.MEDIA_STORAGE_PURGE]: MediaStoragePurgeJobData;
  [RELAY_JOB_QUEUE_NAMES.PLATFORM_METRIC_DAILY_ROLLUP]: PlatformMetricDailyRollupJobData;
  [RELAY_JOB_QUEUE_NAMES.EXTERNAL_METRIC_DAILY_ROLLUP]: ExternalMetricDailyRollupJobData;
  [RELAY_JOB_QUEUE_NAMES.PLATFORM_INSTANCE_REFRESH_SWEEP]: PlatformInstanceRefreshSweepJobData;
  [RELAY_JOB_QUEUE_NAMES.NOTIFICATION_DIGEST]: NotificationDigestJobData;
  [RELAY_JOB_QUEUE_NAMES.POSTING_GOAL_NUDGE]: PostingGoalNudgeJobData;
};
