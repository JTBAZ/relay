/**
 * Honest Promo Pool performance contract.
 * No numeric value is shown unless a real backend owns it.
 * Zero and unavailable are distinct states.
 */

export type PromoPerformanceMetricState =
  | { status: "unavailable"; reason?: string }
  | { status: "zero" }
  | { status: "value"; value: number };

export type PromoPerformanceSummary = {
  promo_piece_id: string;
  post_id: string | null;
  /** ISO window start; null when measurement is unavailable. */
  window_start: string | null;
  window_end: string | null;
  impressions: PromoPerformanceMetricState;
  clicks: PromoPerformanceMetricState;
  conversions: PromoPerformanceMetricState;
  /** Monetary value in minor units when known; unavailable until conversion ingestion exists. */
  conversion_value: PromoPerformanceMetricState;
};

export type PromoPerformanceAvailability =
  | { available: false; reason: string }
  | { available: true; summary: PromoPerformanceSummary };

/** Placeholder until a real distribution/attribution service exists. */
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
