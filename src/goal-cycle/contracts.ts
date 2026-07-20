/**
 * Goal Cycle shared wire contract (VS0 freeze).
 * Public API shapes for later slices — not database row shapes.
 */

export const GOAL_CYCLE_CONTRACT_VERSION = "goal-cycle-wire-v1" as const;

export const GOAL_CYCLE_GOAL_KINDS = [
  "engagement",
  "views",
  "paid_support",
  "break"
] as const;
export type GoalCycleGoalKind = (typeof GOAL_CYCLE_GOAL_KINDS)[number];

export const GOAL_CYCLE_BREAK_MODES = [
  "complete_silence",
  "social_upkeep",
  "active_rest"
] as const;
export type GoalCycleBreakMode = (typeof GOAL_CYCLE_BREAK_MODES)[number];

/** Lifecycle states from the product contract. */
export const GOAL_CYCLE_STATES = [
  "draft",
  "researching",
  "questions",
  "review",
  "approved",
  "materializing",
  "active",
  "completion_suggested",
  "completed",
  "cancelled",
  "failed"
] as const;
export type GoalCycleState = (typeof GOAL_CYCLE_STATES)[number];

/** UI / checkpoint phases within an active planning flow. */
export const GOAL_CYCLE_PHASES = [
  "goal",
  "context",
  "research",
  "questions",
  "revisions",
  "logistics",
  "approval",
  "active",
  "completion",
  "learning"
] as const;
export type GoalCyclePhase = (typeof GOAL_CYCLE_PHASES)[number];

export const GOAL_CYCLE_TREND_MODES = [
  "disabled",
  "fixture",
  "history_only",
  "live"
] as const;
export type GoalCycleTrendMode = (typeof GOAL_CYCLE_TREND_MODES)[number];

export const GOAL_CYCLE_ERROR_CODES = [
  "GOAL_CYCLE_ACTIVE_EXISTS",
  "GOAL_CYCLE_NOT_FOUND",
  "GOAL_CYCLE_VERSION_CONFLICT",
  "GOAL_CYCLE_INVALID_STATE",
  "GOAL_CYCLE_LIMIT_EXCEEDED",
  "GOAL_CYCLE_NO_CREDIT",
  "GOAL_CYCLE_DESTINATION_UNLINKED",
  "GOAL_CYCLE_RESEARCH_UNAVAILABLE",
  "GOAL_CYCLE_PLAN_INVALID",
  "GOAL_CYCLE_MATERIALIZATION_FAILED"
] as const;
export type GoalCycleErrorCode = (typeof GOAL_CYCLE_ERROR_CODES)[number];

export const GOAL_CYCLE_MAX_SLOTS = 8;
export const GOAL_CYCLE_MAX_ACTIVE_REST_SLOTS = 4;
export const GOAL_CYCLE_MAX_QUESTIONS = 2;
export const GOAL_CYCLE_MAX_AI_REVISIONS = 2;
export const GOAL_CYCLE_QUESTION_OPTION_MIN = 2;
export const GOAL_CYCLE_QUESTION_OPTION_MAX = 6;
export const GOAL_CYCLE_BOUNDED_TEXT_MAX = 500;

export type GoalCycleMediaState =
  | "missing"
  | "partial"
  | "ready"
  | "not_required";

export type GoalCycleQuestion = {
  id: string;
  prompt: string;
  options: string[];
  bounded_text: string | null;
  answer: string | null;
};

export type GoalCyclePlanSlot = {
  id: string;
  intent: string;
  format: string;
  title: string;
  draft_body: string;
  destination_ids: string[];
  /** Creator-local wall time as ISO-like local datetime string or labeled local. */
  scheduled_local: string;
  scheduled_utc: string;
  time_zone: string;
  media_state: GoalCycleMediaState;
  evidence_refs: string[];
};

export type GoalCyclePlanLogistics = {
  time_zone: string;
  linked_destination_ids: string[];
  notes: string | null;
};

export type GoalCyclePlan = {
  version: number;
  rationale: string;
  slots: GoalCyclePlanSlot[];
  questions_asked: GoalCycleQuestion[];
  /** Count of AI revision rounds applied (0–2). Manual edits do not increment this. */
  ai_revision_count: number;
  evidence_summary: string;
  warnings: string[];
  logistics: GoalCyclePlanLogistics;
};

export type GoalCycleProgressEvent = {
  sequence: number;
  phase: GoalCyclePhase;
  message_code: string;
  occurred_at: string;
  retryable: boolean;
};

export type CoachPlanCreditStatus = {
  enabled: boolean;
  available: number;
  reserved: number;
  included_per_period: number | null;
  period_started_at: string | null;
  period_ends_at: string | null;
  next_grant_at: string | null;
  topups_available: false;
};

export type GoalCycleEvidenceRef = {
  ref_id: string;
  kind: "trend" | "history" | "conversion" | "creator_context";
  confidence: "high" | "medium" | "low" | "unknown";
  freshness_seconds: number | null;
  summary: string;
};

export type GoalCycleOutcomeSummary = {
  target_label: string;
  actual_label: string | null;
  confidence: "high" | "medium" | "low" | "unknown";
  attribution: "deterministic" | "estimated" | "insufficient" | "n_a" | null;
  freshness_seconds: number | null;
};

/** Allowed next-cycle adjustment fields (VS9 learning contract). */
export const GOAL_CYCLE_LEARNING_CHANGE_FIELDS = [
  "goal",
  "target",
  "cadence",
  "format_mix",
  "destination_mix"
] as const;

export type GoalCycleLearningChangeField =
  (typeof GOAL_CYCLE_LEARNING_CHANGE_FIELDS)[number];

export type GoalCycleLearningChange = {
  field: GoalCycleLearningChangeField;
  from: unknown;
  to: unknown;
};

export type GoalCycleLearningProposalStatus = "suggested" | "accepted" | "rejected";

/** Transparent next-cycle suggestion; only `accepted` may seed a later cycle. */
export type GoalCycleLearningProposal = {
  proposal_id: string;
  source_cycle_id: string;
  explanation: string;
  evidence_refs: string[];
  changes: GoalCycleLearningChange[];
  status: GoalCycleLearningProposalStatus;
};

export function isGoalCycleLearningChangeField(
  value: unknown
): value is GoalCycleLearningChangeField {
  return (
    typeof value === "string" &&
    (GOAL_CYCLE_LEARNING_CHANGE_FIELDS as readonly string[]).includes(value)
  );
}

export type GoalCycleMaterializationReceiptRef = {
  cycle_id: string;
  approval_key: string;
  status: "materialized";
  materialized_at: string;
};

/** Full approval receipt (VS7). One per cycle + approval_key. */
export type GoalCycleMaterializationSlotReceipt = {
  slot_id: string;
  post_id: string | null;
  distribution_plan_id: string | null;
  variant_ids: string[];
  task_ids: string[];
  rail_event_ids: string[];
  mode: "new_post" | "upkeep_task" | "silence";
};

export type GoalCycleMaterializationReceipt = GoalCycleMaterializationReceiptRef & {
  slots: GoalCycleMaterializationSlotReceipt[];
};

export type GoalCycleSummary = {
  cycle_id: string;
  state: GoalCycleState;
  phase: GoalCyclePhase;
  goal_kind: GoalCycleGoalKind;
  break_mode: GoalCycleBreakMode | null;
  version: number;
  period_key: string;
  created_at: string;
  updated_at: string;
};

export type GoalCycleDetail = GoalCycleSummary & {
  time_zone: string;
  context: Record<string, unknown>;
  plan: GoalCyclePlan | null;
  progress: GoalCycleProgressEvent[];
  credit: CoachPlanCreditStatus | null;
  evidence: GoalCycleEvidenceRef[];
  outcome: GoalCycleOutcomeSummary | null;
  /** Optional creator reflection (VS9). */
  reflection: string | null;
  /** Confirmed-learning proposal when present (VS9). */
  learning: GoalCycleLearningProposal | null;
  materialization: GoalCycleMaterializationReceiptRef | null;
};

export class GoalCycleContractError extends Error {
  public override readonly name = "GoalCycleContractError";
  public constructor(
    public readonly code: GoalCycleErrorCode,
    message: string,
    public readonly details: Array<{ field: string; issue: string }> = []
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoUtcTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return false;
  const ms = Date.parse(value);
  return !Number.isNaN(ms);
}

function isIanaTimeZone(value: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function isGoalCycleGoalKind(value: unknown): value is GoalCycleGoalKind {
  return (
    typeof value === "string" &&
    (GOAL_CYCLE_GOAL_KINDS as readonly string[]).includes(value)
  );
}

export function isGoalCycleBreakMode(value: unknown): value is GoalCycleBreakMode {
  return (
    typeof value === "string" &&
    (GOAL_CYCLE_BREAK_MODES as readonly string[]).includes(value)
  );
}

export function isGoalCycleState(value: unknown): value is GoalCycleState {
  return typeof value === "string" && (GOAL_CYCLE_STATES as readonly string[]).includes(value);
}

export function isGoalCyclePhase(value: unknown): value is GoalCyclePhase {
  return typeof value === "string" && (GOAL_CYCLE_PHASES as readonly string[]).includes(value);
}

export function isGoalCycleTrendMode(value: unknown): value is GoalCycleTrendMode {
  return (
    typeof value === "string" &&
    (GOAL_CYCLE_TREND_MODES as readonly string[]).includes(value)
  );
}

export function isGoalCycleErrorCode(value: unknown): value is GoalCycleErrorCode {
  return (
    typeof value === "string" &&
    (GOAL_CYCLE_ERROR_CODES as readonly string[]).includes(value)
  );
}

export type GoalCycleFeatureFlags = {
  enabled: boolean;
  ai_enabled: boolean;
  trend_mode: GoalCycleTrendMode;
  materialization_enabled: boolean;
};

/** Defaults are all off / fixture — production side effects require explicit enablement. */
export function getGoalCycleFeatureFlags(
  env: NodeJS.ProcessEnv = process.env
): GoalCycleFeatureFlags {
  const rawMode = (env.RELAY_GOAL_CYCLE_TREND_MODE ?? "fixture").trim().toLowerCase();
  const trend_mode: GoalCycleTrendMode = isGoalCycleTrendMode(rawMode) ? rawMode : "fixture";
  return {
    enabled: env.RELAY_GOAL_CYCLE_ENABLED === "1" || env.RELAY_GOAL_CYCLE_ENABLED === "true",
    ai_enabled:
      env.RELAY_GOAL_CYCLE_AI_ENABLED === "1" || env.RELAY_GOAL_CYCLE_AI_ENABLED === "true",
    trend_mode,
    materialization_enabled:
      env.RELAY_GOAL_CYCLE_MATERIALIZATION_ENABLED === "1" ||
      env.RELAY_GOAL_CYCLE_MATERIALIZATION_ENABLED === "true"
  };
}

function validateQuestion(
  question: unknown,
  index: number
): { ok: true; value: GoalCycleQuestion } | { ok: false; details: Array<{ field: string; issue: string }> } {
  const details: Array<{ field: string; issue: string }> = [];
  if (!isRecord(question)) {
    return { ok: false, details: [{ field: `questions_asked[${index}]`, issue: "object_required" }] };
  }
  if (!isNonEmptyString(question.id)) {
    details.push({ field: `questions_asked[${index}].id`, issue: "required" });
  }
  if (!isNonEmptyString(question.prompt)) {
    details.push({ field: `questions_asked[${index}].prompt`, issue: "required" });
  }
  if (!Array.isArray(question.options)) {
    details.push({ field: `questions_asked[${index}].options`, issue: "array_required" });
  } else {
    if (
      question.options.length < GOAL_CYCLE_QUESTION_OPTION_MIN ||
      question.options.length > GOAL_CYCLE_QUESTION_OPTION_MAX
    ) {
      details.push({ field: `questions_asked[${index}].options`, issue: "count_out_of_bounds" });
    }
    for (const [oi, opt] of question.options.entries()) {
      if (!isNonEmptyString(opt)) {
        details.push({ field: `questions_asked[${index}].options[${oi}]`, issue: "non_empty_string" });
      }
    }
  }
  if (question.bounded_text !== null && question.bounded_text !== undefined) {
    if (typeof question.bounded_text !== "string") {
      details.push({ field: `questions_asked[${index}].bounded_text`, issue: "string_or_null" });
    } else if (question.bounded_text.length > GOAL_CYCLE_BOUNDED_TEXT_MAX) {
      details.push({ field: `questions_asked[${index}].bounded_text`, issue: "too_long" });
    }
  }
  if (question.answer !== null && question.answer !== undefined && typeof question.answer !== "string") {
    details.push({ field: `questions_asked[${index}].answer`, issue: "string_or_null" });
  }
  if (details.length > 0) return { ok: false, details };
  return {
    ok: true,
    value: {
      id: String(question.id),
      prompt: String(question.prompt),
      options: (question.options as string[]).map(String),
      bounded_text:
        question.bounded_text === null || question.bounded_text === undefined
          ? null
          : String(question.bounded_text),
      answer:
        question.answer === null || question.answer === undefined ? null : String(question.answer)
    }
  };
}

function validateSlot(
  slot: unknown,
  index: number,
  linkedDestinationIds: ReadonlySet<string>
): { ok: true; value: GoalCyclePlanSlot } | { ok: false; details: Array<{ field: string; issue: string }> } {
  const details: Array<{ field: string; issue: string }> = [];
  if (!isRecord(slot)) {
    return { ok: false, details: [{ field: `slots[${index}]`, issue: "object_required" }] };
  }
  for (const field of ["id", "intent", "format", "title", "draft_body", "scheduled_local", "scheduled_utc", "time_zone"] as const) {
    if (!isNonEmptyString(slot[field])) {
      details.push({ field: `slots[${index}].${field}`, issue: "required" });
    }
  }
  if (!Array.isArray(slot.destination_ids) || slot.destination_ids.length === 0) {
    details.push({ field: `slots[${index}].destination_ids`, issue: "required_non_empty" });
  } else {
    for (const [di, dest] of slot.destination_ids.entries()) {
      if (!isNonEmptyString(dest)) {
        details.push({ field: `slots[${index}].destination_ids[${di}]`, issue: "non_empty_string" });
        continue;
      }
      if (linkedDestinationIds.size > 0 && !linkedDestinationIds.has(dest)) {
        details.push({ field: `slots[${index}].destination_ids[${di}]`, issue: "unlinked" });
      }
    }
  }
  if (!isNonEmptyString(slot.scheduled_utc) || !isIsoUtcTimestamp(String(slot.scheduled_utc))) {
    details.push({ field: `slots[${index}].scheduled_utc`, issue: "iso_utc_required" });
  }
  if (!isNonEmptyString(slot.time_zone) || !isIanaTimeZone(String(slot.time_zone))) {
    details.push({ field: `slots[${index}].time_zone`, issue: "iana_timezone_required" });
  }
  const mediaOk = ["missing", "partial", "ready", "not_required"].includes(String(slot.media_state));
  if (!mediaOk) {
    details.push({ field: `slots[${index}].media_state`, issue: "invalid" });
  }
  if (!Array.isArray(slot.evidence_refs)) {
    details.push({ field: `slots[${index}].evidence_refs`, issue: "array_required" });
  }
  if (details.length > 0) return { ok: false, details };
  return {
    ok: true,
    value: {
      id: String(slot.id),
      intent: String(slot.intent),
      format: String(slot.format),
      title: String(slot.title),
      draft_body: String(slot.draft_body),
      destination_ids: (slot.destination_ids as string[]).map(String),
      scheduled_local: String(slot.scheduled_local),
      scheduled_utc: String(slot.scheduled_utc),
      time_zone: String(slot.time_zone),
      media_state: slot.media_state as GoalCycleMediaState,
      evidence_refs: Array.isArray(slot.evidence_refs)
        ? slot.evidence_refs.map(String)
        : []
    }
  };
}

export type ValidateGoalCyclePlanOptions = {
  /** When provided, every slot destination must be in this set. */
  linked_destination_ids?: readonly string[];
  goal_kind?: GoalCycleGoalKind;
  break_mode?: GoalCycleBreakMode | null;
};

/**
 * Runtime Plan validator. Throws GoalCycleContractError with a stable code.
 */
export function validateGoalCyclePlan(
  plan: unknown,
  options: ValidateGoalCyclePlanOptions = {}
): GoalCyclePlan {
  if (!isRecord(plan)) {
    throw new GoalCycleContractError("GOAL_CYCLE_PLAN_INVALID", "Plan must be an object.", [
      { field: "plan", issue: "object_required" }
    ]);
  }

  const details: Array<{ field: string; issue: string }> = [];
  if (typeof plan.version !== "number" || !Number.isInteger(plan.version) || plan.version < 1) {
    details.push({ field: "version", issue: "positive_integer_required" });
  }
  if (!isNonEmptyString(plan.rationale)) {
    details.push({ field: "rationale", issue: "required" });
  }
  if (!isNonEmptyString(plan.evidence_summary)) {
    details.push({ field: "evidence_summary", issue: "required" });
  }
  if (!Array.isArray(plan.warnings)) {
    details.push({ field: "warnings", issue: "array_required" });
  }
  if (
    typeof plan.ai_revision_count !== "number" ||
    !Number.isInteger(plan.ai_revision_count) ||
    plan.ai_revision_count < 0
  ) {
    details.push({ field: "ai_revision_count", issue: "non_negative_integer_required" });
  } else if (plan.ai_revision_count > GOAL_CYCLE_MAX_AI_REVISIONS) {
    throw new GoalCycleContractError(
      "GOAL_CYCLE_LIMIT_EXCEEDED",
      `At most ${GOAL_CYCLE_MAX_AI_REVISIONS} AI revisions are allowed.`,
      [{ field: "ai_revision_count", issue: "max_exceeded" }]
    );
  }

  if (!Array.isArray(plan.questions_asked)) {
    details.push({ field: "questions_asked", issue: "array_required" });
  } else if (plan.questions_asked.length > GOAL_CYCLE_MAX_QUESTIONS) {
    throw new GoalCycleContractError(
      "GOAL_CYCLE_LIMIT_EXCEEDED",
      `At most ${GOAL_CYCLE_MAX_QUESTIONS} clarification questions are allowed.`,
      [{ field: "questions_asked", issue: "max_exceeded" }]
    );
  }

  if (!Array.isArray(plan.slots)) {
    details.push({ field: "slots", issue: "array_required" });
  } else if (plan.slots.length > GOAL_CYCLE_MAX_SLOTS) {
    throw new GoalCycleContractError(
      "GOAL_CYCLE_LIMIT_EXCEEDED",
      `At most ${GOAL_CYCLE_MAX_SLOTS} slots are allowed.`,
      [{ field: "slots", issue: "max_exceeded" }]
    );
  }

  const breakMode = options.break_mode ?? null;
  const goalKind = options.goal_kind;
  if (goalKind === "break" && breakMode === "complete_silence" && Array.isArray(plan.slots) && plan.slots.length > 0) {
    throw new GoalCycleContractError(
      "GOAL_CYCLE_PLAN_INVALID",
      "Complete silence Plans must have zero slots.",
      [{ field: "slots", issue: "silence_requires_zero" }]
    );
  }
  if (breakMode === "active_rest" && Array.isArray(plan.slots) && plan.slots.length > GOAL_CYCLE_MAX_ACTIVE_REST_SLOTS) {
    throw new GoalCycleContractError(
      "GOAL_CYCLE_LIMIT_EXCEEDED",
      `Active rest allows at most ${GOAL_CYCLE_MAX_ACTIVE_REST_SLOTS} slots.`,
      [{ field: "slots", issue: "active_rest_max_exceeded" }]
    );
  }
  if (
    goalKind &&
    goalKind !== "break" &&
    Array.isArray(plan.slots) &&
    plan.slots.length < 1
  ) {
    details.push({ field: "slots", issue: "at_least_one_required" });
  }

  if (!isRecord(plan.logistics)) {
    details.push({ field: "logistics", issue: "object_required" });
  } else {
    if (!isNonEmptyString(plan.logistics.time_zone) || !isIanaTimeZone(String(plan.logistics.time_zone))) {
      details.push({ field: "logistics.time_zone", issue: "iana_timezone_required" });
    }
    if (!Array.isArray(plan.logistics.linked_destination_ids)) {
      details.push({ field: "logistics.linked_destination_ids", issue: "array_required" });
    }
  }

  const linkedFromOptions = new Set(options.linked_destination_ids ?? []);
  const linkedFromPlan = new Set(
    isRecord(plan.logistics) && Array.isArray(plan.logistics.linked_destination_ids)
      ? plan.logistics.linked_destination_ids.map(String)
      : []
  );
  const linkedDestinationIds =
    linkedFromOptions.size > 0 ? linkedFromOptions : linkedFromPlan;

  const questions: GoalCycleQuestion[] = [];
  if (Array.isArray(plan.questions_asked)) {
    for (const [i, q] of plan.questions_asked.entries()) {
      const result = validateQuestion(q, i);
      if (!result.ok) details.push(...result.details);
      else questions.push(result.value);
    }
  }

  const slots: GoalCyclePlanSlot[] = [];
  const slotIds = new Set<string>();
  if (Array.isArray(plan.slots)) {
    for (const [i, s] of plan.slots.entries()) {
      const result = validateSlot(s, i, linkedDestinationIds);
      if (!result.ok) {
        const unlinked = result.details.some((d) => d.issue === "unlinked");
        if (unlinked) {
          throw new GoalCycleContractError(
            "GOAL_CYCLE_DESTINATION_UNLINKED",
            "Only linked destinations may become Plan tasks.",
            result.details
          );
        }
        details.push(...result.details);
      } else {
        if (slotIds.has(result.value.id)) {
          details.push({ field: `slots[${i}].id`, issue: "duplicate" });
        }
        slotIds.add(result.value.id);
        slots.push(result.value);
      }
    }
  }

  if (details.length > 0) {
    throw new GoalCycleContractError("GOAL_CYCLE_PLAN_INVALID", "Plan failed validation.", details);
  }

  return {
    version: plan.version as number,
    rationale: String(plan.rationale),
    slots,
    questions_asked: questions,
    ai_revision_count: plan.ai_revision_count as number,
    evidence_summary: String(plan.evidence_summary),
    warnings: (plan.warnings as unknown[]).map(String),
    logistics: {
      time_zone: String((plan.logistics as Record<string, unknown>).time_zone),
      linked_destination_ids: (
        (plan.logistics as Record<string, unknown>).linked_destination_ids as string[]
      ).map(String),
      notes:
        (plan.logistics as Record<string, unknown>).notes === null ||
        (plan.logistics as Record<string, unknown>).notes === undefined
          ? null
          : String((plan.logistics as Record<string, unknown>).notes)
    }
  };
}
