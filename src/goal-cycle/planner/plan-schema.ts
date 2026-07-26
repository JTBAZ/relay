/**
 * Planner Plan schema validation (VS5-T02).
 * Extends VS0 wire validation with evidence-ref, rest-format, and metric-claim checks.
 */

import {
  GoalCycleContractError,
  GOAL_CYCLE_MAX_ACTIVE_REST_SLOTS,
  validateGoalCyclePlan,
  type GoalCycleBreakMode,
  type GoalCycleGoalKind,
  type GoalCyclePlan,
  type GoalCyclePlanSlot
} from "../contracts.js";
import {
  factPackEvidenceRefIds,
  type GoalCycleFactPack
} from "./goal-cycle-fact-pack.js";

export const GOAL_CYCLE_PLAN_SCHEMA_VERSION = "goal-cycle-plan-schema-v1" as const;

/** Product-contract recovery formats for active rest. */
export const GOAL_CYCLE_ACTIVE_REST_FORMATS = [
  "recovery_piece",
  "sketch_page",
  "low_energy_wip",
  "irl_journal",
  "recovery",
  "sketch",
  "wip",
  "journal"
] as const;

/** Bounded upkeep formats for social upkeep (existing posts only — no new-post formats). */
export const GOAL_CYCLE_SOCIAL_UPKEEP_FORMATS = [
  "existing_post_upkeep",
  "upkeep_reply",
  "upkeep_pin"
] as const;

const ACTIVE_REST_FORMAT_SET = new Set<string>(GOAL_CYCLE_ACTIVE_REST_FORMATS);
const SOCIAL_UPKEEP_FORMAT_SET = new Set<string>(GOAL_CYCLE_SOCIAL_UPKEEP_FORMATS);

/** Unsupported metric-claim patterns the model must not invent. */
const UNSUPPORTED_METRIC_CLAIM_PATTERNS: RegExp[] = [
  /\b\d{1,3}\s*%\s+(increase|decrease|lift|growth|boost|improvement)\b/i,
  /\bcaused\s+\d+\s+(joins?|purchases?|tips?|conversions?)\b/i,
  /\bguaranteed\s+\d+/i,
  /\bwill\s+(double|triple)\s+(engagement|views|joins?)\b/i,
  /\b\d+\s+deterministic\s+joins?\b/i
];

export type ValidatePlannerPlanOptions = {
  factPack: GoalCycleFactPack;
  goal_kind?: GoalCycleGoalKind;
  break_mode?: GoalCycleBreakMode | null;
  /** When set, overrides logistics-linked destinations for destination checks. */
  linked_destination_ids?: readonly string[];
  /** Allow plans that claim trend evidence when pack has no trend (default false). */
  allow_trend_claims_without_trend?: boolean;
};

export function assertEvidenceRefsInFactPack(
  slots: GoalCyclePlanSlot[],
  factPack: GoalCycleFactPack
): void {
  const known = factPackEvidenceRefIds(factPack);
  const details: Array<{ field: string; issue: string }> = [];
  for (const [i, slot] of slots.entries()) {
    for (const [j, ref] of slot.evidence_refs.entries()) {
      if (!known.has(ref)) {
        details.push({
          field: `slots[${i}].evidence_refs[${j}]`,
          issue: "unknown_evidence_ref"
        });
      }
    }
  }
  if (details.length > 0) {
    throw new GoalCycleContractError(
      "GOAL_CYCLE_PLAN_INVALID",
      "Plan references evidence not present in the fact pack.",
      details
    );
  }
}

function assertRestFormatRules(
  plan: GoalCyclePlan,
  goalKind: GoalCycleGoalKind | undefined,
  breakMode: GoalCycleBreakMode | null
): void {
  if (goalKind === "break" && breakMode === "complete_silence" && plan.slots.length > 0) {
    throw new GoalCycleContractError(
      "GOAL_CYCLE_PLAN_INVALID",
      "Complete silence Plans must have zero slots.",
      [{ field: "slots", issue: "silence_requires_zero" }]
    );
  }

  if (breakMode === "active_rest") {
    if (plan.slots.length > GOAL_CYCLE_MAX_ACTIVE_REST_SLOTS) {
      throw new GoalCycleContractError(
        "GOAL_CYCLE_LIMIT_EXCEEDED",
        `Active rest allows at most ${GOAL_CYCLE_MAX_ACTIVE_REST_SLOTS} slots.`,
        [{ field: "slots", issue: "active_rest_max_exceeded" }]
      );
    }
    for (const [i, slot] of plan.slots.entries()) {
      const format = slot.format.trim().toLowerCase();
      if (!ACTIVE_REST_FORMAT_SET.has(format)) {
        throw new GoalCycleContractError(
          "GOAL_CYCLE_PLAN_INVALID",
          "Active rest slots must use recovery / sketch / low-energy WIP / IRL journal formats.",
          [{ field: `slots[${i}].format`, issue: "active_rest_format_forbidden" }]
        );
      }
    }
  }

  if (breakMode === "social_upkeep") {
    for (const [i, slot] of plan.slots.entries()) {
      const format = slot.format.trim().toLowerCase();
      if (!SOCIAL_UPKEEP_FORMAT_SET.has(format)) {
        throw new GoalCycleContractError(
          "GOAL_CYCLE_PLAN_INVALID",
          "Social upkeep may only schedule bounded existing-post upkeep tasks (or zero slots).",
          [{ field: `slots[${i}].format`, issue: "social_upkeep_format_forbidden" }]
        );
      }
    }
  }
}

function assertNoUnsupportedMetricClaims(
  plan: GoalCyclePlan,
  factPack: GoalCycleFactPack,
  options: ValidatePlannerPlanOptions
): void {
  const blob = `${plan.rationale}\n${plan.evidence_summary}\n${plan.warnings.join("\n")}`;
  const details: Array<{ field: string; issue: string }> = [];

  if (
    UNSUPPORTED_METRIC_CLAIM_PATTERNS.some((pattern) => pattern.test(blob)) &&
    !/\bnot\s+deterministic\b/i.test(blob)
  ) {
    const detJoin = blob.match(/(\d+)\s+deterministic\s+joins?\b/i);
    const det = factPack.computed_metrics.paid_support_deterministic_count;
    const allowedDetJoin =
      detJoin && det != null && Number(detJoin[1]) === det && det > 0;
    if (!allowedDetJoin) {
      details.push({ field: "rationale", issue: "unsupported_metric_claim" });
    }
  }

  if (
    /\b(trending|elevated interest|interest signal)\b/i.test(blob) &&
    !factPack.trend &&
    !options.allow_trend_claims_without_trend
  ) {
    details.push({ field: "evidence_summary", issue: "trend_claim_without_trend_evidence" });
  }

  // Estimated must not be narrated as deterministic.
  if (
    factPack.paid_support?.attribution === "estimated" &&
    /\bdeterministic\b/i.test(blob) &&
    !/\bnot\s+deterministic\b/i.test(blob)
  ) {
    details.push({ field: "evidence_summary", issue: "estimated_labeled_deterministic" });
  }

  if (details.length > 0) {
    throw new GoalCycleContractError(
      "GOAL_CYCLE_PLAN_INVALID",
      "Plan makes unsupported metric or attribution claims.",
      details
    );
  }
}

/**
 * Normalize logistics: unify time zones and intersect destinations with the fact pack.
 */
export function normalizePlanLogistics(
  plan: GoalCyclePlan,
  factPack: GoalCycleFactPack
): GoalCyclePlan {
  const packLinked = new Set(
    factPack.linked_destinations
      .filter((d) => d.readiness !== "unavailable")
      .map((d) => d.id)
  );
  const linked = plan.logistics.linked_destination_ids.filter((id) => packLinked.has(id));
  const timeZone = factPack.time_zone || plan.logistics.time_zone;

  return {
    ...plan,
    slots: plan.slots.map((slot) => ({
      ...slot,
      time_zone: timeZone,
      destination_ids: slot.destination_ids.filter((id) => linked.includes(id) || packLinked.has(id))
    })),
    logistics: {
      ...plan.logistics,
      time_zone: timeZone,
      linked_destination_ids: linked.length > 0 ? linked : [...packLinked]
    }
  };
}

/**
 * Full planner validation: wire contract + evidence refs + rest formats + metric claims.
 */
export function validatePlannerPlan(
  raw: unknown,
  options: ValidatePlannerPlanOptions
): GoalCyclePlan {
  const goalKind = options.goal_kind ?? options.factPack.goal_kind;
  const breakMode =
    options.break_mode !== undefined ? options.break_mode : options.factPack.break_mode;
  const linked =
    options.linked_destination_ids ??
    options.factPack.linked_destinations
      .filter((d) => d.readiness !== "unavailable")
      .map((d) => d.id);

  const base = validateGoalCyclePlan(raw, {
    goal_kind: goalKind,
    break_mode: breakMode,
    linked_destination_ids: linked
  });

  const normalized = normalizePlanLogistics(base, options.factPack);
  // Re-validate destinations after normalization emptied a slot.
  for (const [i, slot] of normalized.slots.entries()) {
    if (slot.destination_ids.length === 0 && normalized.slots.length > 0) {
      // Silence / social_upkeep may have zero slots; non-break goals need destinations.
      if (goalKind !== "break" || breakMode === "active_rest") {
        throw new GoalCycleContractError(
          "GOAL_CYCLE_DESTINATION_UNLINKED",
          "Only linked destinations may become Plan tasks.",
          [{ field: `slots[${i}].destination_ids`, issue: "unlinked" }]
        );
      }
    }
  }

  assertEvidenceRefsInFactPack(normalized.slots, options.factPack);
  assertRestFormatRules(normalized, goalKind, breakMode);
  assertNoUnsupportedMetricClaims(normalized, options.factPack, options);

  // Media must not claim publish-complete.
  for (const [i, slot] of normalized.slots.entries()) {
    if (/publish(ed| complete)|already live/i.test(`${slot.title} ${slot.draft_body}`)) {
      throw new GoalCycleContractError(
        "GOAL_CYCLE_PLAN_INVALID",
        "Plans must not claim publish-complete state.",
        [{ field: `slots[${i}]`, issue: "publish_complete_forbidden" }]
      );
    }
  }

  return normalized;
}

/**
 * Parse model JSON into a candidate Plan object (or null on hard parse failure).
 * Accepts `{ plan: {...} }` or a bare Plan object.
 */
export function parsePlannerAiOutput(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      if (record.plan && typeof record.plan === "object") return record.plan;
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
