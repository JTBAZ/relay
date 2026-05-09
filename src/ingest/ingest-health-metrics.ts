/**
 * @fileoverview In-process ingest observability counters and optional alert thresholds (T-009).
 * @description Feeds `GET /api/v1/health/ingest` and gate evaluation helpers.
 */

import type { ApplyBatchResult } from "./types.js";

/**
 * @description In-process counters for Workstream B observability (T-009). Reset on process restart.
 */
const state = {
  batches_completed: 0,
  idempotent_skips_total: 0,
  rows_mutated_total: 0,
  /** Rows written/updated (not idempotent skips). */
  posts_written_total: 0,
  dlq_appends_total: 0,
  retry_failures_before_dlq_total: 0
};

/** Clears counters (e.g. Vitest `beforeEach`). */
export function resetIngestHealthMetrics(): void {
  state.batches_completed = 0;
  state.idempotent_skips_total = 0;
  state.rows_mutated_total = 0;
  state.posts_written_total = 0;
  state.dlq_appends_total = 0;
  state.retry_failures_before_dlq_total = 0;
}

export function recordIngestBatchResult(result: ApplyBatchResult): void {
  state.batches_completed += 1;
  state.idempotent_skips_total += result.idempotent_skips;
  const mutated =
    result.campaigns_upserted +
    result.tiers_upserted +
    result.posts_written +
    result.media_upserted +
    result.tombstones_applied;
  state.rows_mutated_total += mutated;
  state.posts_written_total += result.posts_written;
}

export function recordDlqAppend(): void {
  state.dlq_appends_total += 1;
}

/** Each failed attempt inside IngestRetryQueue before success or DLQ. */
export function recordRetryFailure(): void {
  state.retry_failures_before_dlq_total += 1;
}

export type IngestHealthMetricsSnapshot = typeof state;

export function getIngestHealthMetricsSnapshot(): IngestHealthMetricsSnapshot {
  return { ...state };
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export type IngestHealthGateEvaluation = {
  metrics: IngestHealthMetricsSnapshot;
  /** `idempotent_skips / (idempotent_skips + rows_mutated)` when denominator is positive. */
  duplicate_handling_ratio: number | null;
  /** `dlq_appends / batches_completed`. */
  dlq_per_batch: number | null;
  pending_retry_jobs: number;
  dlq_record_count: number;
  alerts: string[];
};

/**
 * @description Evaluates optional env thresholds for duplicate ratio and DLQ rates.
 * @param {{ pendingRetryJobs: number; dlqRecordCount: number }} args
 * @returns {Promise<IngestHealthGateEvaluation>}
 * @async
 */
export async function evaluateIngestHealthGates(args: {
  pendingRetryJobs: number;
  dlqRecordCount: number;
}): Promise<IngestHealthGateEvaluation> {
  const metrics = getIngestHealthMetricsSnapshot();
  const denomSkips = metrics.idempotent_skips_total + metrics.rows_mutated_total;
  const duplicate_handling_ratio =
    denomSkips > 0 ? metrics.idempotent_skips_total / denomSkips : null;
  const dlq_per_batch =
    metrics.batches_completed > 0
      ? metrics.dlq_appends_total / metrics.batches_completed
      : null;

  const minBatches = Math.max(1, envInt("RELAY_INGEST_HEALTH_MIN_BATCHES_FOR_ALERTS", 20));
  const maxPending = envInt("RELAY_INGEST_ALERT_MAX_PENDING_RETRIES", 50);
  const maxDlqRecords = envInt("RELAY_INGEST_ALERT_MAX_DLQ_RECORDS", 0);
  const maxDlqPerBatch = envFloat("RELAY_INGEST_ALERT_MAX_DLQ_PER_BATCH", 0);
  const maxDupRatio = envFloat("RELAY_INGEST_ALERT_MAX_DUPLICATE_RATIO", 0.999);

  const alerts: string[] = [];
  if (args.pendingRetryJobs > maxPending) {
    alerts.push(
      `retry_queue_depth=${args.pendingRetryJobs} exceeds RELAY_INGEST_ALERT_MAX_PENDING_RETRIES (${maxPending})`
    );
  }
  if (maxDlqRecords > 0 && args.dlqRecordCount > maxDlqRecords) {
    alerts.push(
      `dlq_records=${args.dlqRecordCount} exceeds RELAY_INGEST_ALERT_MAX_DLQ_RECORDS (${maxDlqRecords})`
    );
  }
  if (
    metrics.batches_completed >= minBatches &&
    maxDlqPerBatch > 0 &&
    dlq_per_batch !== null &&
    dlq_per_batch > maxDlqPerBatch
  ) {
    alerts.push(
      `dlq_per_batch=${dlq_per_batch.toFixed(4)} exceeds RELAY_INGEST_ALERT_MAX_DLQ_PER_BATCH (${maxDlqPerBatch}) after ${metrics.batches_completed} batches`
    );
  }
  if (
    metrics.batches_completed >= minBatches &&
    duplicate_handling_ratio !== null &&
    duplicate_handling_ratio > maxDupRatio
  ) {
    alerts.push(
      `duplicate_handling_ratio=${duplicate_handling_ratio.toFixed(4)} exceeds RELAY_INGEST_ALERT_MAX_DUPLICATE_RATIO (${maxDupRatio}) — possible replay storm`
    );
  }

  return {
    metrics,
    duplicate_handling_ratio,
    dlq_per_batch,
    pending_retry_jobs: args.pendingRetryJobs,
    dlq_record_count: args.dlqRecordCount,
    alerts
  };
}
