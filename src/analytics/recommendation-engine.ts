import { randomUUID } from "node:crypto";
import type { CanonicalSnapshot } from "../ingest/canonical-store.js";
import type { AnalyticsSnapshot, CardType, RecommendationCard } from "./types.js";

export type EngineConfig = {
  confidence_threshold: number;
};

const DEFAULT_CONFIG: EngineConfig = { confidence_threshold: 0.5 };

type CandidateResult = {
  card_type: CardType;
  title: string;
  signal: string;
  diagnosis: string;
  recommendation: string;
  confidence_score: number;
  expected_impact: {
    metric: string;
    delta_range: [number, number];
    horizon_days: number;
  };
  reason_codes: string[];
  evidence_refs: string[];
};

function cadenceRescueCandidate(
  snapshot: AnalyticsSnapshot,
  canonical: CanonicalSnapshot
): CandidateResult | null {
  if (snapshot.posting_cadence_30d >= 4) return null;
  const posts = canonical.posts[snapshot.creator_id] ?? {};
  const postIds = Object.values(posts)
    .filter((p) => p.upstream_status === "active")
    .sort(
      (a, b) =>
        new Date(b.current.published_at).getTime() -
        new Date(a.current.published_at).getTime()
    )
    .slice(0, 3)
    .map((p) => p.post_id);

  const cadence = snapshot.posting_cadence_30d;
  const gap = cadence === 0 ? "no posts" : `only ${cadence} post(s)`;
  const confidence = Math.min(0.95, 0.4 + (4 - cadence) * 0.15);

  return {
    card_type: "cadence_rescue",
    title: "Cadence Rescue: posting frequency drop",
    signal: `${gap} in the last 30 days`,
    diagnosis: "Posting cadence has dropped below sustainable engagement threshold.",
    recommendation: "Schedule 2-3 themed posts in the next 10 days.",
    confidence_score: Math.round(confidence * 100) / 100,
    expected_impact: {
      metric: "churn_rate",
      delta_range: [-0.015, -0.008],
      horizon_days: 30
    },
    reason_codes: ["cadence_drop"],
    evidence_refs: [snapshot.snapshot_id, ...postIds]
  };
}

function tierUpgradeCandidate(
  snapshot: AnalyticsSnapshot
): CandidateResult | null {
  if (snapshot.active_tiers < 2 || snapshot.total_posts < 10) return null;
  const topTier = snapshot.tier_content_counts
    .sort((a, b) => b.posts - a.posts)[0];
  if (!topTier) return null;
  const ratio = topTier.posts / snapshot.total_posts;
  if (ratio < 0.6) return null;

  return {
    card_type: "tier_upgrade_opportunity",
    title: `Tier Upgrade: ${topTier.tier_id} dominates content`,
    signal: `${Math.round(ratio * 100)}% of posts target ${topTier.tier_id}`,
    diagnosis: "Content is concentrated in one tier; lower tiers may lack value.",
    recommendation: "Create exclusive content for under-served tiers.",
    confidence_score: 0.62,
    expected_impact: {
      metric: "tier_upgrade_rate",
      delta_range: [0.005, 0.02],
      horizon_days: 60
    },
    reason_codes: ["tier_concentration"],
    evidence_refs: [snapshot.snapshot_id]
  };
}

export function scoreRecommendations(
  creatorId: string,
  snapshot: AnalyticsSnapshot,
  canonical: CanonicalSnapshot,
  config: EngineConfig = DEFAULT_CONFIG
): RecommendationCard[] {
  const candidates: CandidateResult[] = [];

  const cadence = cadenceRescueCandidate(snapshot, canonical);
  if (cadence) candidates.push(cadence);

  const tierUp = tierUpgradeCandidate(snapshot);
  if (tierUp) candidates.push(tierUp);

  const now = new Date().toISOString();
  return candidates
    .filter((c) => c.confidence_score >= config.confidence_threshold)
    .sort((a, b) => b.confidence_score - a.confidence_score)
    .map((c) => ({
      recommendation_id: `rec_${randomUUID()}`,
      creator_id: creatorId,
      card_type: c.card_type,
      title: c.title,
      signal: c.signal,
      diagnosis: c.diagnosis,
      recommendation: c.recommendation,
      confidence_score: c.confidence_score,
      expected_impact: c.expected_impact,
      reason_codes: c.reason_codes,
      evidence_refs: c.evidence_refs,
      status: "open" as const,
      created_at: now,
      updated_at: now
    }));
}
