/**
 * Deterministic Plan fallback (VS5-T02).
 * Useful history/cadence Plans only — never claims external trend evidence.
 */

import {
  GOAL_CYCLE_MAX_ACTIVE_REST_SLOTS,
  type GoalCycleBreakMode,
  type GoalCycleGoalKind,
  type GoalCyclePlan,
  type GoalCyclePlanSlot
} from "../contracts.js";
import type { GoalCycleFactPack } from "./goal-cycle-fact-pack.js";
import { validatePlannerPlan } from "./plan-schema.js";

export type PlannerFallbackInput = {
  factPack: GoalCycleFactPack;
  goal_kind?: GoalCycleGoalKind;
  break_mode?: GoalCycleBreakMode | null;
  /** Override plan version (default 1). */
  version?: number;
};

function historyRefIds(pack: GoalCycleFactPack): string[] {
  return pack.evidence_refs.filter((e) => e.kind === "history" || e.kind === "creator_context").map((e) => e.ref_id);
}

function linkedIds(pack: GoalCycleFactPack): string[] {
  return pack.linked_destinations
    .filter((d) => d.readiness !== "unavailable")
    .map((d) => d.id);
}

function localHourIso(pack: GoalCycleFactPack, dayOffset: number, hour: number): {
  scheduled_local: string;
  scheduled_utc: string;
} {
  const base = new Date(pack.computed_at);
  if (Number.isNaN(base.getTime())) {
    return {
      scheduled_local: "2026-07-20T19:00:00",
      scheduled_utc: "2026-07-20T23:00:00.000Z"
    };
  }
  const local = new Date(base.getTime() + dayOffset * 86_400_000);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, "0");
  const d = String(local.getUTCDate()).padStart(2, "0");
  const hh = String(Math.min(23, Math.max(0, hour))).padStart(2, "0");
  const scheduled_local = `${y}-${m}-${d}T${hh}:00:00`;
  // Approximate UTC as local+0 for fallback (logistics still carry creator TZ).
  const scheduled_utc = `${y}-${m}-${d}T${hh}:00:00.000Z`;
  return { scheduled_local, scheduled_utc };
}

function baseSlot(
  pack: GoalCycleFactPack,
  partial: Omit<GoalCyclePlanSlot, "time_zone" | "scheduled_local" | "scheduled_utc" | "media_state" | "evidence_refs" | "destination_ids"> & {
    destination_ids?: string[];
    evidence_refs?: string[];
    dayOffset?: number;
  }
): GoalCyclePlanSlot {
  const hour = pack.computed_metrics.cadence.preferred_local_hour ?? 19;
  const when = localHourIso(pack, partial.dayOffset ?? 2, hour);
  const destinations = partial.destination_ids?.length
    ? partial.destination_ids
    : linkedIds(pack).slice(0, 1);
  const refs = partial.evidence_refs?.length ? partial.evidence_refs : historyRefIds(pack).slice(0, 1);
  return {
    id: partial.id,
    intent: partial.intent,
    format: partial.format,
    title: partial.title,
    draft_body: partial.draft_body,
    destination_ids: destinations,
    scheduled_local: when.scheduled_local,
    scheduled_utc: when.scheduled_utc,
    time_zone: pack.time_zone,
    media_state: "missing",
    evidence_refs: refs.length > 0 ? refs : []
  };
}

/**
 * Build a validated fallback Plan from history/cadence only.
 * Makes no external trend claim.
 */
export function buildDeterministicPlanFallback(input: PlannerFallbackInput): GoalCyclePlan {
  const pack = input.factPack;
  const goalKind = input.goal_kind ?? pack.goal_kind;
  const breakMode = input.break_mode !== undefined ? input.break_mode : pack.break_mode;
  const linked = linkedIds(pack);
  const historyRefs = historyRefIds(pack);
  const version = input.version ?? 1;

  const warnings = [
    "Deterministic fallback Plan — no external trend evidence claimed.",
    "Attach media and confirm logistics before approval."
  ];

  let slots: GoalCyclePlanSlot[] = [];
  let rationale: string;
  let evidence_summary: string;

  if (goalKind === "break" && breakMode === "complete_silence") {
    rationale = "Complete silence: no new posts; reminder suppression for the break interval.";
    evidence_summary = "Silence branch — history retained for context only; no trend or publish tasks.";
    slots = [];
  } else if (goalKind === "break" && breakMode === "social_upkeep") {
    rationale = "Social upkeep: keep a light presence on existing posts without new content.";
    evidence_summary = "History-only upkeep; external trend discovery was not used.";
    if (linked.length > 0 && historyRefs.length > 0) {
      slots = [
        baseSlot(pack, {
          id: "slot_upkeep_01",
          intent: "social_upkeep",
          format: "existing_post_upkeep",
          title: "Light reply pass",
          draft_body: "Spend a short window answering recent comments on existing posts.",
          dayOffset: 1
        })
      ];
    }
  } else if (goalKind === "break" && breakMode === "active_rest") {
    rationale = "Active rest: a small low-energy Plan from creator history cadence.";
    evidence_summary = "History-only recovery Plan; no external trend claim.";
    const count = Math.min(2, GOAL_CYCLE_MAX_ACTIVE_REST_SLOTS, Math.max(1, linked.length > 0 ? 2 : 0));
    for (let i = 0; i < count; i += 1) {
      slots.push(
        baseSlot(pack, {
          id: `slot_rest_0${i + 1}`,
          intent: "active_rest",
          format: i === 0 ? "sketch_page" : "low_energy_wip",
          title: i === 0 ? "Quiet sketch page" : "Low-energy WIP update",
          draft_body:
            i === 0
              ? "A soft sketch page for the rest interval — process over polish."
              : "A short WIP update when energy allows.",
          dayOffset: 2 + i * 2
        })
      );
    }
  } else {
    rationale =
      goalKind === "paid_support"
        ? "History-paced posts that invite support without inventing conversion metrics."
        : goalKind === "views"
          ? "History-paced posts aimed at steady reach using proven formats."
          : "History-paced engagement posts from recent creator cadence.";
    evidence_summary =
      historyRefs.length > 0
        ? "Fallback uses creator history and cadence only; external trend evidence was not applied."
        : "Fallback Plan with limited history; review destinations and timing before approval.";

    const destPrimary = linked[0];
    const destSecondary = linked[1];
    if (destPrimary) {
      slots.push(
        baseSlot(pack, {
          id: "slot_fallback_01",
          intent: `${goalKind}_hook`,
          format: "image_post",
          title: "Process post",
          draft_body: "A paced process post from recent work — captions stay warm and concrete.",
          destination_ids: [destPrimary],
          dayOffset: 2
        })
      );
    }
    if (destPrimary && slots.length < 3) {
      slots.push(
        baseSlot(pack, {
          id: "slot_fallback_02",
          intent: `${goalKind}_series`,
          format: "carousel",
          title: "Follow-up panel",
          draft_body: "A short follow-up that continues the same thread.",
          destination_ids: destSecondary ? [destPrimary, destSecondary] : [destPrimary],
          dayOffset: 4
        })
      );
    }
  }

  const draft: GoalCyclePlan = {
    version,
    rationale,
    slots,
    questions_asked: [],
    ai_revision_count: 0,
    evidence_summary,
    warnings,
    logistics: {
      time_zone: pack.time_zone,
      linked_destination_ids: linked,
      notes: "Generated by deterministic fallback (history/cadence only)."
    }
  };

  // Silence with empty evidence_refs on slots is fine; ensure history refs exist when slots need them.
  if (slots.some((s) => s.evidence_refs.length === 0) && historyRefs.length === 0 && slots.length > 0) {
    // Inject a synthetic creator_context ref into the pack copy for validation.
    const packWithContext: GoalCycleFactPack = {
      ...pack,
      evidence_refs: [
        ...pack.evidence_refs,
        {
          ref_id: "ev_fallback_context",
          kind: "creator_context",
          confidence: "low",
          freshness_seconds: 0,
          summary: "Fallback context — limited history available."
        }
      ]
    };
    draft.slots = draft.slots.map((s) =>
      s.evidence_refs.length === 0 ? { ...s, evidence_refs: ["ev_fallback_context"] } : s
    );
    return validatePlannerPlan(draft, {
      factPack: packWithContext,
      goal_kind: goalKind,
      break_mode: breakMode,
      linked_destination_ids: linked,
      allow_trend_claims_without_trend: false
    });
  }

  return validatePlannerPlan(draft, {
    factPack: pack,
    goal_kind: goalKind,
    break_mode: breakMode,
    linked_destination_ids: linked,
    allow_trend_claims_without_trend: false
  });
}
