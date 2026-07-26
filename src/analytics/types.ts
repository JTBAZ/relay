/**
 * @fileoverview Domain types for Action Center analytics: recommendation cards, snapshots, actions, and rollup summaries.
 * @description Plain TypeScript types shared by file-backed and Postgres-backed analytics stores; align with persisted rows in Prisma models for snapshots, recommendations, actions, and outcomes.
 * @see prisma/schema.prisma AnalyticsSnapshotRow, RecommendationRecord, AnalyticsActionExecution, AnalyticsOutcome
 */

/** @description Discriminant for recommendation card templates (cadence, series, churn, tiers, migration readiness). */
export type CardType =
  | "cadence_rescue"
  | "series_continuation"
  | "churn_cohort_save"
  | "tier_upgrade_opportunity"
  | "win_back_nudge"
  | "pre_migration_readiness";

/** @description Lifecycle state for a recommendation surfaced in the Action Center UI. */
export type CardStatus = "open" | "accepted" | "dismissed" | "executed";

/** @description Expected metric movement attached to a card for prioritization and explainability. */
export type ExpectedImpact = {
  metric: string;
  delta_range: [number, number];
  horizon_days: number;
};

/**
 * @description A scored recommendation produced by the analytics engine or ingested into the store.
 * @security-audit-required Cards reference `creator_id` and operational metadata; callers must enforce tenant/creator scope when persisting or serving rows.
 */
export type RecommendationCard = {
  recommendation_id: string;
  creator_id: string;
  card_type: CardType;
  title: string;
  signal: string;
  diagnosis: string;
  recommendation: string;
  confidence_score: number;
  expected_impact: ExpectedImpact;
  reason_codes: string[];
  evidence_refs: string[];
  status: CardStatus;
  created_at: string;
  updated_at: string;
  notes?: string;
  dismiss_reason_code?: string;
};

/** @description Queued execution record tying a creator action job to a recommendation. */
export type ActionExecution = {
  action_job_id: string;
  recommendation_id: string;
  creator_id: string;
  action_type: string;
  options: Record<string, unknown>;
  execution_status: "queued" | "success" | "failed";
  created_at: string;
};

/** @description Post-hoc evaluation comparing predicted versus actual metric delta for calibration. */
export type RecommendationOutcome = {
  recommendation_id: string;
  creator_id: string;
  evaluated_at: string;
  metric: string;
  predicted_delta: number;
  actual_delta: number;
};

/**
 * @description Point-in-time rollup of creator posting and tier signals used for recommendations and dashboards.
 * @see src/jsdoc-core-entities.ts Artist, SyncStatus (conceptual parallels for creator-scoped aggregates)
 */
export type AnalyticsSnapshot = {
  snapshot_id: string;
  creator_id: string;
  generated_at: string;
  total_posts: number;
  total_media: number;
  active_tiers: number;
  posting_cadence_30d: number;
  top_tags: Array<{ tag_id: string; count: number }>;
  tier_content_counts: Array<{ tier_id: string; posts: number }>;
  estimated: boolean;
  /** Optional explainability label when metrics are estimated (Postgres `label`). */
  label?: string;
  /** Optional methodology note for Workstream E transparency (Postgres `method`). */
  method?: string;
};

/** @description Aggregate document shape for JSON file persistence of the analytics domain. */
export type AnalyticsStoreRoot = {
  snapshots: Record<string, AnalyticsSnapshot[]>;
  recommendations: Record<string, RecommendationCard[]>;
  actions: ActionExecution[];
  outcomes: RecommendationOutcome[];
};

/**
 * @description Lightweight summary for Action Center surfaces without loading full snapshot history.
 * @security-audit-required Exposes creator-scoped metrics; callers must scope by authorized `creator_id` / tenant.
 */
export type MetricsSummary = {
  creator_id: string;
  total_posts: number;
  total_media: number;
  active_tiers: number;
  posting_cadence_30d: number;
  top_tags: Array<{ tag_id: string; count: number }>;
  open_recommendation_count: number;
  estimated: boolean;
};
