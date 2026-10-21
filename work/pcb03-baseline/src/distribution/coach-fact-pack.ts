/**
 * @fileoverview Relay Coach Fact Pack — deterministic performance attribution signals
 * for Attack Review Fact-Finding. LLM may narrate only from these codes + numbers.
 *
 * Timing uses posted distribution attempts only (never Relay-native publish times).
 * @see .cursor/plans/phase_b_coach_facts_3b9d182d.plan.md
 */

import type { PrismaClient } from "@prisma/client";
import { PostSource, PostUpstreamStatus } from "@prisma/client";
import {
  getPerformanceInsightActions,
  type PerformanceInsightActionWire
} from "../analytics/performance-insight-actions.js";
import {
  listCreatorPerformanceGoals,
  type PerformanceGoalWire
} from "../analytics/performance-insight-goals-service.js";
import {
  getPerformanceOverview,
  getPerformancePostVariant,
  getPerformanceTagRollups,
  getPerformanceWorkBundle,
  listPerformanceWorks,
  type PerformanceOverviewReport,
  type PerformancePostVariantReport,
  type PerformanceTagGroupWire,
  type PerformanceWorkSummaryWire
} from "../analytics/performance-intelligence-read.js";
import type { UnifiedPerformanceMetricTotals } from "../analytics/creator-unified-performance.js";
import type { DistributionDestination } from "./platform-destinations.js";
import type { PostingAssistantFacts } from "./posting-assistant-service.js";

export const COACH_FACT_RANGE = "30d" as const;
export const COACH_TIMING_MIN_SAMPLE = 5;
const DEST_CONCENTRATION_THRESHOLD = 0.7;
const MAX_REASON_CODES = 8;
const MAX_INSIGHT_CODES = 3;
const MAX_GOALS = 3;
const MAX_TAGS = 3;
const MAX_DEST_MIX = 3;
const MAX_GAPS = 3;

const ALLOWED_SOURCES = new Set([
  "platform_api",
  "extension_dom",
  "third_party",
  "relay",
  "manual",
  "public_scrape"
]);

export type CoachTimingConfidence = "high" | "low";

export type CoachFactCoverage = {
  as_of: string;
  range: typeof COACH_FACT_RANGE;
  stale: boolean;
  with_metrics: string[];
  without_metrics: string[];
  sources: string[];
};

export type CoachFactDestinationRow = {
  dest: string;
  reach: number;
  likes: number;
  comments: number;
  engagement_rate: number;
};

export type CoachFactThisPost = {
  reach: number;
  likes: number;
  comments: number;
  by_destination: CoachFactDestinationRow[];
};

export type CoachFactDestinationMix = {
  dest: string;
  reach_share: number;
};

export type CoachFactTag = {
  tag: string;
  reach: number;
  vs_median: "above" | "below" | "unknown";
};

export type CoachFactContrast = {
  label: string;
  reach: number;
  top_destination: string | null;
};

export type CoachFactStructure = {
  role: string | null;
  gaps: string[];
};

export type CoachFactInsightCode = {
  code: string;
  evidence: string;
};

export type CoachFactGoal = {
  id: string;
  metric: string;
  label: string;
  current: number;
  target: number;
  progress_ratio: number;
  pace_status: string;
};

export type CoachFactCadence = {
  monthly_post_target: number;
  posts_this_month: number;
  historical_hour_of_day: number | null;
  sample_size: number;
  timing_confidence: CoachTimingConfidence;
  timezone: string;
};

export type CoachFactPack = {
  coverage: CoachFactCoverage;
  this_post: CoachFactThisPost | null;
  destination_mix: CoachFactDestinationMix[];
  tags: CoachFactTag[];
  contrast: CoachFactContrast | null;
  structure: CoachFactStructure | null;
  insight_codes: CoachFactInsightCode[];
  goals: CoachFactGoal[];
  cadence: CoachFactCadence;
  reason_codes: string[];
};

export type BuildCoachFactPackInput = {
  prisma: PrismaClient;
  creatorId: string;
  postId: string;
  selectedDestinations: DistributionDestination[];
  /** Tags on this post (canonical / creative-work). Matched against tag rollups. */
  postTags?: string[];
  timeZone?: string;
};

function reachFromTotals(totals: UnifiedPerformanceMetricTotals): number {
  return totals.impressions + totals.seen + totals.views;
}

function engagementRate(likes: number, comments: number, reach: number): number {
  return (likes + comments) / Math.max(reach, 1);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

/**
 * Hour-of-day mode from posted distribution attempts only (`completedAt`).
 * Never uses Relay-native publish timestamps (import skew).
 */
export async function computePostedAttemptHour(
  prisma: PrismaClient,
  creatorId: string,
  timeZone: string
): Promise<{ hour: number | null; sampleSize: number }> {
  const attempts = await prisma.postDistributionAttempt.findMany({
    where: { creatorId, status: "posted", completedAt: { not: null } },
    select: { completedAt: true },
    orderBy: { completedAt: "desc" },
    take: 50
  });

  const fmt = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: false });
  const hourCounts = new Map<number, number>();
  for (const attempt of attempts) {
    if (!attempt.completedAt) continue;
    const parts = fmt.formatToParts(attempt.completedAt);
    const raw = Number(parts.find((p) => p.type === "hour")?.value ?? "NaN");
    if (!Number.isFinite(raw)) continue;
    const hour = raw % 24;
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
  }

  const sampleSize = [...hourCounts.values()].reduce((sum, n) => sum + n, 0);
  if (sampleSize === 0) {
    return { hour: null, sampleSize: 0 };
  }

  let bestHour = 0;
  let bestCount = -1;
  for (const [hour, count] of hourCounts) {
    if (count > bestCount) {
      bestCount = count;
      bestHour = hour;
    }
  }
  return { hour: bestHour, sampleSize };
}

async function loadCadenceFacts(
  prisma: PrismaClient,
  creatorId: string,
  timeZoneHint?: string
): Promise<CoachFactCadence> {
  const goal = await prisma.creatorPostingGoal.findUnique({
    where: { creatorId },
    select: { monthlyPostTarget: true, timezone: true }
  });
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const postsThisMonth = await prisma.post.count({
    where: {
      creatorId,
      source: PostSource.RELAY,
      upstreamStatus: PostUpstreamStatus.active,
      createdAt: { gte: monthStart }
    }
  });
  const timezone = goal?.timezone?.trim() || timeZoneHint?.trim() || "UTC";
  const { hour, sampleSize } = await computePostedAttemptHour(prisma, creatorId, timezone);
  const timingConfidence: CoachTimingConfidence =
    sampleSize >= COACH_TIMING_MIN_SAMPLE ? "high" : "low";

  return {
    monthly_post_target: goal?.monthlyPostTarget ?? 1,
    posts_this_month: postsThisMonth,
    historical_hour_of_day: timingConfidence === "high" ? hour : null,
    sample_size: sampleSize,
    timing_confidence: timingConfidence,
    timezone
  };
}

/** Map insight-action card ids → compact reason codes (no UI payload). */
export function mapInsightActionToCode(
  action: PerformanceInsightActionWire
): CoachFactInsightCode | null {
  const id = action.id;
  let code: string | null = null;
  if (id === "perf-posting-goal-behind") code = "goal_behind_pace";
  else if (id === "perf-refresh-stale-rollups") code = "data_stale";
  else if (id === "perf-double-down-work") code = "double_down_work";
  else if (id === "perf-improve-offer") code = "engagement_rate_low_vs_reach";
  else if (id === "perf-make-another-like-this") code = "top_post_pattern";
  else if (id === "perf-turn-into-promo") code = "promo_opportunity";
  else if (id === "perf-test-platform") code = "dest_concentration";
  else if (id === "perf-set-campaign-goal") code = "campaign_goal_opportunity";
  else if (id.startsWith("perf-bundle-merge-")) code = "bundle_suggestion";
  if (!code) return null;
  const evidence = (action.trigger || action.body || "").trim().slice(0, 160);
  if (!evidence) return null;
  return { code, evidence };
}

function buildThisPost(report: PerformancePostVariantReport): CoachFactThisPost | null {
  const byDestination: CoachFactDestinationRow[] = [];
  for (const row of report.by_destination) {
    const reach = reachFromTotals(row);
    const likes = row.likes;
    const comments = row.comments;
    if (reach <= 0 && likes <= 0 && comments <= 0) continue;
    byDestination.push({
      dest: row.destination,
      reach,
      likes,
      comments,
      engagement_rate: engagementRate(likes, comments, reach)
    });
  }
  byDestination.sort((a, b) => b.reach - a.reach);

  const reach = report.total_reach;
  const likes = report.totals.likes;
  const comments = report.totals.comments;
  if (reach <= 0 && likes <= 0 && comments <= 0 && byDestination.length === 0) {
    return null;
  }
  return { reach, likes, comments, by_destination: byDestination };
}

function buildDestinationMix(overview: PerformanceOverviewReport): {
  mix: CoachFactDestinationMix[];
  concentrationDest: string | null;
} {
  const rows = overview.performance.by_destination
    .map((row) => ({ dest: row.destination, reach: reachFromTotals(row) }))
    .filter((row) => row.reach > 0)
    .sort((a, b) => b.reach - a.reach);

  const total = rows.reduce((sum, row) => sum + row.reach, 0);
  if (total <= 0) return { mix: [], concentrationDest: null };

  const mix = rows.slice(0, MAX_DEST_MIX).map((row) => ({
    dest: row.dest,
    reach_share: Math.round((row.reach / total) * 1000) / 1000
  }));

  const top = rows[0];
  const concentrationDest =
    top && top.reach / total >= DEST_CONCENTRATION_THRESHOLD ? top.dest : null;
  return { mix, concentrationDest };
}

function buildTagFacts(
  postTags: string[],
  groups: PerformanceTagGroupWire[]
): CoachFactTag[] {
  if (postTags.length === 0 || groups.length === 0) return [];

  const reaches = groups.map((g) => g.total_reach).filter((r) => r > 0);
  const med = median(reaches);

  const byTag = new Map(groups.map((g) => [g.tag.toLowerCase(), g]));
  const out: CoachFactTag[] = [];
  for (const raw of postTags) {
    if (out.length >= MAX_TAGS) break;
    const key = raw.trim().toLowerCase();
    if (!key) continue;
    const group = byTag.get(key);
    if (!group || group.total_reach <= 0) continue;
    let vsMedian: CoachFactTag["vs_median"] = "unknown";
    if (med != null && med > 0) {
      vsMedian = group.total_reach >= med ? "above" : "below";
    }
    out.push({ tag: group.tag, reach: group.total_reach, vs_median: vsMedian });
  }
  return out;
}

function buildContrast(
  works: PerformanceWorkSummaryWire[],
  thisPost: CoachFactThisPost | null
): { contrast: CoachFactContrast | null; reason: string | null } {
  const top = works.find((w) => w.total_reach > 0) ?? null;
  if (!top) return { contrast: null, reason: null };

  const topDest =
    [...top.by_destination]
      .map((row) => ({ dest: row.destination, reach: reachFromTotals(row) }))
      .sort((a, b) => b.reach - a.reach)[0]?.dest ?? null;

  const contrast: CoachFactContrast = {
    label: top.title || top.creative_work_id,
    reach: top.total_reach,
    top_destination: topDest
  };

  if (!thisPost || thisPost.reach <= 0) {
    return { contrast, reason: null };
  }
  if (thisPost.reach >= top.total_reach * 0.75) {
    return { contrast, reason: "near_top" };
  }
  if (thisPost.reach < top.total_reach * 0.25) {
    return { contrast, reason: "below_top_quartile" };
  }
  return { contrast, reason: null };
}

function buildGoals(goals: PerformanceGoalWire[]): CoachFactGoal[] {
  return goals.slice(0, MAX_GOALS).map((g) => ({
    id: g.id,
    metric: g.metric,
    label: g.label?.trim() || g.scope_label,
    current: g.current_value,
    target: g.target_value,
    progress_ratio: g.progress_ratio,
    pace_status: g.pace_status
  }));
}

function buildCoverage(args: {
  asOf: string;
  stale: boolean;
  overview: PerformanceOverviewReport | null;
  thisPost: CoachFactThisPost | null;
  selectedDestinations: DistributionDestination[];
}): CoachFactCoverage {
  const withSet = new Set<string>();
  if (args.overview) {
    for (const row of args.overview.performance.by_destination) {
      if (reachFromTotals(row) > 0) withSet.add(row.destination);
    }
    for (const src of args.overview.source_summary) {
      if (src.confidence !== "unknown") withSet.add(src.destination);
    }
  }
  if (args.thisPost) {
    for (const row of args.thisPost.by_destination) {
      if (row.reach > 0 || row.likes > 0 || row.comments > 0) withSet.add(row.dest);
    }
  }

  const with_metrics = [...withSet].sort();
  const without_metrics = args.selectedDestinations
    .filter((d) => !withSet.has(d))
    .sort();

  const sources = new Set<string>();
  if (args.overview) {
    for (const src of args.overview.source_summary) {
      const normalized = src.source.trim();
      if (ALLOWED_SOURCES.has(normalized)) sources.add(normalized);
    }
    if (args.overview.performance.source === "rollup" && sources.size === 0) {
      // Rollup present but no per-dest source rows — still note relay telemetry path.
      sources.add("relay");
    }
  }

  return {
    as_of: args.asOf,
    range: COACH_FACT_RANGE,
    stale: args.stale,
    with_metrics,
    without_metrics,
    sources: [...sources].sort()
  };
}

function collectReasonCodes(args: {
  partial: boolean;
  coverage: CoachFactCoverage;
  concentrationDest: string | null;
  tags: CoachFactTag[];
  contrastReason: string | null;
  structure: CoachFactStructure | null;
  insightCodes: CoachFactInsightCode[];
  goals: CoachFactGoal[];
  cadence: CoachFactCadence;
  thisPost: CoachFactThisPost | null;
}): string[] {
  const codes: string[] = [];
  const push = (code: string) => {
    if (!codes.includes(code) && codes.length < MAX_REASON_CODES) codes.push(code);
  };

  if (args.partial) push("analytics_partial");
  if (args.coverage.stale) push("data_stale");

  const measuredSocial = args.coverage.with_metrics.filter(
    (d) => d !== "relay" && d !== "patreon"
  );
  if (
    args.coverage.with_metrics.length > 0 &&
    measuredSocial.length === 0 &&
    (args.coverage.with_metrics.includes("patreon") ||
      args.coverage.with_metrics.includes("relay"))
  ) {
    push("coverage_patreon_only");
  }

  if (args.concentrationDest) {
    push(`dest_concentration_${args.concentrationDest}`);
  }

  for (const tag of args.tags) {
    if (tag.vs_median === "above") push("tag_above_median_reach");
    if (tag.vs_median === "below") push("tag_below_median_reach");
  }

  if (args.contrastReason) push(args.contrastReason);

  if (args.structure && args.structure.gaps.length > 0) {
    push("crosspost_gap");
    for (const gap of args.structure.gaps.slice(0, 2)) {
      push(`crosspost_gap_${gap}`);
    }
  }

  for (const insight of args.insightCodes) {
    push(insight.code);
  }

  for (const goal of args.goals) {
    if (goal.pace_status === "behind") push("goal_behind_reach");
  }

  if (args.cadence.timing_confidence === "low") push("timing_insufficient");

  if (args.thisPost) {
    const eng = engagementRate(args.thisPost.likes, args.thisPost.comments, args.thisPost.reach);
    if (args.thisPost.reach >= 500 && eng >= 0.04) push("engagement_rate_high_vs_reach");
  }

  return codes;
}

function emptyCoverage(asOf: string, selected: DistributionDestination[]): CoachFactCoverage {
  return {
    as_of: asOf,
    range: COACH_FACT_RANGE,
    stale: false,
    with_metrics: [],
    without_metrics: [...selected].sort(),
    sources: []
  };
}

/** Map cadence slice into legacy PostingAssistantFacts for propose wiring. */
export function cadenceToPostingAssistantFacts(cadence: CoachFactCadence): PostingAssistantFacts {
  return {
    monthly_post_target: cadence.monthly_post_target,
    posts_this_month: cadence.posts_this_month,
    historical_hour_of_day: cadence.historical_hour_of_day,
    sample_size: cadence.sample_size,
    timezone: cadence.timezone
  };
}

/**
 * Build a capped, deterministic CoachFactPack for Fact-Finding.
 * Individual analytics read failures degrade that section; propose still succeeds.
 */
export async function buildCoachFactPack(
  input: BuildCoachFactPackInput
): Promise<CoachFactPack> {
  const creatorId = input.creatorId.trim();
  const postId = input.postId.trim();
  const selected = input.selectedDestinations;
  const postTags = (input.postTags ?? []).map((t) => t.trim()).filter(Boolean);
  const asOfFallback = new Date().toISOString();

  let partial = false;

  const settled = await Promise.allSettled([
    getPerformanceOverview(input.prisma, creatorId, { range: COACH_FACT_RANGE }),
    getPerformancePostVariant(input.prisma, creatorId, postId, { range: COACH_FACT_RANGE }),
    getPerformanceTagRollups(input.prisma, creatorId, { range: COACH_FACT_RANGE }),
    listPerformanceWorks(input.prisma, creatorId, { range: COACH_FACT_RANGE, limit: 8 }),
    getPerformanceInsightActions(input.prisma, creatorId, { range: COACH_FACT_RANGE }),
    listCreatorPerformanceGoals(input.prisma, creatorId, { range: COACH_FACT_RANGE }),
    loadCadenceFacts(input.prisma, creatorId, input.timeZone)
  ]);

  const overviewOut = settled[0].status === "fulfilled" ? settled[0].value : null;
  const postOut = settled[1].status === "fulfilled" ? settled[1].value : null;
  const tagsOut = settled[2].status === "fulfilled" ? settled[2].value : null;
  const worksOut = settled[3].status === "fulfilled" ? settled[3].value : null;
  const insightsOut = settled[4].status === "fulfilled" ? settled[4].value : null;
  const goalsOut = settled[5].status === "fulfilled" ? settled[5].value : null;
  const cadence =
    settled[6].status === "fulfilled"
      ? settled[6].value
      : ({
          monthly_post_target: 1,
          posts_this_month: 0,
          historical_hour_of_day: null,
          sample_size: 0,
          timing_confidence: "low" as const,
          timezone: input.timeZone?.trim() || "UTC"
        } satisfies CoachFactCadence);

  for (const result of settled) {
    if (result.status === "rejected") partial = true;
  }
  if (overviewOut && !overviewOut.ok) partial = true;
  if (postOut && !postOut.ok) partial = true;
  if (tagsOut && !tagsOut.ok) partial = true;
  if (worksOut && !worksOut.ok) partial = true;
  if (insightsOut && !insightsOut.ok) partial = true;
  if (goalsOut && !goalsOut.ok) partial = true;
  if (settled[6].status === "rejected") partial = true;

  const overview = overviewOut?.ok ? overviewOut.report : null;
  const postReport = postOut?.ok ? postOut.report : null;
  const this_post = postReport ? buildThisPost(postReport) : null;

  const { mix: destination_mix, concentrationDest } = overview
    ? buildDestinationMix(overview)
    : { mix: [] as CoachFactDestinationMix[], concentrationDest: null };

  const tags = tagsOut?.ok
    ? buildTagFacts(postTags, tagsOut.report.groups)
    : [];

  const { contrast, reason: contrastReason } = worksOut?.ok
    ? buildContrast(worksOut.report.works, this_post)
    : { contrast: null, reason: null };

  let structure: CoachFactStructure | null = null;
  if (postReport?.creative_work?.creative_work_id) {
    try {
      const bundleOut = await getPerformanceWorkBundle(
        input.prisma,
        creatorId,
        postReport.creative_work.creative_work_id,
        { range: COACH_FACT_RANGE }
      );
      if (bundleOut.ok) {
        structure = {
          role: postReport.creative_work.variant_role || null,
          gaps: bundleOut.report.crosspost_gaps.missing_destinations.slice(0, MAX_GAPS)
        };
      } else {
        partial = true;
        structure = {
          role: postReport.creative_work.variant_role || null,
          gaps: []
        };
      }
    } catch {
      partial = true;
      structure = {
        role: postReport.creative_work.variant_role || null,
        gaps: []
      };
    }
  }

  const insight_codes: CoachFactInsightCode[] = [];
  if (insightsOut?.ok) {
    for (const action of insightsOut.report.actions) {
      if (insight_codes.length >= MAX_INSIGHT_CODES) break;
      const mapped = mapInsightActionToCode(action);
      if (mapped) insight_codes.push(mapped);
    }
  }

  const goals = goalsOut?.ok ? buildGoals(goalsOut.report.goals) : [];

  const as_of =
    overview?.as_of ??
    postReport?.as_of ??
    (worksOut?.ok ? worksOut.report.as_of : null) ??
    asOfFallback;
  const stale = overview?.freshness.stale ?? postReport?.freshness.stale ?? false;

  const coverage =
    overview || this_post
      ? buildCoverage({
          asOf: as_of,
          stale,
          overview,
          thisPost: this_post,
          selectedDestinations: selected
        })
      : emptyCoverage(as_of, selected);

  const reason_codes = collectReasonCodes({
    partial,
    coverage,
    concentrationDest,
    tags,
    contrastReason,
    structure,
    insightCodes: insight_codes,
    goals,
    cadence,
    thisPost: this_post
  });

  return {
    coverage,
    this_post,
    destination_mix,
    tags,
    contrast,
    structure,
    insight_codes,
    goals,
    cadence,
    reason_codes
  };
}
