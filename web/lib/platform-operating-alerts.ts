export type PlatformOperatingAlertSeverity = "warning" | "critical";

export type PlatformOperatingAlert = {
  key: string;
  severity: PlatformOperatingAlertSeverity;
  title: string;
  message: string;
  relatedMetricKey: string;
  relatedSection: string;
  sourceContext: string;
};
