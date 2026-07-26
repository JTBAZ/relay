/**
 * Goal Cycle planner prompts (VS5-T03).
 * Strict JSON only — model narrates supplied facts; never invents metrics.
 */

import {
  GOAL_CYCLE_MAX_AI_REVISIONS,
  GOAL_CYCLE_MAX_QUESTIONS,
  GOAL_CYCLE_MAX_SLOTS,
  type GoalCycleBreakMode,
  type GoalCycleGoalKind,
  type GoalCyclePlan,
  type GoalCycleQuestion
} from "../contracts.js";
import type { GoalCycleFactPack } from "./goal-cycle-fact-pack.js";
import {
  GOAL_CYCLE_ACTIVE_REST_FORMATS,
  GOAL_CYCLE_PLAN_SCHEMA_VERSION,
  GOAL_CYCLE_SOCIAL_UPKEEP_FORMATS
} from "./plan-schema.js";

export const GOAL_CYCLE_PLANNER_PROMPT_VERSION = "goal-cycle-planner-prompt-v1" as const;

export function formatActiveRestFormatsForPrompt(): string {
  return GOAL_CYCLE_ACTIVE_REST_FORMATS.join(", ");
}

export function formatSocialUpkeepFormatsForPrompt(): string {
  return GOAL_CYCLE_SOCIAL_UPKEEP_FORMATS.join(", ");
}

export function buildPlannerSystemPrompt(args: {
  goal_kind: GoalCycleGoalKind;
  break_mode: GoalCycleBreakMode | null;
}): string {
  const lines = [
    "You are Relay Goal Cycle planner for an independent artist.",
    "Use ONLY the fact_pack and answered_questions in the user message.",
    "Never invent metrics, trends, follower counts, conversion counts, or platform stats.",
    "If fact_pack.trend is null, do not claim trending or elevated external interest.",
    "If paid_support.attribution is estimated, never call it deterministic.",
    "Every slot evidence_refs entry must be a ref_id from fact_pack.evidence_refs.",
    `At most ${GOAL_CYCLE_MAX_SLOTS} slots, ${GOAL_CYCLE_MAX_QUESTIONS} questions, ${GOAL_CYCLE_MAX_AI_REVISIONS} AI revisions (set ai_revision_count to 0 for the initial Plan).`,
    "Only linked destinations from fact_pack.linked_destinations may appear in destination_ids.",
    "Do not claim publish-complete or already-live posts.",
    "Return strict JSON: { \"plan\": { version, rationale, slots, questions_asked, ai_revision_count, evidence_summary, warnings, logistics } }."
  ];

  if (args.goal_kind === "break" && args.break_mode === "complete_silence") {
    lines.push("Complete silence: return zero slots; no provider or publish tasks.");
  }
  if (args.break_mode === "social_upkeep") {
    lines.push(
      `Social upkeep: zero new posts or only formats [${formatSocialUpkeepFormatsForPrompt()}].`
    );
  }
  if (args.break_mode === "active_rest") {
    lines.push(
      `Active rest: 1–4 slots using only formats [${formatActiveRestFormatsForPrompt()}].`
    );
  }

  return lines.join(" ");
}

export function buildPlannerUserPayload(args: {
  factPack: GoalCycleFactPack;
  goal_kind: GoalCycleGoalKind;
  break_mode: GoalCycleBreakMode | null;
  answered_questions: GoalCycleQuestion[];
}): Record<string, unknown> {
  return {
    prompt_version: GOAL_CYCLE_PLANNER_PROMPT_VERSION,
    schema_version: GOAL_CYCLE_PLAN_SCHEMA_VERSION,
    goal_kind: args.goal_kind,
    break_mode: args.break_mode,
    limits: {
      max_slots: GOAL_CYCLE_MAX_SLOTS,
      max_questions: GOAL_CYCLE_MAX_QUESTIONS,
      max_ai_revisions: GOAL_CYCLE_MAX_AI_REVISIONS
    },
    allowed_formats: {
      active_rest: [...GOAL_CYCLE_ACTIVE_REST_FORMATS],
      social_upkeep: [...GOAL_CYCLE_SOCIAL_UPKEEP_FORMATS]
    },
    linked_destination_ids: args.factPack.linked_destinations
      .filter((d) => d.readiness !== "unavailable")
      .map((d) => d.id),
    answered_questions: args.answered_questions,
    fact_pack: args.factPack
  };
}

export function buildPlannerQuestionSystemPrompt(): string {
  return [
    "You are Relay Goal Cycle planner proposing clarification questions.",
    "Ask zero to two questions only. Prefer zero when fact_pack is sufficient.",
    "Each question needs id, prompt, options (2–6 short strings), bounded_text null, answer null.",
    "Do not invent metrics. Return strict JSON: { \"questions\": [ ... ] }."
  ].join(" ");
}

export function buildPlannerRevisionSystemPrompt(args: {
  goal_kind: GoalCycleGoalKind;
  break_mode: GoalCycleBreakMode | null;
  next_ai_revision_count: number;
}): string {
  return [
    buildPlannerSystemPrompt({
      goal_kind: args.goal_kind,
      break_mode: args.break_mode
    }),
    "This is an AI revision of the previous Plan in prior_plan.",
    "Apply only the creator revision_note. Preserve linked destinations and evidence_refs from the fact pack.",
    `Set ai_revision_count to ${args.next_ai_revision_count} (integer).`,
    "Do not invent new metrics. Keep questions_asked stable unless the note asks to change them."
  ].join(" ");
}

export function buildPlannerRevisionUserPayload(args: {
  factPack: GoalCycleFactPack;
  goal_kind: GoalCycleGoalKind;
  break_mode: GoalCycleBreakMode | null;
  answered_questions: GoalCycleQuestion[];
  prior_plan: GoalCyclePlan;
  revision_note: string;
  next_ai_revision_count: number;
}): Record<string, unknown> {
  return {
    ...buildPlannerUserPayload({
      factPack: args.factPack,
      goal_kind: args.goal_kind,
      break_mode: args.break_mode,
      answered_questions: args.answered_questions
    }),
    operation: "ai_revision",
    next_ai_revision_count: args.next_ai_revision_count,
    revision_note: args.revision_note.slice(0, 500),
    prior_plan: args.prior_plan
  };
}
