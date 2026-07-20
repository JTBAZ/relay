/**
 * Paid-support planner facts + attribution snapshots (VS4-T04).
 * Strips patron/transaction identity before Coach consumption.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import type { GoalCycleOutcomeSummary } from "../goal-cycle/contracts.js";
import { GoalCycleNotFoundError } from "../goal-cycle/goal-cycle-service.js";
import { findGoalCycleForCreator } from "../goal-cycle/goal-cycle-store.js";
import {
  calculateCampaignLift,
  CAMPAIGN_LIFT_METHOD_VERSION,
  type CalculateCampaignLiftResult,
  type LiftWindowStats
} from "./goal-cycle-lift.js";
import { listDeterministicOutcomesForCycle } from "./goal-cycle-attribution-service.js";

export type PaidSupportWindowInput = {
  baseline: LiftWindowStats;
  observation: LiftWindowStats;
};

export type PaidSupportFacts = {
  cycle_id: string;
  goal_kind: string;
  target: {
    label: string;
    threshold: number | null;
  };
  deterministic: {
    count: number;
    amount_minor: number | null;
    currency: string | null;
    /** Opaque outcome ids only — no patron fields. */
    outcome_ids: string[];
  };
  estimated: CalculateCampaignLiftResult | null;
  coverage: "complete" | "partial" | "unavailable";
  confidence: "high" | "medium" | "low" | "unknown";
  freshness_seconds: number | null;
  /**
   * Primary label for planner/UI.
   * `zero` = deterministic complete coverage with count 0 (not an estimate).
   * `unavailable` = no usable coverage.
   */
  attribution: "deterministic" | "estimated" | "insufficient" | "zero" | "unavailable";
  caveat: string | null;
  /** Coach-safe outcome summary (wire contract). */
  outcome_summary: GoalCycleOutcomeSummary;
};

function singleCurrency(
  amounts: Array<{ amountMinor: number | null; currency: string | null }>
): { amount_minor: number | null; currency: string | null } {
  const withAmount = amounts.filter((a) => a.amountMinor != null && a.currency);
  if (withAmount.length === 0) return { amount_minor: null, currency: null };
  const currencies = new Set(withAmount.map((a) => a.currency));
  if (currencies.size !== 1) {
    // Mixed currencies — never sum without approved conversion (human gate).
    return { amount_minor: null, currency: null };
  }
  const currency = withAmount[0]!.currency;
  const sum = withAmount.reduce((acc, a) => acc + (a.amountMinor ?? 0), 0);
  return { amount_minor: sum, currency };
}

/**
 * Build planner-facing paid-support facts. Never includes patron identity.
 */
export async function getPaidSupportFacts(
  prisma: PrismaClient,
  creatorId: string,
  cycleId: string,
  options: {
    windows?: PaidSupportWindowInput;
    targetLabel?: string;
    targetThreshold?: number | null;
    now?: Date;
    reasonDeterministicUnavailable?: string;
  } = {}
): Promise<PaidSupportFacts> {
  const cid = creatorId.trim();
  const id = cycleId.trim();
  const cycle = await findGoalCycleForCreator(prisma, cid, id);
  if (!cycle) throw new GoalCycleNotFoundError();

  const now = options.now ?? new Date();
  const outcomes = await listDeterministicOutcomesForCycle(prisma, cid, id);
  const active = outcomes.filter((o) => o.reversal_state !== "reversed");
  const deterministicCount = active.length;
  const money = singleCurrency(
    active.map((o) => ({ amountMinor: o.amount_minor, currency: o.currency }))
  );

  const freshnessCandidates = active
    .map((o) => o.freshness_seconds)
    .filter((n): n is number => typeof n === "number");
  const freshness_seconds =
    freshnessCandidates.length > 0 ? Math.min(...freshnessCandidates) : null;

  let estimated: CalculateCampaignLiftResult | null = null;
  if (options.windows) {
    estimated = calculateCampaignLift({
      baseline: options.windows.baseline,
      observation: options.windows.observation,
      reason_deterministic_unavailable: options.reasonDeterministicUnavailable
    });
  }

  const targetLabel = options.targetLabel?.trim() || "Paid support events";
  const threshold =
    typeof options.targetThreshold === "number" ? options.targetThreshold : null;

  // Primary attribution selection
  let attribution: PaidSupportFacts["attribution"];
  let coverage: PaidSupportFacts["coverage"];
  let confidence: PaidSupportFacts["confidence"];
  let caveat: string | null = null;
  let actualLabel: string | null;

  if (deterministicCount > 0) {
    attribution = "deterministic";
    coverage = "complete";
    confidence = "high";
    actualLabel = `${deterministicCount} deterministic paid-support event${deterministicCount === 1 ? "" : "s"}`;
    caveat = null;
    // Estimated may still be computed for audit but is not primary.
  } else if (
    options.windows &&
    options.windows.observation.coverage_ratio >= 0.8 &&
    options.windows.observation.complete_days >= 14 &&
    deterministicCount === 0 &&
    options.windows.observation.paid_support_event_count === 0
  ) {
    // Deterministic zero with usable coverage stays zero — never convert to estimate.
    attribution = "zero";
    coverage = "complete";
    confidence = "high";
    actualLabel = "0 paid-support events (deterministic coverage)";
    caveat = "Coverage complete; zero paid-support events in window.";
    estimated = null;
  } else if (estimated?.status === "estimated") {
    attribution = "estimated";
    coverage = estimated.coverage;
    confidence = estimated.confidence;
    actualLabel = `Estimated lift ${estimated.lift_count} (observed ${estimated.observed_count}, expected ${estimated.expected_count})`;
    caveat = estimated.caveat;
  } else if (estimated?.status === "insufficient") {
    attribution = "insufficient";
    coverage = "partial";
    confidence = "low";
    actualLabel = null;
    caveat = estimated.caveat;
  } else {
    attribution = "unavailable";
    coverage = "unavailable";
    confidence = "unknown";
    actualLabel = null;
    caveat = "Source coverage missing; do not coerce to zero.";
  }

  void now;

  const outcome_summary: GoalCycleOutcomeSummary = {
    target_label: threshold != null ? `${targetLabel} (≥${threshold})` : targetLabel,
    actual_label: actualLabel,
    confidence,
    attribution:
      attribution === "zero"
        ? "deterministic"
        : attribution === "unavailable"
          ? "insufficient"
          : attribution === "deterministic" ||
              attribution === "estimated" ||
              attribution === "insufficient"
            ? attribution
            : null,
    freshness_seconds
  };

  return {
    cycle_id: id,
    goal_kind: cycle.goalKind,
    target: { label: targetLabel, threshold },
    deterministic: {
      count: deterministicCount,
      amount_minor: money.amount_minor,
      currency: money.currency,
      outcome_ids: active.map((o) => o.outcome_id)
    },
    estimated,
    coverage,
    confidence,
    freshness_seconds,
    attribution,
    caveat,
    outcome_summary
  };
}

/**
 * Persist a cycle attribution snapshot for a labeled window.
 */
export async function snapshotCycleAttribution(
  prisma: PrismaClient,
  creatorId: string,
  cycleId: string,
  input: {
    windowKey?: string;
    windows?: PaidSupportWindowInput;
    targetLabel?: string;
    targetThreshold?: number | null;
    now?: Date;
    reasonDeterministicUnavailable?: string;
  } = {}
): Promise<{ snapshot_id: string; facts: PaidSupportFacts }> {
  const facts = await getPaidSupportFacts(prisma, creatorId, cycleId, input);
  const now = input.now ?? new Date();
  const windowKey = input.windowKey?.trim() || "active";

  const row = await prisma.goalCycleAttributionSnapshot.upsert({
    where: {
      cycleId_windowKey: { cycleId: facts.cycle_id, windowKey }
    },
    create: {
      creatorId: creatorId.trim(),
      cycleId: facts.cycle_id,
      windowKey,
      targetJson: facts.target as unknown as Prisma.InputJsonValue,
      deterministicCount: facts.deterministic.count,
      deterministicAmountMinor: facts.deterministic.amount_minor,
      deterministicCurrency: facts.deterministic.currency,
      estimatedLiftJson: (facts.estimated ?? null) as unknown as Prisma.InputJsonValue,
      baselineWindowJson: (input.windows?.baseline ?? {}) as unknown as Prisma.InputJsonValue,
      observationWindowJson: (input.windows?.observation ??
        {}) as unknown as Prisma.InputJsonValue,
      coverage: facts.coverage,
      confidence: facts.confidence,
      calculatedAt: now
    },
    update: {
      targetJson: facts.target as unknown as Prisma.InputJsonValue,
      deterministicCount: facts.deterministic.count,
      deterministicAmountMinor: facts.deterministic.amount_minor,
      deterministicCurrency: facts.deterministic.currency,
      estimatedLiftJson: (facts.estimated ?? null) as unknown as Prisma.InputJsonValue,
      baselineWindowJson: (input.windows?.baseline ?? {}) as unknown as Prisma.InputJsonValue,
      observationWindowJson: (input.windows?.observation ??
        {}) as unknown as Prisma.InputJsonValue,
      coverage: facts.coverage,
      confidence: facts.confidence,
      calculatedAt: now
    }
  });

  // Keep cycle outcome shell aligned for VS9 without patron details.
  await prisma.creatorGoalCycleOutcome.upsert({
    where: { cycleId: facts.cycle_id },
    create: {
      cycleId: facts.cycle_id,
      targetJson: facts.target as unknown as Prisma.InputJsonValue,
      actualJson: {
        attribution: facts.attribution,
        deterministic_count: facts.deterministic.count,
        estimated_status: facts.estimated?.status ?? null,
        method: facts.estimated?.method ?? CAMPAIGN_LIFT_METHOD_VERSION
      } as unknown as Prisma.InputJsonValue,
      confidence: facts.confidence,
      freshnessSeconds: facts.freshness_seconds
    },
    update: {
      targetJson: facts.target as unknown as Prisma.InputJsonValue,
      actualJson: {
        attribution: facts.attribution,
        deterministic_count: facts.deterministic.count,
        estimated_status: facts.estimated?.status ?? null,
        method: facts.estimated?.method ?? CAMPAIGN_LIFT_METHOD_VERSION
      } as unknown as Prisma.InputJsonValue,
      confidence: facts.confidence,
      freshnessSeconds: facts.freshness_seconds
    }
  });

  return { snapshot_id: row.id, facts };
}

/** Stable fact fixture shape consumed by VS5/VS9 (mirrors Dream conversion cases). */
export function buildPaidSupportFactFixtureFromDreamCases(): Array<{
  case_id: string;
  attribution: string;
  event_kind: string | null;
  count: number | null;
  amount_minor: number | null;
  currency: string | null;
  confidence: string;
  caveat: string;
}> {
  return [
    {
      case_id: "conv_deterministic",
      attribution: "deterministic",
      event_kind: "membership_join",
      count: 1,
      amount_minor: null,
      currency: null,
      confidence: "high",
      caveat: "Consented Relay Link campaign key matched one join."
    },
    {
      case_id: "conv_estimated",
      attribution: "estimated",
      event_kind: "membership_upgrade",
      count: 2,
      amount_minor: null,
      currency: null,
      confidence: "medium",
      caveat: CAMPAIGN_LIFT_METHOD_VERSION + ": " + "Campaign-level correlated lift; not individual attribution."
    },
    {
      case_id: "conv_zero",
      attribution: "zero",
      event_kind: null,
      count: 0,
      amount_minor: 0,
      currency: "USD",
      confidence: "high",
      caveat: "Coverage complete; zero paid-support events in window."
    },
    {
      case_id: "conv_unavailable",
      attribution: "unavailable",
      event_kind: null,
      count: null,
      amount_minor: null,
      currency: null,
      confidence: "unknown",
      caveat: "Source coverage missing; do not coerce to zero."
    },
    {
      case_id: "conv_insufficient",
      attribution: "insufficient",
      event_kind: null,
      count: null,
      amount_minor: null,
      currency: null,
      confidence: "low",
      caveat: "Insufficient evidence for estimated lift; do not coerce to zero."
    }
  ];
}
