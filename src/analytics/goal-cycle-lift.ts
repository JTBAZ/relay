/**
 * Campaign-level estimated lift (VS4-T03) — pure method v1.
 * Never emits person-level rows. Never labels estimate as deterministic.
 */

export const CAMPAIGN_LIFT_METHOD_VERSION = "campaign-lift-v1" as const;

/** Canonical guards from CONVERSION_ATTRIBUTION.md — do not lower without human gate. */
export const CAMPAIGN_LIFT_V1_GUARDS = {
  min_complete_days: 14,
  min_coverage_ratio: 0.8,
  min_combined_support_events: 3
} as const;

export const CAMPAIGN_LIFT_CAVEAT =
  "Campaign-level correlated lift; correlation, not individual attribution.";

export type LiftWindowStats = {
  /** Creator-local day YYYY-MM-DD (inclusive). */
  start_day: string;
  end_day: string;
  complete_days: number;
  /** Daily source coverage in [0, 1]. */
  coverage_ratio: number;
  paid_support_event_count: number;
};

export type CalculateCampaignLiftInput = {
  baseline: LiftWindowStats;
  observation: LiftWindowStats;
  /** Why deterministic linkage was unavailable for this campaign window. */
  reason_deterministic_unavailable?: string;
};

export type EstimatedLiftResult = {
  status: "estimated";
  method: typeof CAMPAIGN_LIFT_METHOD_VERSION;
  observed_count: number;
  expected_count: number;
  lift_count: number;
  confidence: "medium" | "low";
  coverage: "complete" | "partial";
  caveat: typeof CAMPAIGN_LIFT_CAVEAT;
  reason_deterministic_unavailable: string;
  baseline: LiftWindowStats;
  observation: LiftWindowStats;
};

export type InsufficientLiftResult = {
  status: "insufficient";
  method: typeof CAMPAIGN_LIFT_METHOD_VERSION;
  reasons: string[];
  caveat: "Insufficient evidence for estimated lift; do not coerce to zero.";
  reason_deterministic_unavailable: string;
  baseline: LiftWindowStats;
  observation: LiftWindowStats;
};

export type CalculateCampaignLiftResult = EstimatedLiftResult | InsufficientLiftResult;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function validateWindow(label: "baseline" | "observation", w: LiftWindowStats): string[] {
  const reasons: string[] = [];
  if (!Number.isFinite(w.complete_days) || w.complete_days < 0) {
    reasons.push(`${label}_days_invalid`);
  }
  if (w.complete_days < CAMPAIGN_LIFT_V1_GUARDS.min_complete_days) {
    reasons.push(`${label}_days_below_${CAMPAIGN_LIFT_V1_GUARDS.min_complete_days}`);
  }
  if (
    !Number.isFinite(w.coverage_ratio) ||
    w.coverage_ratio < 0 ||
    w.coverage_ratio > 1
  ) {
    reasons.push(`${label}_coverage_invalid`);
  } else if (w.coverage_ratio < CAMPAIGN_LIFT_V1_GUARDS.min_coverage_ratio) {
    reasons.push(`${label}_coverage_below_80pct`);
  }
  if (!Number.isFinite(w.paid_support_event_count) || w.paid_support_event_count < 0) {
    reasons.push(`${label}_event_count_invalid`);
  }
  return reasons;
}

/**
 * Pure method-v1 campaign-window lift.
 * Returns `insufficient` when 14-day / 80% coverage / 3-event guards fail.
 */
export function calculateCampaignLift(
  input: CalculateCampaignLiftInput
): CalculateCampaignLiftResult {
  const reason =
    input.reason_deterministic_unavailable?.trim() ||
    "No consented Relay campaign linkage for individual support events.";

  const reasons = [
    ...validateWindow("baseline", input.baseline),
    ...validateWindow("observation", input.observation)
  ];

  const combined =
    input.baseline.paid_support_event_count + input.observation.paid_support_event_count;
  if (combined < CAMPAIGN_LIFT_V1_GUARDS.min_combined_support_events) {
    reasons.push(`combined_events_below_${CAMPAIGN_LIFT_V1_GUARDS.min_combined_support_events}`);
  }

  if (reasons.length > 0) {
    return {
      status: "insufficient",
      method: CAMPAIGN_LIFT_METHOD_VERSION,
      reasons,
      caveat: "Insufficient evidence for estimated lift; do not coerce to zero.",
      reason_deterministic_unavailable: reason,
      baseline: input.baseline,
      observation: input.observation
    };
  }

  const baselineRate =
    input.baseline.complete_days > 0
      ? input.baseline.paid_support_event_count / input.baseline.complete_days
      : 0;
  const expected = round2(baselineRate * input.observation.complete_days);
  const observed = input.observation.paid_support_event_count;
  const lift = round2(observed - expected);

  const coverageComplete =
    input.baseline.coverage_ratio >= 0.95 && input.observation.coverage_ratio >= 0.95;

  return {
    status: "estimated",
    method: CAMPAIGN_LIFT_METHOD_VERSION,
    observed_count: observed,
    expected_count: expected,
    lift_count: lift,
    confidence: coverageComplete && combined >= 6 ? "medium" : "low",
    coverage: coverageComplete ? "complete" : "partial",
    caveat: CAMPAIGN_LIFT_CAVEAT,
    reason_deterministic_unavailable: reason,
    baseline: input.baseline,
    observation: input.observation
  };
}
