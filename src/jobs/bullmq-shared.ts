/**
 * Shared BullMQ defaults for Relay workers and future producers (P1-queue-012).
 */

import type { DefaultJobOptions, KeepJobs } from "bullmq";
import { getRedisConnectionOptions } from "../lib/redis.js";
import type { RelayJobQueueName } from "./queue-names.js";

/** Passed to `Queue.add` / repeatable jobs so retries and retention are consistent. */
export const RELAY_BULLMQ_DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 2000 },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 200 }
};

const RELAY_BULLMQ_WORKER_RETENTION: {
  removeOnComplete: KeepJobs;
  removeOnFail: KeepJobs;
} = {
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 200 }
};

/** Worker-side completed/failed set caps (aligned with {@link RELAY_BULLMQ_DEFAULT_JOB_OPTIONS}). */
export function relayBullMqWorkerRetentionOptions(): {
  removeOnComplete: KeepJobs;
  removeOnFail: KeepJobs;
} {
  return RELAY_BULLMQ_WORKER_RETENTION;
}

/**
 * How BullMQ detects stalled jobs (worker stops heartbeating an active job). Explicit values match
 * library defaults (BullMQ v5) so operators can tune via env without hunting framework source.
 *
 * @see https://docs.bullmq.io/guide/jobs/stalled
 *
 * If a job stalls more than `maxStalledCount` times, it **fails** with
 * `job stalled more than allowable limit` (then normal `attempts` / failed-set retention apply).
 * To **force** a stuck job out of active without waiting, use admin tooling / `moveToFailed` (BullMQ API).
 */
const DEFAULT_STALLED_INTERVAL_MS = 30_000;
const MIN_STALLED_INTERVAL_MS = 5_000;
const MAX_STALLED_INTERVAL_MS = 300_000;
const DEFAULT_MAX_STALLED_COUNT = 1;
const MAX_STALLED_COUNT_CAP = 10;

export type RelayBullMqStallRecoveryOptions = {
  stalledInterval: number;
  maxStalledCount: number;
};

/**
 * Stall detection for all Relay BullMQ workers (same policy per queue; avoids surprise drift from implicit defaults).
 */
export function relayBullMqWorkerStallRecoveryOptions(
  env: NodeJS.ProcessEnv = process.env
): RelayBullMqStallRecoveryOptions {
  const rawInterval = env.RELAY_BULLMQ_STALLED_INTERVAL_MS?.trim();
  let stalledInterval = DEFAULT_STALLED_INTERVAL_MS;
  if (rawInterval) {
    const n = Number(rawInterval);
    if (Number.isFinite(n)) {
      stalledInterval = Math.min(
        MAX_STALLED_INTERVAL_MS,
        Math.max(MIN_STALLED_INTERVAL_MS, Math.floor(n))
      );
    }
  }
  const rawCount = env.RELAY_BULLMQ_MAX_STALLED_COUNT?.trim();
  let maxStalledCount = DEFAULT_MAX_STALLED_COUNT;
  if (rawCount) {
    const n = Number(rawCount);
    if (Number.isInteger(n) && n >= 1) {
      maxStalledCount = Math.min(MAX_STALLED_COUNT_CAP, n);
    }
  }
  return { stalledInterval, maxStalledCount };
}

/**
 * ioredis options for a single shared client passed to all Workers (BullMQ duplicates for blocking).
 * @public visible for tests
 */
export function relayBullMqIoredisOptions(
  env: NodeJS.ProcessEnv = process.env
): Record<string, unknown> {
  return {
    ...getRedisConnectionOptions(env),
    maxRetriesPerRequest: null
  };
}

const CONCURRENCY_MIN = 1;
const CONCURRENCY_MAX = 64;

/**
 * Concurrent jobs per worker. Override per queue with `RELAY_BULLMQ_CONCURRENCY_<QUEUE_NAME_IN_UPPERCASE>`.
 * Falls back to `RELAY_BULLMQ_CONCURRENCY`, then `1`.
 */
export function relayBullMqConcurrencyForQueue(
  queueName: RelayJobQueueName,
  env: NodeJS.ProcessEnv = process.env
): number {
  const perKey = `RELAY_BULLMQ_CONCURRENCY_${queueName.toUpperCase()}`;
  const perRaw = env[perKey];
  const dfltRaw = env.RELAY_BULLMQ_CONCURRENCY;
  const raw =
    perRaw !== undefined && String(perRaw).trim() !== ""
      ? String(perRaw).trim()
      : dfltRaw !== undefined && String(dfltRaw).trim() !== ""
        ? String(dfltRaw).trim()
        : "1";
  const n = Number(raw);
  if (!Number.isInteger(n) || n < CONCURRENCY_MIN || n > CONCURRENCY_MAX) {
    throw new Error(
      `Invalid BullMQ concurrency for queue "${queueName}": ${JSON.stringify(raw)} (expected integer ${CONCURRENCY_MIN}–${CONCURRENCY_MAX})`
    );
  }
  return n;
}
