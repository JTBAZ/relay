/**
 * Fixture pack for `/studio/goals` audit UI (VS9-T04).
 * Presentation-only — learning/reflection hydrate via T05 routes later.
 */

import type {
  GoalCycleDetail,
  GoalCycleLearningProposal,
  GoalCycleSummary
} from "./goal-cycle-types";
import { GOAL_CYCLE_RESUME_DETAIL_FIXTURE } from "./goal-cycle-api-fixtures";

export const GOAL_CYCLE_AUDIT_FIXTURE_VERSION = "goal-cycle-audit-v1" as const;

export type GoalCycleAuditRecord = {
  cycle: GoalCycleDetail;
  reflection: string | null;
  learning: GoalCycleLearningProposal | null;
};

function completedCycle(patch: Partial<GoalCycleDetail> = {}): GoalCycleDetail {
  return {
    ...GOAL_CYCLE_RESUME_DETAIL_FIXTURE,
    cycle_id: "cycle_audit_completed",
    state: "completed",
    phase: "learning",
    goal_kind: "engagement",
    break_mode: null,
    version: 8,
    period_key: "2026-07",
    created_at: "2026-07-01T12:00:00.000Z",
    updated_at: "2026-07-15T18:00:00.000Z",
    plan: {
      version: 2,
      rationale: "Midweek sketch focus",
      slots: [
        {
          id: "slot_a",
          intent: "engagement_hook",
          format: "image_post",
          title: "Warm-up sketch",
          draft_body: "Body",
          destination_ids: ["patreon"],
          scheduled_local: "2026-07-08T19:00:00",
          scheduled_utc: "2026-07-08T23:00:00.000Z",
          time_zone: "America/New_York",
          media_state: "ready",
          evidence_refs: ["ev_history_top"]
        }
      ],
      questions_asked: [],
      ai_revision_count: 1,
      evidence_summary: "History favored midweek evenings.",
      warnings: [],
      logistics: {
        time_zone: "America/New_York",
        linked_destination_ids: ["patreon"],
        notes: null
      }
    },
    progress: [
      {
        sequence: 1,
        phase: "active",
        message_code: "cycle_active",
        occurred_at: "2026-07-08T12:00:00.000Z",
        retryable: false
      },
      {
        sequence: 2,
        phase: "completion",
        message_code: "completion_confirmed",
        occurred_at: "2026-07-15T18:00:00.000Z",
        retryable: false
      }
    ],
    outcome: {
      target_label: "Engagement ≥ 100",
      actual_label: "128 engagements",
      confidence: "medium",
      attribution: null,
      freshness_seconds: 3600
    },
    materialization: {
      cycle_id: "cycle_audit_completed",
      approval_key: "apr_audit_1",
      status: "materialized",
      materialized_at: "2026-07-08T11:00:00.000Z"
    },
    ...patch
  };
}

const LEARNING_ACCEPTED: GoalCycleLearningProposal = {
  proposal_id: "glp_audit_1",
  source_cycle_id: "cycle_audit_completed",
  explanation:
    "Deterministic Engagement ≥ 100 met (128 ≥ 100). Suggest raising the next target to 110 while holding cadence.",
  evidence_refs: ["/studio/analytics", "cycle:cycle_audit_completed:outcome"],
  changes: [
    { field: "target", from: 100, to: 110 },
    { field: "cadence", from: "current", to: "hold" }
  ],
  status: "accepted"
};

const ACTIVE_SUMMARY: GoalCycleSummary = {
  cycle_id: "cycle_audit_active",
  state: "active",
  phase: "active",
  goal_kind: "views",
  break_mode: null,
  version: 5,
  period_key: "2026-07",
  created_at: "2026-07-16T10:00:00.000Z",
  updated_at: "2026-07-17T09:00:00.000Z"
};

export const GOAL_CYCLE_AUDIT_ACTIVE_FIXTURE: GoalCycleDetail = {
  ...GOAL_CYCLE_RESUME_DETAIL_FIXTURE,
  ...ACTIVE_SUMMARY,
  plan: {
    version: 1,
    rationale: "Views sprint",
    slots: [
      {
        id: "slot_v1",
        intent: "reach",
        format: "image_post",
        title: "Process clip",
        draft_body: "Body",
        destination_ids: ["patreon", "x"],
        scheduled_local: "2026-07-18T12:00:00",
        scheduled_utc: "2026-07-18T16:00:00.000Z",
        time_zone: "America/New_York",
        media_state: "partial",
        evidence_refs: []
      }
    ],
    questions_asked: [],
    ai_revision_count: 0,
    evidence_summary: "Weak trend fallback disclosed.",
    warnings: ["evidence_weak"],
    logistics: {
      time_zone: "America/New_York",
      linked_destination_ids: ["patreon", "x"],
      notes: null
    }
  },
  progress: [
    {
      sequence: 1,
      phase: "active",
      message_code: "cycle_active",
      occurred_at: "2026-07-16T12:00:00.000Z",
      retryable: false
    }
  ],
  outcome: {
    target_label: "Views ≥ 1000",
    actual_label: "420 views",
    confidence: "low",
    attribution: null,
    freshness_seconds: 7200
  },
  materialization: {
    cycle_id: "cycle_audit_active",
    approval_key: "apr_audit_active",
    status: "materialized",
    materialized_at: "2026-07-16T11:30:00.000Z"
  },
  evidence: [
    {
      ref_id: "ev_weak",
      kind: "trend",
      confidence: "low",
      freshness_seconds: 86400,
      summary: "Trend evidence was weak; Plan continued with disclosed fallback."
    }
  ]
};

export const GOAL_CYCLE_AUDIT_COMPLETED_FIXTURE: GoalCycleAuditRecord = {
  cycle: completedCycle(),
  reflection: "Midweek evenings worked — keep that window.",
  learning: LEARNING_ACCEPTED
};

export const GOAL_CYCLE_AUDIT_REJECTED_LEARNING_FIXTURE: GoalCycleAuditRecord = {
  cycle: completedCycle({
    cycle_id: "cycle_audit_rejected",
    goal_kind: "paid_support",
    outcome: {
      target_label: "Paid support ≥ 2",
      actual_label: "Estimated lift 3",
      confidence: "low",
      attribution: "estimated",
      freshness_seconds: 1800
    },
    materialization: {
      cycle_id: "cycle_audit_rejected",
      approval_key: "apr_audit_2",
      status: "materialized",
      materialized_at: "2026-06-20T11:00:00.000Z"
    },
    period_key: "2026-06",
    created_at: "2026-06-10T12:00:00.000Z",
    updated_at: "2026-06-28T18:00:00.000Z"
  }),
  reflection: null,
  learning: {
    proposal_id: "glp_audit_rej",
    source_cycle_id: "cycle_audit_rejected",
    explanation:
      "Only estimated lift was available — never treated as deterministic. Suggest reviewing destination mix.",
    evidence_refs: ["/studio/analytics?focus=paid_support"],
    changes: [
      {
        field: "destination_mix",
        from: "current",
        to: "prefer_linked_paid_destinations"
      }
    ],
    status: "rejected"
  }
};

export const GOAL_CYCLE_AUDIT_FIXTURES = {
  fixture_id: GOAL_CYCLE_AUDIT_FIXTURE_VERSION,
  active: {
    cycle: GOAL_CYCLE_AUDIT_ACTIVE_FIXTURE,
    reflection: null as string | null,
    learning: null as GoalCycleLearningProposal | null
  } satisfies GoalCycleAuditRecord,
  history: [
    GOAL_CYCLE_AUDIT_COMPLETED_FIXTURE,
    GOAL_CYCLE_AUDIT_REJECTED_LEARNING_FIXTURE
  ] as GoalCycleAuditRecord[]
} as const;
