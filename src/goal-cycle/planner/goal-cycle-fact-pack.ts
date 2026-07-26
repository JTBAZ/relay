/**
 * Goal Cycle deterministic fact pack (VS5-T01).
 * Metrics are computed before the model; pack is prompt-safe (no patron / raw provider text).
 */

import type { PaidSupportFacts } from "../../analytics/goal-cycle-paid-support-facts.js";
import {
  type GoalCycleBreakMode,
  type GoalCycleEvidenceRef,
  type GoalCycleGoalKind,
  type GoalCycleOutcomeSummary
} from "../contracts.js";
import {
  DREAM_FLOW_FIXTURE,
  type DreamFlowFixture,
  type DreamHistoryPost
} from "../fixtures/dream-flow.js";
import type { TrendEvidence } from "../trends/provider-types.js";
import { stripRawFromEvidence } from "../trends/trend-evidence-store.js";
import { assertEvidencePromptSafe } from "../trends/trend-evidence-gateway.js";

export const GOAL_CYCLE_FACT_PACK_VERSION = "goal-cycle-fact-pack-v1" as const;

export type GoalCycleLinkedDestinationCapability = {
  id: string;
  readiness: "ready" | "limited" | "unavailable";
  label: string | null;
};

export type GoalCycleComputedMetrics = {
  history_post_count: number;
  history_top_engagement: number | null;
  history_top_post_id: string | null;
  history_window_months: number | null;
  cadence: {
    posts_in_window: number;
    preferred_local_hour: number | null;
    sample_size: number;
    timing_confidence: "high" | "low" | "unknown";
  };
  paid_support_deterministic_count: number | null;
  paid_support_attribution: PaidSupportFacts["attribution"] | null;
};

/** Prompt-safe trend slice — never includes raw provider excerpts. */
export type GoalCycleFactPackTrend = {
  run_id: string;
  composite_strength: TrendEvidence["composite_strength"];
  confidence: TrendEvidence["confidence"];
  prompt_safe_summary: string;
  history_fallback: boolean;
};

export type GoalCycleFactPack = {
  version: typeof GOAL_CYCLE_FACT_PACK_VERSION;
  cycle_id: string;
  goal_kind: GoalCycleGoalKind;
  break_mode: GoalCycleBreakMode | null;
  time_zone: string;
  creator_context: Record<string, unknown>;
  linked_destinations: GoalCycleLinkedDestinationCapability[];
  unlinked_destination_ids: string[];
  computed_metrics: GoalCycleComputedMetrics;
  trend: GoalCycleFactPackTrend | null;
  paid_support: PaidSupportFacts | null;
  prior_outcomes: GoalCycleOutcomeSummary[];
  evidence_refs: GoalCycleEvidenceRef[];
  computed_at: string;
};

export type GoalCycleFactPackInput = {
  cycle_id: string;
  goal_kind: GoalCycleGoalKind;
  break_mode?: GoalCycleBreakMode | null;
  time_zone: string;
  creator_context?: Record<string, unknown>;
  linked_destinations: GoalCycleLinkedDestinationCapability[];
  unlinked_destination_ids?: string[];
  history_posts?: DreamHistoryPost[];
  history_window_months?: number | null;
  trend?: TrendEvidence | null;
  paid_support?: PaidSupportFacts | null;
  prior_outcomes?: GoalCycleOutcomeSummary[];
  evidence_refs?: GoalCycleEvidenceRef[];
  computed_at?: string | Date;
};

function engagementScore(post: DreamHistoryPost): number {
  return post.likes + post.comments * 3 + Math.floor(post.views / 10);
}

function preferredHourFromPosts(posts: DreamHistoryPost[]): number | null {
  if (posts.length === 0) return null;
  let top: DreamHistoryPost | null = null;
  let topScore = -1;
  for (const p of posts) {
    const score = engagementScore(p);
    if (score > topScore) {
      topScore = score;
      top = p;
    }
  }
  if (top) {
    const d = new Date(top.published_at);
    if (!Number.isNaN(d.getTime())) return d.getUTCHours();
  }
  return null;
}

export function computeHistoryMetrics(
  posts: DreamHistoryPost[],
  windowMonths: number | null = null
): GoalCycleComputedMetrics {
  let top: DreamHistoryPost | null = null;
  let topScore = -1;
  for (const p of posts) {
    const score = engagementScore(p);
    if (score > topScore) {
      topScore = score;
      top = p;
    }
  }
  const sample = posts.length;
  return {
    history_post_count: sample,
    history_top_engagement: top ? topScore : null,
    history_top_post_id: top?.post_id ?? null,
    history_window_months: windowMonths,
    cadence: {
      posts_in_window: sample,
      preferred_local_hour: preferredHourFromPosts(posts),
      sample_size: sample,
      timing_confidence: sample >= 5 ? "high" : sample >= 2 ? "low" : "unknown"
    },
    paid_support_deterministic_count: null,
    paid_support_attribution: null
  };
}

function stripTrend(evidence: TrendEvidence | null | undefined): GoalCycleFactPackTrend | null {
  if (!evidence) return null;
  const cleaned = stripRawFromEvidence(evidence);
  assertEvidencePromptSafe(cleaned);
  return {
    run_id: cleaned.run_id,
    composite_strength: cleaned.composite_strength,
    confidence: cleaned.confidence,
    prompt_safe_summary: cleaned.prompt_safe_summary,
    history_fallback: cleaned.composite_strength === "history_only"
  };
}

function evidenceFromTrend(trend: GoalCycleFactPackTrend | null): GoalCycleEvidenceRef[] {
  if (!trend) return [];
  return [
    {
      ref_id: `ev_trend_${trend.run_id}`.slice(0, 64),
      kind: "trend",
      confidence: trend.confidence,
      freshness_seconds: null,
      summary: trend.prompt_safe_summary.slice(0, 280)
    }
  ];
}

function evidenceFromPaidSupport(facts: PaidSupportFacts | null): GoalCycleEvidenceRef[] {
  if (!facts) return [];
  if (facts.attribution === "unavailable" || facts.attribution === "insufficient") {
    return [
      {
        ref_id: "ev_conv_coverage",
        kind: "conversion",
        confidence: facts.confidence,
        freshness_seconds: facts.freshness_seconds,
        summary: facts.caveat ?? "Paid-support coverage is insufficient or unavailable."
      }
    ];
  }
  return [
    {
      ref_id: "ev_conv_primary",
      kind: "conversion",
      confidence: facts.confidence,
      freshness_seconds: facts.freshness_seconds,
      summary:
        facts.outcome_summary.actual_label ??
        facts.caveat ??
        `Paid-support attribution: ${facts.attribution}`
    }
  ];
}

function evidenceFromHistory(metrics: GoalCycleComputedMetrics): GoalCycleEvidenceRef[] {
  if (metrics.history_post_count <= 0) return [];
  const hour = metrics.cadence.preferred_local_hour;
  const hourNote =
    hour != null ? ` Preferred publish hour (UTC sample): ${hour}.` : "";
  return [
    {
      ref_id: "ev_history_top",
      kind: "history",
      confidence: metrics.cadence.timing_confidence === "unknown" ? "low" : metrics.cadence.timing_confidence,
      freshness_seconds: 0,
      summary: `Creator history: ${metrics.history_post_count} posts in window; top engagement ${
        metrics.history_top_engagement ?? 0
      }.${hourNote}`
    }
  ];
}

function evidenceFromContext(context: Record<string, unknown>): GoalCycleEvidenceRef[] {
  const topic = typeof context.topic === "string" ? context.topic.trim() : "";
  if (!topic) return [];
  return [
    {
      ref_id: "ev_creator_context",
      kind: "creator_context",
      confidence: "medium",
      freshness_seconds: 0,
      summary: `Creator topic focus: ${topic.slice(0, 160)}`
    }
  ];
}

/**
 * Assemble one versioned fact pack. All metric values are computed here — never by the model.
 */
export function buildGoalCycleFactPack(input: GoalCycleFactPackInput): GoalCycleFactPack {
  const cycle_id = input.cycle_id.trim();
  if (!cycle_id) throw new Error("cycle_id_required");

  const history = input.history_posts ?? [];
  const metrics = computeHistoryMetrics(history, input.history_window_months ?? null);
  if (input.paid_support) {
    metrics.paid_support_deterministic_count = input.paid_support.deterministic.count;
    metrics.paid_support_attribution = input.paid_support.attribution;
  }

  const trend = stripTrend(input.trend);
  const paid_support = input.paid_support ?? null;
  const creator_context = { ...(input.creator_context ?? {}) };

  const evidence_refs =
    input.evidence_refs && input.evidence_refs.length > 0
      ? input.evidence_refs.map((e) => ({
          ref_id: e.ref_id,
          kind: e.kind,
          confidence: e.confidence,
          freshness_seconds: e.freshness_seconds,
          summary: e.summary.slice(0, 400)
        }))
      : [
          ...evidenceFromHistory(metrics),
          ...evidenceFromTrend(trend),
          ...evidenceFromPaidSupport(paid_support),
          ...evidenceFromContext(creator_context)
        ];

  // Dedupe by ref_id, first wins.
  const seen = new Set<string>();
  const uniqueRefs: GoalCycleEvidenceRef[] = [];
  for (const ref of evidence_refs) {
    if (seen.has(ref.ref_id)) continue;
    seen.add(ref.ref_id);
    uniqueRefs.push(ref);
  }

  const computed_at =
    input.computed_at instanceof Date
      ? input.computed_at.toISOString()
      : typeof input.computed_at === "string" && input.computed_at.trim()
        ? input.computed_at.trim()
        : new Date().toISOString();

  const pack: GoalCycleFactPack = {
    version: GOAL_CYCLE_FACT_PACK_VERSION,
    cycle_id,
    goal_kind: input.goal_kind,
    break_mode: input.break_mode ?? null,
    time_zone: input.time_zone.trim() || "UTC",
    creator_context,
    linked_destinations: input.linked_destinations.map((d) => ({
      id: d.id,
      readiness: d.readiness,
      label: d.label
    })),
    unlinked_destination_ids: (input.unlinked_destination_ids ?? []).map(String),
    computed_metrics: metrics,
    trend,
    paid_support,
    prior_outcomes: (input.prior_outcomes ?? []).map((o) => ({ ...o })),
    evidence_refs: uniqueRefs,
    computed_at
  };

  // Privacy: never ship patron identity in the pack JSON.
  const serialized = JSON.stringify(pack);
  if (/patron_id|patreon_member|member_email|full_name/i.test(serialized)) {
    throw new Error("fact_pack_contains_forbidden_identity_fields");
  }

  return pack;
}

/** Deterministic Dream-fixture pack for planner tests (no DB). */
export function buildGoalCycleFactPackFromDreamFixture(
  fixture: DreamFlowFixture = DREAM_FLOW_FIXTURE,
  overrides: Partial<GoalCycleFactPackInput> = {}
): GoalCycleFactPack {
  const strong = fixture.trend_cases.find((c) => c.strength === "strong") ?? fixture.trend_cases[0]!;
  const conv = fixture.conversion_cases.find((c) => c.attribution === "deterministic");

  const paid_support: PaidSupportFacts | null = conv
    ? {
        cycle_id: fixture.sample_cycle_summary.cycle_id,
        goal_kind: "paid_support",
        target: { label: "Paid support events", threshold: 2 },
        deterministic: {
          count: conv.count ?? 0,
          amount_minor: conv.amount_minor,
          currency: conv.currency,
          outcome_ids: ["outcome_dream_opaque_1"]
        },
        estimated: null,
        coverage: "complete",
        confidence: conv.confidence,
        freshness_seconds: 7200,
        attribution: "deterministic",
        caveat: conv.caveat,
        outcome_summary: {
          target_label: "Paid support events (≥2)",
          actual_label: `${conv.count ?? 0} deterministic paid-support events`,
          confidence: conv.confidence,
          attribution: "deterministic",
          freshness_seconds: 7200
        }
      }
    : null;

  return buildGoalCycleFactPack({
    cycle_id: fixture.sample_cycle_summary.cycle_id,
    goal_kind: fixture.sample_cycle_summary.goal_kind,
    break_mode: fixture.sample_cycle_summary.break_mode,
    time_zone: fixture.creator.time_zone,
    creator_context: {
      topic: strong.topic,
      trend_note: "Keep captions warm and process-forward."
    },
    linked_destinations: fixture.creator.linked_destinations.map((id) => ({
      id,
      readiness: "ready" as const,
      label: id
    })),
    unlinked_destination_ids: [...fixture.creator.unlinked_destinations],
    history_posts: fixture.history.posts,
    history_window_months: fixture.history.window_months,
    trend: {
      run_id: `dream_${strong.case_id}`,
      creator_id: fixture.creator.creator_id,
      human_context: {
        topic: strong.topic,
        locale: null,
        trend_note: null
      },
      interest_series: null,
      web_discovery: null,
      creator_history: {
        window_months: fixture.history.window_months,
        post_count: fixture.history.posts.length,
        top_signals: ["midweek_evening"],
        prompt_safe_summary: "Midweek evening posts earned the strongest engagement in the last 90 days.",
        freshness_seconds: 0,
        confidence: "high"
      },
      composite_strength: strong.strength === "strong" ? "strong" : "weak",
      confidence: strong.confidence,
      prompt_safe_summary: strong.prompt_safe_summary,
      provenance: []
    },
    paid_support,
    prior_outcomes: [],
    evidence_refs: fixture.sample_evidence,
    computed_at: fixture.created_at,
    ...overrides
  });
}

/** Stable set of evidence ref ids for planner validation. */
export function factPackEvidenceRefIds(pack: GoalCycleFactPack): Set<string> {
  return new Set(pack.evidence_refs.map((e) => e.ref_id));
}
