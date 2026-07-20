/**
 * Goal Cycle public wire types mirrored from `src/goal-cycle/contracts.ts` (VS0).
 * Do not invent fields — keep in sync with goal-cycle-wire-v1.
 */

export const GOAL_CYCLE_CONTRACT_VERSION = "goal-cycle-wire-v1" as const;

export type GoalCycleGoalKind = "engagement" | "views" | "paid_support" | "break";
export type GoalCycleBreakMode = "complete_silence" | "social_upkeep" | "active_rest";
export type GoalCycleState =
  | "draft"
  | "researching"
  | "questions"
  | "review"
  | "approved"
  | "materializing"
  | "active"
  | "completion_suggested"
  | "completed"
  | "cancelled"
  | "failed";
export type GoalCyclePhase =
  | "goal"
  | "context"
  | "research"
  | "questions"
  | "revisions"
  | "logistics"
  | "approval"
  | "active"
  | "completion"
  | "learning";

export type GoalCycleMediaState = "missing" | "partial" | "ready" | "not_required";

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

/** VS9 learning proposal (mirrors src/goal-cycle/contracts.ts). */
export type GoalCycleLearningChangeField =
  | "goal"
  | "target"
  | "cadence"
  | "format_mix"
  | "destination_mix";

export type GoalCycleLearningChange = {
  field: GoalCycleLearningChangeField;
  from: unknown;
  to: unknown;
};

export type GoalCycleLearningProposal = {
  proposal_id: string;
  source_cycle_id: string;
  explanation: string;
  evidence_refs: string[];
  changes: GoalCycleLearningChange[];
  status: "suggested" | "accepted" | "rejected";
};

export type GoalCycleMaterializationReceiptRef = {
  cycle_id: string;
  approval_key: string;
  status: "materialized";
  materialized_at: string;
};

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
  reflection: string | null;
  learning: GoalCycleLearningProposal | null;
  materialization: GoalCycleMaterializationReceiptRef | null;
};

export type GoalCycleStartInput = {
  goal_kind: GoalCycleGoalKind;
  break_mode?: GoalCycleBreakMode | null;
  time_zone?: string | null;
  context?: Record<string, unknown> | null;
  idempotency_key?: string | null;
};

export type GoalCycleCheckpointPatchInput = {
  expected_version: number;
  phase?: GoalCyclePhase;
  state?: GoalCycleState;
  context?: Record<string, unknown> | null;
  progress_message_code?: string | null;
};

export type GoalCycleListResult = {
  items: GoalCycleSummary[];
  next_cursor: string | null;
};

/** Planner API inputs (VS5 — frozen for VS6). */
export type GoalCyclePlannerGenerateInput = {
  idempotency_key?: string;
  expected_version?: number;
  skip_questions?: boolean;
  force_fallback?: boolean;
};

export type GoalCyclePlannerReviseInput = {
  revision_note: string;
  idempotency_key?: string;
  expected_version?: number;
  force_fallback?: boolean;
};

export type GoalCyclePlannerManualEditInput = {
  plan: GoalCyclePlan;
  idempotency_key?: string;
  expected_version?: number;
};
