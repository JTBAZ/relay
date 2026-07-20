/**
 * Map live Coach checkpoint / fact_pack into Action Hub view models.
 */

import type {
  CoachFactPackWire,
  CoachFindingChipWire,
  CoachProposeResultWire,
  CreatorUnifiedPerformanceData,
  DistributionPlanWire
} from "@/lib/relay-api";
import type {
  FindingChip,
  FindingSource,
  IconType,
  LatestReport,
  PaceStatus,
  RecentPost
} from "./action-hub-types";

const SOURCE_ICON: Record<FindingSource, IconType> = {
  history: "people",
  post: "tag",
  goals: "trend",
  moment: "clock",
  locale: "people",
  performance: "trend",
  coverage: "tag"
};

export function formatReach(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function formatHourWindow(hour: number | null, confidence: "high" | "low"): string {
  if (confidence !== "high" || hour == null || !Number.isFinite(hour)) {
    return "Insufficient sample";
  }
  const h = Math.max(0, Math.min(23, Math.trunc(hour)));
  const end = (h + 2) % 24;
  const fmt = (x: number) => {
    const suffix = x >= 12 ? "pm" : "am";
    const h12 = x % 12 === 0 ? 12 : x % 12;
    return `${h12}${suffix}`;
  };
  return `${fmt(h)}–${fmt(end)}`;
}

function parseHighlight(label: string): FindingChip["highlight"] | undefined {
  const m = label.match(/\{([^}]+)\}/);
  if (!m) return undefined;
  return { text: m[0], value: m[1] };
}

export function chipsFromCoachFindings(chips: CoachFindingChipWire[]): FindingChip[] {
  return chips.map((chip) => {
    const source = chip.source as FindingSource;
    return {
      id: chip.id,
      label: chip.label,
      source,
      icon: SOURCE_ICON[source] ?? "trend",
      highlight: parseHighlight(chip.label)
    };
  });
}

export function isCoachProposeResult(
  value: unknown
): value is CoachProposeResultWire {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.path_id === "string" &&
    v.findings != null &&
    typeof v.findings === "object" &&
    v.fact_pack != null &&
    typeof v.fact_pack === "object"
  );
}

export function reportFromDistributionPlan(
  postId: string,
  plan: DistributionPlanWire | null
): LatestReport | null {
  if (!plan || plan.assistant_mode !== "coach_review") return null;
  const proposalRaw = plan.assistant_plan?.proposal;
  if (!isCoachProposeResult(proposalRaw)) return null;

  const factPack = proposalRaw.fact_pack;
  const paceRaw = factPack.cadence
    ? // goals may carry pace; fall back from posts vs target
      factPack.goals.find((g) => g.metric === "posts" || g.id.includes("post"))?.pace_status
    : undefined;
  let pace_status: PaceStatus = "on_track";
  if (paceRaw === "behind" || paceRaw === "complete" || paceRaw === "on_track") {
    pace_status = paceRaw;
  } else if (
    factPack.cadence.monthly_post_target > 0 &&
    factPack.cadence.posts_this_month >= factPack.cadence.monthly_post_target
  ) {
    pace_status = "complete";
  } else if (
    factPack.cadence.monthly_post_target > 0 &&
    factPack.cadence.posts_this_month / factPack.cadence.monthly_post_target < 0.5
  ) {
    // soft heuristic only for shell display when goal pace missing
    pace_status = "on_track";
  }

  return {
    generated_at: plan.updated_at
      ? new Date(plan.updated_at).toLocaleString()
      : "Recently",
    focused_post_id: postId,
    findings: { chips: chipsFromCoachFindings(proposalRaw.findings.chips ?? []) },
    fact_pack: {
      coverage: {
        stale: factPack.coverage.stale,
        with_metrics: factPack.coverage.with_metrics,
        without_metrics: factPack.coverage.without_metrics
      },
      cadence: {
        posts_this_month: factPack.cadence.posts_this_month,
        monthly_post_target: factPack.cadence.monthly_post_target,
        pace_status,
        historical_hour_of_day: formatHourWindow(
          factPack.cadence.historical_hour_of_day,
          factPack.cadence.timing_confidence
        ),
        timing_confidence: factPack.cadence.timing_confidence
      },
      destination_mix: factPack.destination_mix.map((d) => ({
        dest: d.dest,
        share: Math.round(d.reach_share * 100)
      })),
      tags: factPack.tags.map((t) => t.tag),
      insight_codes: factPack.insight_codes.map((c) => c.code),
      reason_codes: factPack.reason_codes
    },
    coach_review: { hasOpenReview: (plan.variants?.length ?? 0) === 0 }
  };
}

export function recentPostsFromUnified(
  unified: CreatorUnifiedPerformanceData | null
): RecentPost[] {
  if (!unified?.top_posts?.length) return [];
  return unified.top_posts.slice(0, 8).map((p, i) => ({
    id: p.post_id,
    rank: i + 1,
    title: p.title?.trim() || "Untitled post",
    date: "",
    reach: formatReach(p.total_reach),
    thumb: "",
    alt: p.title?.trim() || "Post thumbnail"
  }));
}

export function emptyMountedReport(postId: string | null): LatestReport {
  return {
    generated_at: "—",
    focused_post_id: postId ?? "",
    findings: { chips: [] },
    fact_pack: {
      coverage: { stale: false, with_metrics: [], without_metrics: [] },
      cadence: {
        posts_this_month: 0,
        monthly_post_target: 0,
        pace_status: "on_track",
        historical_hour_of_day: "Insufficient sample",
        timing_confidence: "low"
      },
      destination_mix: [],
      tags: [],
      insight_codes: [],
      reason_codes: []
    },
    coach_review: { hasOpenReview: false }
  };
}

/** Expose raw fact pack for Full report richer sections (tags vs_median, etc.). */
export function rawFactPackFromPlan(
  plan: DistributionPlanWire | null
): CoachFactPackWire | null {
  if (!plan || plan.assistant_mode !== "coach_review") return null;
  const proposalRaw = plan.assistant_plan?.proposal;
  if (!isCoachProposeResult(proposalRaw)) return null;
  return proposalRaw.fact_pack;
}
