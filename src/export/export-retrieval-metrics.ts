/**
 * Workstream C (T-013): in-process counters for export retrieval + integrity signals.
 * Reset on process restart — pair with logs/APM for rolling 7d SLO proof.
 */
const state = {
  /** POST /api/v1/export/media */
  export_media_attempts: 0,
  export_media_successes: 0,
  export_media_failures: 0,
  /** GET .../content — successful body read + 200 */
  content_delivery_successes: 0,
  content_delivery_failures: 0,
  /** GET .../preview — successful preview bytes */
  preview_delivery_successes: 0,
  preview_delivery_failures: 0,
  /** POST /api/v1/export/verify — index + on-disk checksum vs index */
  verify_match_true: 0,
  verify_match_false: 0,
  /** POST /api/v1/export/integrity-sample — per-media checks */
  integrity_sample_ok: 0,
  integrity_sample_fail: 0
};

export function resetExportRetrievalMetricsForTests(): void {
  state.export_media_attempts = 0;
  state.export_media_successes = 0;
  state.export_media_failures = 0;
  state.content_delivery_successes = 0;
  state.content_delivery_failures = 0;
  state.preview_delivery_successes = 0;
  state.preview_delivery_failures = 0;
  state.verify_match_true = 0;
  state.verify_match_false = 0;
  state.integrity_sample_ok = 0;
  state.integrity_sample_fail = 0;
}

export function recordExportMediaAttempt(): void {
  state.export_media_attempts += 1;
}

export function recordExportMediaSuccess(): void {
  state.export_media_successes += 1;
}

export function recordExportMediaFailure(): void {
  state.export_media_failures += 1;
}

export function recordContentDeliverySuccess(): void {
  state.content_delivery_successes += 1;
}

export function recordContentDeliveryFailure(): void {
  state.content_delivery_failures += 1;
}

export function recordPreviewDeliverySuccess(): void {
  state.preview_delivery_successes += 1;
}

export function recordPreviewDeliveryFailure(): void {
  state.preview_delivery_failures += 1;
}

export function recordVerifyResult(match: boolean): void {
  if (match) state.verify_match_true += 1;
  else state.verify_match_false += 1;
}

export function recordIntegritySampleResults(ok: number, fail: number): void {
  state.integrity_sample_ok += ok;
  state.integrity_sample_fail += fail;
}

export type ExportRetrievalMetricsSnapshot = typeof state & {
  content_retrieval_ratio: number | null;
  /** (successes) / (successes + failures) for GET content */
  preview_retrieval_ratio: number | null;
  verify_match_ratio: number | null;
};

export function getExportRetrievalMetricsSnapshot(): ExportRetrievalMetricsSnapshot {
  const cDen = state.content_delivery_successes + state.content_delivery_failures;
  const pDen = state.preview_delivery_successes + state.preview_delivery_failures;
  const vDen = state.verify_match_true + state.verify_match_false;
  return {
    ...state,
    content_retrieval_ratio:
      cDen > 0 ? state.content_delivery_successes / cDen : null,
    preview_retrieval_ratio:
      pDen > 0 ? state.preview_delivery_successes / pDen : null,
    verify_match_ratio: vDen > 0 ? state.verify_match_true / vDen : null
  };
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

export type ExportHealthEvaluation = {
  metrics: ExportRetrievalMetricsSnapshot;
  alerts: string[];
  documentation: string[];
};

/**
 * Optional env: RELAY_EXPORT_HEALTH_MIN_SAMPLES (default 30),
 * RELAY_EXPORT_HEALTH_MAX_CONTENT_FAILURE_RATIO (default 0.001 = 0.1% miss vs 99.9% target).
 */
export function evaluateExportRetrievalHealth(): ExportHealthEvaluation {
  const metrics = getExportRetrievalMetricsSnapshot();
  const minSamples = Math.max(1, envInt("RELAY_EXPORT_HEALTH_MIN_SAMPLES", 30));
  const maxFailRatio = envFloat("RELAY_EXPORT_HEALTH_MAX_CONTENT_FAILURE_RATIO", 0.001);
  const alerts: string[] = [];

  const cDen = metrics.content_delivery_successes + metrics.content_delivery_failures;
  if (
    cDen >= minSamples &&
    metrics.content_retrieval_ratio !== null &&
    1 - metrics.content_retrieval_ratio > maxFailRatio
  ) {
    alerts.push(
      `export GET content failure ratio ${((1 - metrics.content_retrieval_ratio) * 100).toFixed(4)}% exceeds ${(maxFailRatio * 100).toFixed(4)}% (samples=${cDen})`
    );
  }

  const documentation = [
    "Workstream C target: exported blob retrieval (GET /api/v1/export/media/:creator_id/:media_id/content) should succeed at least ~99.9% of attempts in steady state.",
    "Counters are per API process since boot. Use POST /api/v1/export/integrity-sample for checksum sampling against export_index.",
    "See RELAY_EXPORT_HEALTH_* env vars in .env.example."
  ];

  return { metrics, alerts, documentation };
}
