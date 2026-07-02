import type { PlatformMetricFreshnessState, PlatformMetricStatus } from "./metric-status-taxonomy.js";
import type { PlatformMetricTrends } from "./platform-metric-trend-types.js";
import type { PlatformOperatingAlert } from "./platform-operating-alert-types.js";
import type { PlatformOperatingReviewSummary } from "./platform-operating-review-service.js";

export type PlatformMetricSectionKey =
  | "data_coverage"
  | "traffic"
  | "activity"
  | "growth"
  | "revenue"
  | "creator_health"
  | "patron_health"
  | "content_performance"
  | "platform_ops";

export type PlatformMetricScope =
  | "platform"
  | "creator"
  | "patron"
  | "post"
  | "session"
  | "system";

export type PlatformMetricSeedEntry = {
  key: string;
  label: string;
  section: PlatformMetricSectionKey;
  definition: string;
  formula: string;
  source: string;
  initialStatus: PlatformMetricStatus;
  phase: string;
  priority: "P0" | "P1";
  scope: PlatformMetricScope;
};

export type PlatformMetricDefinition = {
  key: string;
  label: string;
  section: PlatformMetricSectionKey;
  phase: string;
  status: PlatformMetricStatus;
  scope: PlatformMetricScope;
  definition: string;
  formula: string;
  source: string;
  value: number | string | null;
  displayValue: string;
  freshnessState: PlatformMetricFreshnessState;
  lastUpdatedAt: string | null;
  priority: "P0" | "P1";
  /** PMD-052 — present for rollup-backed metrics when history allows. */
  trends?: PlatformMetricTrends;
};

export type PlatformMetricRegistryResponse = {
  generatedAt: string;
  prismaConfigured: boolean;
  sections: Array<{
    key: PlatformMetricSectionKey;
    title: string;
    description: string;
  }>;
  metrics: PlatformMetricDefinition[];
  coverage: {
    total: number;
    live: number;
    collecting: number;
    not_wired: number;
    estimated: number;
    manual_import: number;
    deferred: number;
  };
  /** PMD-080 — active operating alerts with links back to metric cards. */
  alerts: PlatformOperatingAlert[];
  /** PMD-081 — weekly triage queue for missing/stale/deferred metrics. */
  operatingReview: PlatformOperatingReviewSummary;
};

export type WiredMetricPatch = {
  value?: number | string | null;
  status?: PlatformMetricStatus;
  freshnessState?: PlatformMetricFreshnessState;
  lastUpdatedAt?: string;
};
