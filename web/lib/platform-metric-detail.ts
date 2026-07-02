import type { PlatformOperatingAlert } from "@/lib/platform-operating-alerts";
import type { PlatformOperatingReviewItem } from "@/lib/platform-operating-review";
import type { PlatformMetricRegistryData } from "@/lib/relay-api";

export const PLATFORM_METRICS_AIRTABLE_BASE_ID = "apprid6UGT9E1KlkN";

export type PlatformMetricDetailMetric = PlatformMetricRegistryData["metrics"][number];

export type PlatformMetricSourceDocLink = {
  workItemId: string;
  path: string;
  label: string;
};

const SOURCE_DOC_BY_WORK_ITEM: Record<string, { path: string; label: string }> = {
  "PMD-041": {
    path: "docs/platform-first-party-event-contract.md",
    label: "First-party event contract"
  },
  "PMD-044": {
    path: "docs/platform-metrics-dashboard-build-plan.md",
    label: "Creator studio instrumentation"
  },
  "PMD-051": {
    path: "docs/platform-metrics-dashboard-build-plan.md",
    label: "Daily rollup job"
  },
  "PMD-052": {
    path: "docs/platform-metrics-dashboard-build-plan.md",
    label: "Trends and freshness"
  },
  "PMD-060": {
    path: "docs/platform-revenue-telemetry-contract.md",
    label: "Revenue telemetry contract"
  },
  "PMD-061": {
    path: "docs/platform-revenue-telemetry-contract.md",
    label: "Checkout instrumentation"
  },
  "PMD-071": {
    path: "docs/platform-metrics-rls-review.md",
    label: "Operator access audit + RLS review"
  },
  "PMD-081": {
    path: "docs/platform-metrics-weekly-review.md",
    label: "Weekly metrics review ritual"
  }
};

const DEFAULT_SOURCE_DOC = {
  path: "docs/platform-metrics-dashboard-build-plan.md",
  label: "Platform metrics build plan"
};

const WORK_ITEM_PATTERN = /PMD-\d+/g;

export function extractPlatformMetricWorkItemIds(...texts: Array<string | null | undefined>): string[] {
  const ids = new Set<string>();
  const pattern = new RegExp(WORK_ITEM_PATTERN.source, "g");
  for (const text of texts) {
    if (!text) continue;
    let match: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      ids.add(match[0]);
    }
  }
  return Array.from(ids).sort();
}

export function resolvePlatformMetricSourceDocs(workItemIds: string[]): PlatformMetricSourceDocLink[] {
  const links: PlatformMetricSourceDocLink[] = [];
  const seenPaths = new Set<string>();

  for (const workItemId of workItemIds) {
    const doc = SOURCE_DOC_BY_WORK_ITEM[workItemId] ?? DEFAULT_SOURCE_DOC;
    if (seenPaths.has(doc.path)) continue;
    seenPaths.add(doc.path);
    links.push({ workItemId, path: doc.path, label: doc.label });
  }

  if (links.length === 0) {
    links.push({
      workItemId: "PMD-010",
      path: DEFAULT_SOURCE_DOC.path,
      label: DEFAULT_SOURCE_DOC.label
    });
  }

  return links;
}

export function buildPlatformMetricOwnerNotes(
  metric: Pick<PlatformMetricDetailMetric, "status" | "freshnessState" | "source">,
  reviewItem?: PlatformOperatingReviewItem
): string {
  if (reviewItem?.reason) {
    return reviewItem.reason;
  }

  if (metric.freshnessState === "stale") {
    return "Rollup or source data is stale. Confirm the scheduled job and upstream tables before trusting this card.";
  }

  if (metric.freshnessState === "broken") {
    return "Freshness evaluation failed. Treat this card as untrusted until wiring is repaired.";
  }

  switch (metric.status) {
    case "not_wired":
      return "No backend wiring yet. Track implementation on the Platform Metrics Dashboard Airtable backlog.";
    case "collecting":
      return "Events or rollups are landing, but the metric may not meet the live definition yet.";
    case "deferred":
      return "Intentionally deferred. Confirm the weekly review decision before re-prioritizing.";
    case "estimated":
      return "Value is an estimate from a proxy or partial source. Do not treat as audited revenue or activity.";
    case "manual_import":
      return "Populated from manual import flows. Validate freshness before operator decisions.";
    case "live":
      return "Wired and within freshness thresholds. Use for weekly operating review.";
    default:
      return metric.source;
  }
}

export function buildPlatformMetricWiringDependency(
  metric: Pick<PlatformMetricDetailMetric, "status" | "source" | "key">,
  reviewItem?: PlatformOperatingReviewItem
): string {
  if (reviewItem) {
    const action =
      reviewItem.recommendedAction === "wire"
        ? "Wire next"
        : reviewItem.recommendedAction === "defer"
          ? "Defer"
          : reviewItem.recommendedAction === "remove"
            ? "Remove from dashboard"
            : "Monitor";
    return `${action}: ${reviewItem.reason}`;
  }

  const workItems = extractPlatformMetricWorkItemIds(metric.source);
  if (workItems.length > 0) {
    return `Implementation tracked in ${workItems.join(", ")}.`;
  }

  if (metric.status === "not_wired") {
    return "Blocked on registry wiring in `wire-existing-sources.ts` and any upstream instrumentation.";
  }

  if (metric.status === "live" || metric.status === "collecting") {
    return `Wired via ${metric.source}.`;
  }

  return `No active wiring dependency recorded for ${metric.key}.`;
}

export type PlatformMetricDetailContext = {
  metric: PlatformMetricDetailMetric;
  reviewItem?: PlatformOperatingReviewItem;
  alerts: PlatformOperatingAlert[];
  workItemIds: string[];
  sourceDocs: PlatformMetricSourceDocLink[];
  ownerNotes: string;
  wiringDependency: string;
};

export function buildPlatformMetricDetailContext(input: {
  metric: PlatformMetricDetailMetric;
  reviewItem?: PlatformOperatingReviewItem;
  alerts?: PlatformOperatingAlert[];
}): PlatformMetricDetailContext {
  const workItemIds = extractPlatformMetricWorkItemIds(input.metric.source, input.reviewItem?.reason);
  return {
    metric: input.metric,
    reviewItem: input.reviewItem,
    alerts: (input.alerts ?? []).filter((alert) => alert.relatedMetricKey === input.metric.key),
    workItemIds,
    sourceDocs: resolvePlatformMetricSourceDocs(workItemIds),
    ownerNotes: buildPlatformMetricOwnerNotes(input.metric, input.reviewItem),
    wiringDependency: buildPlatformMetricWiringDependency(input.metric, input.reviewItem)
  };
}
