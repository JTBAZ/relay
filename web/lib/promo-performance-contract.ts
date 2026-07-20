/**
 * Client mirror of src/marketing/promo-performance-contract.ts
 */

export type PromoPerformanceMetricState =
  | { status: "unavailable"; reason?: string }
  | { status: "zero" }
  | { status: "value"; value: number };

export type PromoPerformanceSummary = {
  promo_piece_id: string;
  post_id: string | null;
  window_start: string | null;
  window_end: string | null;
  impressions: PromoPerformanceMetricState;
  clicks: PromoPerformanceMetricState;
  conversions: PromoPerformanceMetricState;
  conversion_value: PromoPerformanceMetricState;
};

export type PromoPerformanceAvailability =
  | { available: false; reason: string }
  | { available: true; summary: PromoPerformanceSummary };

export function unavailablePromoPerformance(args: {
  promo_piece_id: string;
  post_id?: string | null;
  reason?: string;
}): PromoPerformanceAvailability {
  return {
    available: false,
    reason:
      args.reason?.trim() ||
      "No distribution data yet — placement and conversion ingestion are not wired."
  };
}

export function formatPromoPerformanceMetric(
  metric: PromoPerformanceMetricState
): string {
  if (metric.status === "unavailable") return "—";
  if (metric.status === "zero") return "0";
  return String(metric.value);
}
