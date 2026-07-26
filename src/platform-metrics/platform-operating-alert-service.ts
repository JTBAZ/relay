/**
 * PMD-080 — Dashboard alerts for key operating risks.
 */
import type { PrismaClient } from "@prisma/client";
import { evaluateInsightJobHealth } from "../analytics/insight-job-metrics.js";
import { evaluateExportRetrievalHealth } from "../export/export-retrieval-metrics.js";
import { evaluatePlatformOperationsHealth } from "../health/platform-operations-metrics.js";
import { evaluateIngestHealthGates } from "../ingest/ingest-health-metrics.js";
import type { PlatformMetricDefinition } from "./metric-registry-types.js";
import type {
  PlatformOperatingAlert,
  PlatformOperatingAlertKey
} from "./platform-operating-alert-types.js";
import type { PlatformMetricTrendDelta } from "./platform-metric-trend-types.js";

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function metricByKey(
  metrics: PlatformMetricDefinition[],
  key: string
): PlatformMetricDefinition | undefined {
  return metrics.find((metric) => metric.key === key);
}

function numericValue(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function pickDropDelta(
  trends: PlatformMetricDefinition["trends"]
): PlatformMetricTrendDelta | null {
  if (!trends) return null;
  if (trends.wow.sufficientHistory) return trends.wow;
  if (trends.dod.sufficientHistory) return trends.dod;
  return null;
}

function isSignificantDrop(
  trends: PlatformMetricDefinition["trends"],
  minDropPercent: number
): PlatformMetricTrendDelta | null {
  const delta = pickDropDelta(trends);
  if (!delta || delta.direction !== "down") return null;
  if (delta.deltaPercent === null) return null;
  if (delta.deltaPercent <= -minDropPercent) return delta;
  return null;
}

function pushAlert(
  alerts: PlatformOperatingAlert[],
  alert: PlatformOperatingAlert
): void {
  if (alerts.some((existing) => existing.key === alert.key)) return;
  alerts.push(alert);
}

function dropAlert(args: {
  key: PlatformOperatingAlertKey;
  title: string;
  metric: PlatformMetricDefinition;
  delta: PlatformMetricTrendDelta;
  minDropPercent: number;
}): PlatformOperatingAlert {
  const window = args.metric.trends?.wow.sufficientHistory ? "WoW" : "DoD";
  return {
    key: args.key,
    severity: args.delta.deltaPercent !== null && args.delta.deltaPercent <= -40 ? "critical" : "warning",
    title: args.title,
    message: `${args.metric.label} fell ${Math.abs(args.delta.deltaPercent ?? 0).toFixed(1)}% (${window}) — threshold ${args.minDropPercent}%`,
    relatedMetricKey: args.metric.key,
    relatedSection: args.metric.section,
    sourceContext: `${window} ${args.delta.priorValue ?? "?"} → ${args.delta.currentValue ?? "?"}`
  };
}

export async function evaluatePlatformOperatingAlerts(args: {
  prisma: PrismaClient | undefined;
  pendingRetryJobs: number;
  dlqRecordCount: number;
  metrics: PlatformMetricDefinition[];
}): Promise<PlatformOperatingAlert[]> {
  const minDropPercent = envFloat("RELAY_PLATFORM_ALERT_MIN_DROP_PERCENT", 20);
  const alerts: PlatformOperatingAlert[] = [];

  const dauMetric = metricByKey(args.metrics, "activity.dau");
  if (dauMetric) {
    const delta = isSignificantDrop(dauMetric.trends, minDropPercent);
    if (delta) {
      pushAlert(
        alerts,
        dropAlert({
          key: "alerts.dau_drop",
          title: "DAU drop",
          metric: dauMetric,
          delta,
          minDropPercent
        })
      );
    }
  }

  const trafficMetric = metricByKey(args.metrics, "traffic.page_views");
  if (trafficMetric) {
    const delta = isSignificantDrop(trafficMetric.trends, minDropPercent);
    if (delta) {
      pushAlert(
        alerts,
        dropAlert({
          key: "alerts.traffic_drop",
          title: "Traffic drop",
          metric: trafficMetric,
          delta,
          minDropPercent
        })
      );
    }
  }

  const platformHealth = await evaluatePlatformOperationsHealth(args.prisma);
  const staleEntitlements = platformHealth.patron_entitlements.snapshots_past_stale_after;
  if (staleEntitlements > 0) {
    pushAlert(alerts, {
      key: "alerts.stale_entitlements",
      severity: staleEntitlements >= 10 ? "critical" : "warning",
      title: "Stale patron entitlements",
      message: `${staleEntitlements} entitlement snapshot(s) are past stale_after`,
      relatedMetricKey: "ops.stale_entitlements",
      relatedSection: "platform_ops",
      sourceContext: platformHealth.alerts.find((entry) =>
        entry.includes("patron_entitlement")
      ) ?? `snapshots_past_stale_after=${staleEntitlements}`
    });
  }

  const syncErrors = numericValue(metricByKey(args.metrics, "ops.supabase_sync_errors")?.value);
  const oauthUnhealthy = numericValue(metricByKey(args.metrics, "ops.oauth_unhealthy")?.value);
  const syncAlerts = platformHealth.alerts.filter(
    (entry) =>
      entry.includes("supabase_sync") ||
      entry.includes("oauth_unhealthy") ||
      entry.includes("database_check_failed")
  );
  if (
    (syncErrors !== null && syncErrors > 0) ||
    (oauthUnhealthy !== null && oauthUnhealthy > 0) ||
    syncAlerts.length > 0
  ) {
    pushAlert(alerts, {
      key: "alerts.sync_failure",
      severity: syncAlerts.some((entry) => entry.includes("database_check_failed"))
        ? "critical"
        : "warning",
      title: "Auth or sync degradation",
      message:
        syncAlerts[0] ??
        `Supabase sync errors=${syncErrors ?? 0}, unhealthy OAuth credentials=${oauthUnhealthy ?? 0}`,
      relatedMetricKey:
        oauthUnhealthy && oauthUnhealthy > 0 ? "ops.oauth_unhealthy" : "ops.supabase_sync_errors",
      relatedSection: "platform_ops",
      sourceContext: syncAlerts.join("; ") || "platform health gates"
    });
  }

  const ingestHealth = await evaluateIngestHealthGates({
    pendingRetryJobs: args.pendingRetryJobs,
    dlqRecordCount: args.dlqRecordCount
  });
  if (ingestHealth.alerts.length > 0 || args.pendingRetryJobs > 0) {
    pushAlert(alerts, {
      key: "alerts.queue_failure",
      severity:
        args.pendingRetryJobs > 50 || ingestHealth.dlq_record_count > 0 ? "critical" : "warning",
      title: "Ingest queue or DLQ pressure",
      message:
        ingestHealth.alerts[0] ??
        `pending_retry_jobs=${args.pendingRetryJobs}, dlq_records=${ingestHealth.dlq_record_count}`,
      relatedMetricKey: "ops.ingest_health",
      relatedSection: "platform_ops",
      sourceContext: ingestHealth.alerts.join("; ") || "ingest health gates"
    });
  }

  const analyticsHealth = evaluateInsightJobHealth();
  const exportHealth = evaluateExportRetrievalHealth();
  const errorAlerts = [...analyticsHealth.alerts, ...exportHealth.alerts];
  if (errorAlerts.length > 0) {
    pushAlert(alerts, {
      key: "alerts.error_spike",
      severity: "warning",
      title: "Analytics or export error spike",
      message: errorAlerts[0] ?? "Job failure ratio exceeded configured threshold",
      relatedMetricKey: analyticsHealth.alerts.length > 0 ? "ops.analytics_job_health" : "ops.export_health",
      relatedSection: "platform_ops",
      sourceContext: errorAlerts.join("; ")
    });
  }

  const revenueMetric = metricByKey(args.metrics, "revenue.gross");
  if (revenueMetric?.status === "live") {
    const delta = isSignificantDrop(revenueMetric.trends, minDropPercent);
    if (delta) {
      pushAlert(
        alerts,
        dropAlert({
          key: "alerts.revenue_dip",
          title: "Revenue dip",
          metric: revenueMetric,
          delta,
          minDropPercent
        })
      );
    }
  }

  return alerts;
}

export function applyOperatingAlertMetricPatches(
  metrics: PlatformMetricDefinition[],
  alerts: PlatformOperatingAlert[],
  generatedAt: string
): PlatformMetricDefinition[] {
  const firing = new Set(alerts.map((alert) => alert.key));

  return metrics.map((metric) => {
    if (!metric.key.startsWith("alerts.")) return metric;
    if (metric.key === "alerts.revenue_dip" && metric.status !== "live") {
      return metric;
    }

    const active = firing.has(metric.key as PlatformOperatingAlertKey);
    return {
      ...metric,
      value: active ? 1 : 0,
      status: metric.key === "alerts.revenue_dip" && metric.status !== "live" ? metric.status : "live",
      displayValue: active ? "active" : "clear",
      freshnessState: "fresh",
      lastUpdatedAt: generatedAt
    };
  });
}
