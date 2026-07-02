import type { PrismaClient } from "@prisma/client";
import {
  resolveMetricDisplay,
  summarizeMetricStatuses
} from "./metric-status-taxonomy.js";
import { getMetricRegistrySeed } from "./metric-registry-seed.js";
import type {
  PlatformMetricDefinition,
  PlatformMetricRegistryResponse,
  PlatformMetricSectionKey
} from "./metric-registry-types.js";
import { buildRollupTrendsForMetric } from "./platform-metric-trend-service.js";
import { isRollupTrendMetricKey } from "./platform-metric-trend-types.js";
import { wireExistingPlatformMetricSources } from "./wire-existing-sources.js";
import {
  applyOperatingAlertMetricPatches,
  evaluatePlatformOperatingAlerts
} from "./platform-operating-alert-service.js";
import { buildPlatformOperatingReview } from "./platform-operating-review-service.js";

const SECTIONS: PlatformMetricRegistryResponse["sections"] = [
  {
    key: "data_coverage",
    title: "Data Coverage",
    description: "Shows whether the analytics program itself is healthy."
  },
  {
    key: "traffic",
    title: "Traffic",
    description: "Shows whether Relay surfaces are being visited."
  },
  {
    key: "activity",
    title: "Activity",
    description: "Shows whether people are returning and using the product."
  },
  {
    key: "growth",
    title: "Growth",
    description: "Shows whether the network is expanding."
  },
  {
    key: "revenue",
    title: "Revenue",
    description: "Shows whether Relay-native monetization is working."
  },
  {
    key: "creator_health",
    title: "Creator Health",
    description: "Shows whether creators reach value."
  },
  {
    key: "patron_health",
    title: "Patron Health",
    description: "Shows whether patrons have a useful return loop."
  },
  {
    key: "content_performance",
    title: "Content Performance",
    description: "Shows which content drives attention and engagement."
  },
  {
    key: "platform_ops",
    title: "Platform Ops",
    description: "Shows whether the system is healthy enough to trust analytics."
  }
];

function applyCoverageRollups(
  metrics: PlatformMetricDefinition[],
  generatedAt: string
): PlatformMetricDefinition[] {
  const isMetaMetric = (key: string) => key.startsWith("coverage.") || key.startsWith("alerts.");
  const productMetrics = metrics.filter((metric) => !isMetaMetric(metric.key));
  const summary = summarizeMetricStatuses(productMetrics.map((metric) => metric.status));
  const pendingInstrumentation = productMetrics.filter(
    (metric) => metric.status === "pending_instrumentation"
  ).length;
  const deferred = productMetrics.filter((metric) => metric.status === "deferred").length;

  const rollup: Record<string, number | string | null> = {
    "coverage.total_metrics": productMetrics.length,
    "coverage.live_metrics": summary.live,
    "coverage.collecting_metrics": summary.collecting,
    "coverage.not_wired_metrics": summary.not_wired,
    "coverage.pending_instrumentation_metrics": pendingInstrumentation,
    "coverage.deferred_metrics": deferred,
    "coverage.manual_import_metrics": summary.manual_import,
    "coverage.stale_metrics": productMetrics.filter(
      (metric) => metric.freshnessState === "stale"
    ).length
  };

  return metrics.map((metric) => {
    if (!(metric.key in rollup)) return metric;
    return {
      ...metric,
      value: rollup[metric.key] ?? null,
      status: "live",
      freshnessState: "fresh",
      lastUpdatedAt: generatedAt,
      displayValue: resolveMetricDisplay({
        status: "live",
        value: rollup[metric.key] ?? null,
        freshnessState: "fresh"
      }).displayValue
    };
  });
}

async function applyRollupTrends(
  prisma: PrismaClient | undefined,
  metrics: PlatformMetricDefinition[]
): Promise<PlatformMetricDefinition[]> {
  if (!prisma) return metrics;

  return Promise.all(
    metrics.map(async (metric) => {
      if (!isRollupTrendMetricKey(metric.key)) return metric;
      const trends = await buildRollupTrendsForMetric({ prisma, metricKey: metric.key });
      if (!trends) return metric;
      return { ...metric, trends };
    })
  );
}

export async function buildPlatformMetricRegistry(args: {
  prisma: PrismaClient | undefined;
  pendingRetryJobs: number;
  dlqRecordCount: number;
}): Promise<PlatformMetricRegistryResponse> {
  const generatedAt = new Date().toISOString();
  const wired = await wireExistingPlatformMetricSources(args);

  const metrics: PlatformMetricDefinition[] = getMetricRegistrySeed().map((seed) => {
    const patch = wired.get(seed.key);
    const status = patch?.status ?? seed.initialStatus;
    const value = patch?.value ?? null;
    const freshnessState = patch?.freshnessState ?? "unknown";
    const display = resolveMetricDisplay({ status, value, freshnessState });

    return {
      key: seed.key,
      label: seed.label,
      section: seed.section,
      phase: seed.phase,
      status,
      scope: seed.scope,
      definition: seed.definition,
      formula: seed.formula,
      source: seed.source,
      value,
      displayValue: display.displayValue,
      freshnessState,
      lastUpdatedAt: patch?.lastUpdatedAt ?? null,
      priority: seed.priority
    };
  });

  const withCoverage = applyCoverageRollups(metrics, generatedAt);
  const withTrends = await applyRollupTrends(args.prisma, withCoverage);
  const operatingAlerts = await evaluatePlatformOperatingAlerts({
    prisma: args.prisma,
    pendingRetryJobs: args.pendingRetryJobs,
    dlqRecordCount: args.dlqRecordCount,
    metrics: withTrends
  });
  const withAlerts = applyOperatingAlertMetricPatches(withTrends, operatingAlerts, generatedAt);
  const operatingReview = buildPlatformOperatingReview({
    generatedAt,
    metrics: withAlerts,
    alerts: operatingAlerts
  });
  const coverage = summarizeMetricStatuses(withAlerts.map((metric) => metric.status));

  return {
    generatedAt,
    prismaConfigured: Boolean(args.prisma),
    sections: SECTIONS,
    metrics: withAlerts,
    coverage: {
      total: coverage.total,
      live: coverage.live,
      collecting: coverage.collecting,
      not_wired: coverage.not_wired,
      estimated: coverage.estimated,
      manual_import: coverage.manual_import,
      deferred: coverage.deferred
    },
    alerts: operatingAlerts,
    operatingReview
  };
}
