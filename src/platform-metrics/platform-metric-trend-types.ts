/** PMD-052 — day/week/month deltas for rollup-backed dashboard metrics. */

export type PlatformMetricTrendDirection = "up" | "down" | "flat" | "unknown";

export type PlatformMetricTrendDelta = {
  direction: PlatformMetricTrendDirection;
  delta: number | null;
  deltaPercent: number | null;
  priorValue: number | null;
  currentValue: number | null;
  /** False when prior anchor day is missing — UI must hide the arrow. */
  sufficientHistory: boolean;
};

export type PlatformMetricTrends = {
  dod: PlatformMetricTrendDelta;
  wow: PlatformMetricTrendDelta;
  mom: PlatformMetricTrendDelta;
};

export const ROLLUP_TREND_METRIC_KEYS = [
  "traffic.profile_views",
  "traffic.gallery_views",
  "traffic.page_views",
  "traffic.unique_visitors",
  "activity.dau",
  "activity.wau",
  "activity.mau",
  "revenue.gross"
] as const;

export type RollupTrendMetricKey = (typeof ROLLUP_TREND_METRIC_KEYS)[number];

export function isRollupTrendMetricKey(key: string): key is RollupTrendMetricKey {
  return (ROLLUP_TREND_METRIC_KEYS as readonly string[]).includes(key);
}
