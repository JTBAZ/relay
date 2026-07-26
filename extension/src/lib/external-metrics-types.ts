/**
 * External post metrics refresh contract (Slice 2).
 * Separate from post-link confirmation messages.
 */

import type { CrossPostDestination } from "./cross-post-types.js";

export const MSG_RELAY_EXTERNAL_METRICS_REFRESH = "RELAY_EXTERNAL_METRICS_REFRESH" as const;

/** Relay web → extension externally-connectable refresh trigger. */
export type ExternalMetricsRefreshMessage = {
  type: typeof MSG_RELAY_EXTERNAL_METRICS_REFRESH;
  attempt_id: string;
  post_id: string;
  destination: CrossPostDestination;
  external_url: string;
};

export type ExternalMetricsScrapeMetric = {
  metric_type: string;
  value?: number | null;
  raw?: Record<string, unknown>;
};

export type ExternalMetricsRefreshSuccess = {
  ok: true;
  attempt_id: string;
  post_id: string;
  destination: CrossPostDestination;
  snapshot_count: number;
};

export type ExternalMetricsRefreshFailure = {
  ok: false;
  reason:
    | "not_connected"
    | "invalid_message"
    | "unsupported_destination"
    | "tab_open_failed"
    | "tab_load_timeout"
    | "inject_failed"
    | "scrape_failed"
    | "metrics_post_failed"
    | "unknown";
  detail?: string;
};

export type ExternalMetricsRefreshResponse =
  | ExternalMetricsRefreshSuccess
  | ExternalMetricsRefreshFailure;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function isExternalMetricsRefreshMessage(
  v: unknown
): v is ExternalMetricsRefreshMessage {
  if (v === null || typeof v !== "object" || !("type" in v)) return false;
  const m = v as {
    type: unknown;
    attempt_id?: unknown;
    post_id?: unknown;
    destination?: unknown;
    external_url?: unknown;
  };
  if (m.type !== MSG_RELAY_EXTERNAL_METRICS_REFRESH) return false;
  if (
    !isNonEmptyString(m.attempt_id) ||
    !isNonEmptyString(m.post_id) ||
    !isNonEmptyString(m.external_url)
  ) {
    return false;
  }
  return (
    m.destination === "patreon" ||
    m.destination === "x" ||
    m.destination === "deviantart"
  );
}

export function isExternalMetricsScrapeMetric(v: unknown): v is ExternalMetricsScrapeMetric {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const m = v as Record<string, unknown>;
  if (!isNonEmptyString(m.metric_type)) return false;
  if (
    m.value !== undefined &&
    m.value !== null &&
    (typeof m.value !== "number" || !Number.isFinite(m.value))
  ) {
    return false;
  }
  if (
    m.raw !== undefined &&
    m.raw !== null &&
    (typeof m.raw !== "object" || Array.isArray(m.raw))
  ) {
    return false;
  }
  return true;
}
