/** PMD-052 — trend delta display helpers for platform metric cards. */

export type PlatformMetricTrendDirection = "up" | "down" | "flat" | "unknown";

export type PlatformMetricTrendDelta = {
  direction: PlatformMetricTrendDirection;
  delta: number | null;
  deltaPercent: number | null;
  priorValue: number | null;
  currentValue: number | null;
  sufficientHistory: boolean;
};

export type PlatformMetricTrends = {
  dod: PlatformMetricTrendDelta;
  wow: PlatformMetricTrendDelta;
  mom: PlatformMetricTrendDelta;
};

export function formatTrendDeltaLabel(delta: PlatformMetricTrendDelta): string | null {
  if (!delta.sufficientHistory || delta.deltaPercent == null) return null;
  const sign = delta.deltaPercent > 0 ? "+" : "";
  return `${sign}${delta.deltaPercent}%`;
}

export function trendToneClass(direction: PlatformMetricTrendDirection): string {
  if (direction === "up") return "text-[#7bd6a2]";
  if (direction === "down") return "text-[#f0a8a8]";
  if (direction === "flat") return "text-[#9a9a9a]";
  return "text-[#777]";
}
