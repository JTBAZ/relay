import { RELAY_API_BASE } from "./constants.js";
import * as storage from "./storage.js";
import type { ExternalMetricsScrapeMetric } from "./external-metrics-types.js";

export type ExternalMetricSource =
  | "extension_dom"
  | "public_scrape"
  | "platform_api"
  | "manual"
  | "third_party";

export type ExternalMetricsReportInput = {
  /** Prefer attempt when present; otherwise report by platform instance. */
  attempt_id?: string | null;
  platform_instance_id?: string | null;
  source: ExternalMetricSource;
  metrics: ExternalMetricsScrapeMetric[];
};

export type ExternalMetricsReportResult = {
  ok: boolean;
  snapshot_count: number;
  http_status?: number;
  error?: string;
};

export async function reportExternalPostMetrics(
  input: ExternalMetricsReportInput,
  opts?: { relayApiBase?: string }
): Promise<ExternalMetricsReportResult> {
  const grant = await storage.getGrant();
  const attemptId = input.attempt_id?.trim() ?? "";
  const platformInstanceId = input.platform_instance_id?.trim() ?? "";
  const metrics = input.metrics.filter((metric) => metric.metric_type.trim().length > 0);
  if (!grant?.token.trim() || metrics.length === 0 || (!attemptId && !platformInstanceId)) {
    return { ok: false, snapshot_count: 0 };
  }

  const relayApiBase = (opts?.relayApiBase ?? RELAY_API_BASE).replace(/\/$/, "");
  const path = attemptId
    ? `${relayApiBase}/api/v1/relay/distribution-attempts/${encodeURIComponent(attemptId)}/metrics`
    : `${relayApiBase}/api/v1/creator/analytics/platform-instances/${encodeURIComponent(platformInstanceId)}/metrics`;

  try {
    const res = await fetch(path, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${grant.token.trim()}`
      },
      body: JSON.stringify({
        source: input.source,
        metrics: metrics.map((metric) => ({
          metric_type: metric.metric_type.trim(),
          value: metric.value ?? null,
          raw: metric.raw ?? {}
        }))
      })
    });
    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      return {
        ok: false,
        snapshot_count: 0,
        http_status: res.status,
        error: errorBody.slice(0, 240) || `http_${res.status}`
      };
    }
    const body = (await res.json()) as { data?: { snapshots?: unknown[] } };
    const snapshotCount = Array.isArray(body.data?.snapshots) ? body.data.snapshots.length : 0;
    return { ok: true, snapshot_count: snapshotCount };
  } catch (error) {
    return {
      ok: false,
      snapshot_count: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
