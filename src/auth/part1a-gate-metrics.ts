/**
 * @fileoverview In-process counters for Part 1A OAuth exit gates on the road map narrative.
 */

/**
 * In-process telemetry for Part 1 A exit gates (road map): creator/patron OAuth completion,
 * token refresh outcomes. Counters reset on process restart — pair with log shipping or an
 * external TSDB for calendar-day SLOs.
 */
const bootMs = Date.now();

const state = {
  creator_oauth_attempts: 0,
  creator_oauth_success: 0,
  creator_oauth_failure: 0,
  patron_oauth_attempts: 0,
  patron_oauth_success: 0,
  patron_oauth_failure: 0,
  token_refresh_attempts: 0,
  token_refresh_success: 0,
  token_refresh_failure: 0
};

/** @description Snapshot including derived uptime metadata for dashboards. */
export type Part1aGateMetricsSnapshot = typeof state & {
  uptime_ms: number;
  boot_iso: string;
};

/** @description Resets telemetry counters — tests only. */
export function resetPart1aGateMetricsForTests(): void {
  state.creator_oauth_attempts = 0;
  state.creator_oauth_success = 0;
  state.creator_oauth_failure = 0;
  state.patron_oauth_attempts = 0;
  state.patron_oauth_success = 0;
  state.patron_oauth_failure = 0;
  state.token_refresh_attempts = 0;
  state.token_refresh_success = 0;
  state.token_refresh_failure = 0;
}

/** @description Records an attempted creator Patreon OAuth code exchange. */
export function recordCreatorOAuthExchangeAttempt(): void {
  state.creator_oauth_attempts += 1;
}

/** @description Records a completed creator OAuth exchange. */
export function recordCreatorOAuthExchangeSuccess(): void {
  state.creator_oauth_success += 1;
}

/** @description Records a failed creator OAuth exchange attempt. */
export function recordCreatorOAuthExchangeFailure(): void {
  state.creator_oauth_failure += 1;
}

/** @description Records patron OAuth attempt initiation. */
export function recordPatronOAuthAttempt(): void {
  state.patron_oauth_attempts += 1;
}

/** @description Records patron OAuth completion. */
export function recordPatronOAuthSuccess(): void {
  state.patron_oauth_success += 1;
}

/** @description Records patron OAuth failure. */
export function recordPatronOAuthFailure(): void {
  state.patron_oauth_failure += 1;
}

/** @description Records proactive or reactive token refresh attempt. */
export function recordTokenRefreshAttempt(): void {
  state.token_refresh_attempts += 1;
}

/** @description Records successful token refresh. */
export function recordTokenRefreshSuccess(): void {
  state.token_refresh_success += 1;
}

/** @description Records refresh failure (Patreon or persistence). */
export function recordTokenRefreshFailure(): void {
  state.token_refresh_failure += 1;
}

/**
 * @description Returns raw counters plus boot metadata for health endpoints.
 * @returns Snapshot including uptime since process start.
 */
export function getPart1aGateMetricsSnapshot(): Part1aGateMetricsSnapshot {
  return {
    ...state,
    uptime_ms: Date.now() - bootMs,
    boot_iso: new Date(bootMs).toISOString()
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

/** @description Aggregated evaluation with ratios, alerts, and operator documentation strings. */
export type Part1aGateEvaluation = {
  metrics: Part1aGateMetricsSnapshot;
  /** `success / attempts` for creator `POST .../auth/patreon/exchange`. Null if no attempts. */
  creator_oauth_completion_ratio: number | null;
  /** `success / attempts` for patron exchange. Null if no attempts. */
  patron_oauth_completion_ratio: number | null;
  /** `failure / (success + failure)` for token refresh. Null if no refresh outcomes. */
  token_refresh_failure_ratio: number | null;
  alerts: string[];
  documentation: string[];
};

/**
 * @description Optional env-driven alerts. See `.env.example` (Part 1 A gates).
 * @returns Metrics snapshot, derived ratios, alert strings, and documentation guidance.
 */
export function evaluatePart1aGates(): Part1aGateEvaluation {
  const metrics = getPart1aGateMetricsSnapshot();
  const minSamples = Math.max(1, envInt("RELAY_PART1A_MIN_SAMPLES_FOR_ALERTS", 20));
  const minCreatorRate = envFloat("RELAY_PART1A_ALERT_CREATOR_OAUTH_MIN_COMPLETION", 0.95);
  const maxRefreshFail = envFloat("RELAY_PART1A_ALERT_TOKEN_REFRESH_MAX_FAILURE_RATIO", 0.01);

  const creator_oauth_completion_ratio =
    metrics.creator_oauth_attempts > 0
      ? metrics.creator_oauth_success / metrics.creator_oauth_attempts
      : null;

  const patron_oauth_completion_ratio =
    metrics.patron_oauth_attempts > 0
      ? metrics.patron_oauth_success / metrics.patron_oauth_attempts
      : null;

  const refreshDenom = metrics.token_refresh_success + metrics.token_refresh_failure;
  const token_refresh_failure_ratio =
    refreshDenom > 0 ? metrics.token_refresh_failure / refreshDenom : null;

  const alerts: string[] = [];

  if (
    metrics.creator_oauth_attempts >= minSamples &&
    creator_oauth_completion_ratio !== null &&
    creator_oauth_completion_ratio < minCreatorRate
  ) {
    alerts.push(
      `creator OAuth completion ${(creator_oauth_completion_ratio * 100).toFixed(2)}% < ${(minCreatorRate * 100).toFixed(0)}% (samples=${metrics.creator_oauth_attempts})`
    );
  }

  if (
    refreshDenom >= minSamples &&
    token_refresh_failure_ratio !== null &&
    token_refresh_failure_ratio > maxRefreshFail
  ) {
    alerts.push(
      `token refresh failure ratio ${(token_refresh_failure_ratio * 100).toFixed(2)}% > ${(maxRefreshFail * 100).toFixed(2)}% (samples=${refreshDenom})`
    );
  }

  const documentation = [
    "Part 1 A targets (road map): about 95% creator OAuth completion without support; token refresh failures under 1% per day.",
    "These counters are since process boot. For true daily SLOs, export to logs/metrics (e.g. scrape this endpoint or forward events) or run multiple replicas with external aggregation."
  ];

  return {
    metrics,
    creator_oauth_completion_ratio,
    patron_oauth_completion_ratio,
    token_refresh_failure_ratio,
    alerts,
    documentation
  };
}
