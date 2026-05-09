/**
 * @fileoverview In-process counters for `/api/v1/analytics/generate` success ratios (Workstream E SLO).
 * @description Tracks POST outcomes for insight generation; counters reset on process restart — pair with external monitoring for calendar SLOs.
 */

/**
 * Tracks POST /api/v1/analytics/generate outcomes for Workstream E SLO (insight job success ≥99%).
 * Counters reset on process restart — pair with external monitoring for calendar SLOs.
 */
const state = {
  generate_attempts: 0,
  generate_successes: 0,
  generate_failures: 0
};

/**
 * @description Resets in-memory counters (test helper).
 */
export function resetInsightJobMetricsForTests(): void {
  state.generate_attempts = 0;
  state.generate_successes = 0;
  state.generate_failures = 0;
}

/**
 * @description Increments attempt counter when generate endpoint is invoked.
 */
export function recordAnalyticsGenerateAttempt(): void {
  state.generate_attempts += 1;
}

/**
 * @description Increments success counter after a completed generate call.
 */
export function recordAnalyticsGenerateSuccess(): void {
  state.generate_successes += 1;
}

/**
 * @description Increments failure counter when generate errors or aborts.
 */
export function recordAnalyticsGenerateFailure(): void {
  state.generate_failures += 1;
}

/** @description Snapshot of counters plus derived success/failure ratios when denom > 0. */
export type InsightJobMetricsSnapshot = typeof state & {
  success_ratio: number | null;
  failure_ratio: number | null;
};

/**
 * @description Returns a copy of counters with computed ratios for health endpoints.
 * @returns Metrics snapshot including `success_ratio` / `failure_ratio`.
 */
export function getInsightJobMetricsSnapshot(): InsightJobMetricsSnapshot {
  const denom = state.generate_successes + state.generate_failures;
  return {
    ...state,
    success_ratio: denom > 0 ? state.generate_successes / denom : null,
    failure_ratio: denom > 0 ? state.generate_failures / denom : null
  };
}

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

/** @description Structured health payload combining metrics, alert strings, and documentation hints. */
export type InsightJobHealthEvaluation = {
  metrics: InsightJobMetricsSnapshot;
  alerts: string[];
  documentation: string[];
};

/**
 * @description Evaluates configurable SLO thresholds against counters.
 * Optional env: `RELAY_INSIGHT_JOB_ALERT_MIN_SAMPLES` (default 50), `RELAY_INSIGHT_JOB_ALERT_MAX_FAILURE_RATIO` (default 0.01).
 * @returns Metrics, alert messages when thresholds exceeded, and operator documentation strings.
 */
export function evaluateInsightJobHealth(): InsightJobHealthEvaluation {
  const metrics = getInsightJobMetricsSnapshot();
  const minSamples = Math.max(1, envInt("RELAY_INSIGHT_JOB_ALERT_MIN_SAMPLES", 50));
  const maxFail = envFloat("RELAY_INSIGHT_JOB_ALERT_MAX_FAILURE_RATIO", 0.01);
  const alerts: string[] = [];
  const denom = metrics.generate_successes + metrics.generate_failures;
  if (denom >= minSamples && metrics.failure_ratio !== null && metrics.failure_ratio > maxFail) {
    alerts.push(
      `analytics generate failure ratio ${(metrics.failure_ratio * 100).toFixed(2)}% exceeds ${(maxFail * 100).toFixed(2)}% (samples=${denom})`
    );
  }
  const documentation = [
    "Workstream E target: insight generation (POST /api/v1/analytics/generate) should succeed at least ~99% of attempts in steady state.",
    "Counters are per API process since boot. For production SLO proof, scrape this endpoint or ship logs."
  ];
  return { metrics, alerts, documentation };
}
