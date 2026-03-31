export type CardType =
  | "cadence_rescue"
  | "series_continuation"
  | "churn_cohort_save"
  | "tier_upgrade_opportunity"
  | "win_back_nudge"
  | "pre_migration_readiness";

export type CardStatus = "open" | "accepted" | "dismissed" | "executed";

export type ExpectedImpact = {
  metric: string;
  delta_range: [number, number];
  horizon_days: number;
};

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

export type ActionExecution = {
  action_job_id: string;
  recommendation_id: string;
  creator_id: string;
  action_type: string;
  options: Record<string, unknown>;
  execution_status: "queued" | "success" | "failed";
  created_at: string;
};

export type RecommendationOutcome = {
  recommendation_id: string;
  creator_id: string;
  evaluated_at: string;
  metric: string;
  predicted_delta: number;
  actual_delta: number;
};

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
};

export type AnalyticsStoreRoot = {
  snapshots: Record<string, AnalyticsSnapshot[]>;
  recommendations: Record<string, RecommendationCard[]>;
  actions: ActionExecution[];
  outcomes: RecommendationOutcome[];
};

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
