export type PlatformOperatingReviewAction = "wire" | "defer" | "remove" | "monitor";

export type PlatformOperatingReviewItem = {
  metricKey: string;
  label: string;
  section: string;
  status: string;
  freshnessState: string;
  phase: string;
  priority: "P0" | "P1";
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
    section: string;
    items: PlatformOperatingReviewItem[];
  }>;
};
