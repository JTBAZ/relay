import type { PlatformMetricSectionKey } from "./metric-registry-types.js";

export type PlatformOperatingAlertSeverity = "warning" | "critical";

export const PLATFORM_OPERATING_ALERT_KEYS = [
  "alerts.dau_drop",
  "alerts.traffic_drop",
  "alerts.revenue_dip",
  "alerts.sync_failure",
  "alerts.stale_entitlements",
  "alerts.error_spike",
  "alerts.queue_failure"
] as const;

export type PlatformOperatingAlertKey = (typeof PLATFORM_OPERATING_ALERT_KEYS)[number];

export type PlatformOperatingAlert = {
  key: PlatformOperatingAlertKey;
  severity: PlatformOperatingAlertSeverity;
  title: string;
  message: string;
  /** Dashboard metric card to inspect for source context. */
  relatedMetricKey: string;
  relatedSection: PlatformMetricSectionKey;
  sourceContext: string;
};
