/**
 * Web re-export of platform metric status taxonomy (PMD-001).
 * Canonical: `src/platform-metrics/metric-status-taxonomy.ts`
 * Vendored for Coolify Nixpacks (`base_directory=/web`): `web/_shared/...`
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
} from "../_shared/platform-metrics/metric-status-taxonomy";
