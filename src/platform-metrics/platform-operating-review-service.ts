import type { PlatformMetricStatus } from "./metric-status-taxonomy.js";
import type {
  PlatformMetricDefinition,
  PlatformMetricSectionKey
} from "./metric-registry-types.js";
import type { PlatformOperatingAlert } from "./platform-operating-alert-types.js";

export type PlatformOperatingReviewAction = "wire" | "defer" | "remove" | "monitor";

export type PlatformOperatingReviewItem = {
  metricKey: string;
  label: string;
  section: PlatformMetricSectionKey;
  status: PlatformMetricStatus;
  freshnessState: PlatformMetricDefinition["freshnessState"];
  phase: string;
  priority: PlatformMetricDefinition["priority"];
  recommendedAction: PlatformOperatingReviewAction;
  reason: string;
};

export type PlatformOperatingReviewSummary = {
  generatedAt: string;
  checklist: string[];
  totals: {
    needsReview: number;
    notWired: number;
    pendingInstrumentation: number;
    deferred: number;
    stale: number;
    activeAlerts: number;
  };
  items: PlatformOperatingReviewItem[];
  bySection: Array<{
    section: PlatformMetricSectionKey;
    items: PlatformOperatingReviewItem[];
  }>;
};

const REVIEW_CHECKLIST = [
  "Start with the Data Coverage scoreboard — confirm live % and stale count.",
  "Review active operating alerts and follow links to source metric cards.",
  "Triage each queue item: wire instrumentation, defer to a later phase, or remove from scope.",
  "Record decisions on the Platform Metrics Dashboard Airtable table (Status + Implementation Notes)."
] as const;

function isRollupMetricKey(key: string): boolean {
  return key.startsWith("coverage.") || key.startsWith("alerts.");
}

function recommendReviewAction(
  metric: PlatformMetricDefinition
): PlatformOperatingReviewAction {
  if (metric.status === "deferred") return "monitor";
  if (metric.status === "pending_instrumentation") return "wire";
  if (metric.status === "not_wired") {
    return metric.priority === "P0" ? "wire" : "defer";
  }
  if (metric.freshnessState === "stale" || metric.freshnessState === "broken") {
    return "monitor";
  }
  return "monitor";
}

function reviewReason(
  metric: PlatformMetricDefinition,
  action: PlatformOperatingReviewAction
): string {
  if (metric.status === "not_wired") {
    return action === "wire"
      ? "P0 metric lacks instrumentation — schedule wiring work item."
      : "Lower-priority gap — defer or descope in Airtable if not on roadmap.";
  }
  if (metric.status === "pending_instrumentation") {
    return "Source is defined but events or rollups are not emitting yet.";
  }
  if (metric.status === "deferred") {
    return "Intentionally deferred — confirm still out of scope or promote to active backlog.";
  }
  if (metric.freshnessState === "stale") {
    return "Live metric is stale — check rollup job or upstream source freshness.";
  }
  if (metric.freshnessState === "broken") {
    return "Source or rollup failed — investigate before trusting the card.";
  }
  return "Collecting or estimated — monitor until live or defer.";
}

function needsWeeklyReview(metric: PlatformMetricDefinition): boolean {
  if (isRollupMetricKey(metric.key)) return false;
  if (metric.status === "not_wired" || metric.status === "pending_instrumentation") {
    return true;
  }
  if (metric.status === "deferred") return true;
  if (metric.freshnessState === "stale" || metric.freshnessState === "broken") {
    return true;
  }
  return false;
}

export function buildPlatformOperatingReview(args: {
  generatedAt: string;
  metrics: PlatformMetricDefinition[];
  alerts: PlatformOperatingAlert[];
}): PlatformOperatingReviewSummary {
  const actionableMetrics = args.metrics.filter(needsWeeklyReview);

  const items: PlatformOperatingReviewItem[] = actionableMetrics.map((metric) => {
    const recommendedAction = recommendReviewAction(metric);
    return {
      metricKey: metric.key,
      label: metric.label,
      section: metric.section,
      status: metric.status,
      freshnessState: metric.freshnessState,
      phase: metric.phase,
      priority: metric.priority,
      recommendedAction,
      reason: reviewReason(metric, recommendedAction)
    };
  });

  items.sort((a, b) => {
    const priorityRank = (priority: PlatformOperatingReviewItem["priority"]) =>
      priority === "P0" ? 0 : 1;
    const statusRank = (status: PlatformMetricStatus) => {
      if (status === "not_wired") return 0;
      if (status === "pending_instrumentation") return 1;
      if (status === "deferred") return 2;
      return 3;
    };
    const byPriority = priorityRank(a.priority) - priorityRank(b.priority);
    if (byPriority !== 0) return byPriority;
    const byStatus = statusRank(a.status) - statusRank(b.status);
    if (byStatus !== 0) return byStatus;
    return a.label.localeCompare(b.label);
  });

  const sectionOrder = new Map<string, number>();
  for (const [index, metric] of args.metrics.entries()) {
    if (!sectionOrder.has(metric.section)) {
      sectionOrder.set(metric.section, index);
    }
  }

  const sectionKeys = [...new Set(items.map((item) => item.section))].sort(
    (a, b) => (sectionOrder.get(a) ?? 0) - (sectionOrder.get(b) ?? 0)
  );

  const bySection = sectionKeys.map((section) => ({
    section,
    items: items.filter((item) => item.section === section)
  }));

  const notWired = args.metrics.filter(
    (metric) => !isRollupMetricKey(metric.key) && metric.status === "not_wired"
  ).length;
  const pendingInstrumentation = args.metrics.filter(
    (metric) =>
      !isRollupMetricKey(metric.key) && metric.status === "pending_instrumentation"
  ).length;
  const deferred = args.metrics.filter(
    (metric) => !isRollupMetricKey(metric.key) && metric.status === "deferred"
  ).length;
  const stale = args.metrics.filter(
    (metric) => !isRollupMetricKey(metric.key) && metric.freshnessState === "stale"
  ).length;

  return {
    generatedAt: args.generatedAt,
    checklist: [...REVIEW_CHECKLIST],
    totals: {
      needsReview: items.length,
      notWired,
      pendingInstrumentation,
      deferred,
      stale,
      activeAlerts: args.alerts.length
    },
    items,
    bySection
  };
}
