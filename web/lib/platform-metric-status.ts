/**
 * Web re-export of platform metric status taxonomy (PMD-001).
 * Canonical implementation: `src/platform-metrics/metric-status-taxonomy.ts`
 */
export {
  METRIC_STATUS_UI,
  PLATFORM_METRIC_FRESHNESS_STATES,
  PLATFORM_METRIC_STATUSES,
  isPlatformMetricStatus,
  resolveMetricDisplay,
  summarizeMetricStatuses,
  type MetricStatusBadgeTone,
  type MetricStatusUiSpec,
  type PlatformMetricFreshnessState,
  type PlatformMetricStatus,
  type ResolvedMetricDisplay
} from "../../src/platform-metrics/metric-status-taxonomy";
