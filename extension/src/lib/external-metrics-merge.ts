import type { ExternalMetricsScrapeMetric } from "./external-metrics-types.js";
import type { ExternalMetricSource } from "./external-metrics-report.js";

const NUMERIC_METRIC_PRIORITY = [
  "impressions",
  "seen",
  "likes",
  "comments",
  "views"
] as const;

function metricKey(metric: ExternalMetricsScrapeMetric): string {
  return metric.metric_type.trim().toLowerCase();
}

function hasNumericValue(metric: ExternalMetricsScrapeMetric | undefined): boolean {
  return typeof metric?.value === "number" && Number.isFinite(metric.value);
}

export function mergeExternalMetrics(
  domMetrics: ExternalMetricsScrapeMetric[],
  apiMetrics: ExternalMetricsScrapeMetric[]
): ExternalMetricsScrapeMetric[] {
  const merged = new Map<string, ExternalMetricsScrapeMetric>();

  for (const metric of domMetrics) {
    merged.set(metricKey(metric), metric);
  }

  for (const metric of apiMetrics) {
    const key = metricKey(metric);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, metric);
      continue;
    }

    const preferApi =
      NUMERIC_METRIC_PRIORITY.includes(key as (typeof NUMERIC_METRIC_PRIORITY)[number]) &&
      hasNumericValue(metric);

    if (preferApi || !hasNumericValue(existing)) {
      merged.set(key, {
        ...existing,
        ...metric,
        raw: {
          ...(existing.raw ?? {}),
          ...(metric.raw ?? {})
        }
      });
    }
  }

  return [...merged.values()];
}

export function chooseExternalMetricsSource(
  mergedMetrics: ExternalMetricsScrapeMetric[],
  apiMetrics: ExternalMetricsScrapeMetric[]
): ExternalMetricSource {
  const apiHasReach = apiMetrics.some(
    (metric) =>
      (metric.metric_type === "impressions" || metric.metric_type === "seen") &&
      hasNumericValue(metric)
  );
  if (apiHasReach) return "platform_api";

  const apiHasActivity = apiMetrics.some(
    (metric) =>
      (metric.metric_type === "likes" || metric.metric_type === "comments") &&
      hasNumericValue(metric)
  );
  if (apiHasActivity && mergedMetrics.length > 0) return "platform_api";

  return "extension_dom";
}
