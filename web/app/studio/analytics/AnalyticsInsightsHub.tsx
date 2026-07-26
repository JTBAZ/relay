"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  Eye,
  Heart,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Star,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import type {
  BundleSuggestionsData,
  CreatorMembershipSummaryData,
  CreatorPostPerformanceData,
  CreatorTierStickinessData,
  CreatorUnifiedPerformanceData,
  CreatorUnifiedPerformanceRange,
  CreatorUsagePreviewData,
  PerformanceCampaignRollupsData,
  PerformanceGoalsData,
  PerformanceGoalSuggestionWire,
  PerformanceOverviewData,
  PerformanceTagRollupsData,
  PerformanceWorksListData
} from "@/lib/relay-api";
import { PerformanceHierarchyPanel } from "./PerformanceHierarchyPanel";
import { PerformanceGoalsPanel } from "./PerformanceGoalsPanel";

type TimeScale = CreatorUnifiedPerformanceRange;
type InsightFamily = "goals" | "trends" | "actions";
type PostMetricMode = "engagement" | "conversions" | "tips";
type PerformanceViewMode = "graph" | "table";

type RadialPostMetric = {
  id: string;
  title: string;
  publishedAt: string | null;
  impressions: number;
  seen: number;
  likes: number;
  comments: number;
  conversions: number;
  href: string;
  thumbnailUrl?: string;
  angle: number;
  normalizedReach: number;
  normalizedViews: number;
  source: "live" | "mock" | "derived";
};

type CreatorActionCard = {
  id: string;
  title: string;
  trigger: string;
  body: string;
  actionLabel?: string;
  href?: string;
  tone: "active" | "watching" | "guidance";
  confidence?: "high" | "medium" | "low";
  source?: "legacy" | "performance";
};

type AnalyticsInsightsHubProps = {
  performance: CreatorPostPerformanceData | null;
  unifiedPerformance: CreatorUnifiedPerformanceData | null;
  performanceRange: TimeScale;
  onPerformanceRangeChange: (range: TimeScale) => void;
  summary: CreatorMembershipSummaryData | null;
  summary7d: CreatorMembershipSummaryData | null;
  stickiness: CreatorTierStickinessData | null;
  usagePreview: CreatorUsagePreviewData | null;
  actionCards: CreatorActionCard[];
  performanceOverview: PerformanceOverviewData | null;
  performanceCampaigns: PerformanceCampaignRollupsData | null;
  performanceTags: PerformanceTagRollupsData | null;
  performanceWorks: PerformanceWorksListData | null;
  bundleSuggestions: BundleSuggestionsData | null;
  hierarchyDestination: string | null;
  onHierarchyDestinationChange: (destination: string | null) => void;
  performanceGoals: PerformanceGoalsData | null;
  goalsBusySuggestionId: string | null;
  onAdoptPerformanceGoalSuggestion: (suggestion: PerformanceGoalSuggestionWire) => void;
  onRemovePerformanceGoal: (goalId: string) => void;
};

const SCALE_DAYS: Record<TimeScale, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90
};

const INSIGHT_FAMILIES: Array<{
  id: InsightFamily;
  label: string;
  eyebrow: string;
  description: string;
}> = [
  {
    id: "goals",
    label: "Goals",
    eyebrow: "Cadence and targets",
    description: "Track posting pace, goal distance, and the next publishing move."
  },
  {
    id: "trends",
    label: "Trends",
    eyebrow: "Growth and audience",
    description: "Watch member movement, retention pressure, reach, and friction signals."
  },
  {
    id: "actions",
    label: "Actions",
    eyebrow: "What to do next",
    description: "Convert the clearest signals into direct Relay moves."
  }
];

function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "--";
  return Math.round(value).toLocaleString();
}

function formatMoneyCents(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "--";
  return `$${Math.round(value / 100).toLocaleString()}`;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "--";
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

function topInterestRow(performance: CreatorPostPerformanceData | null) {
  return [...(performance?.rows ?? [])]
    .filter((row) => row.insights)
    .sort((a, b) => {
      const aScore =
        a.insights?.seen ?? a.insights?.impressions ?? (a.insights?.likes ?? 0) + (a.insights?.comments ?? 0);
      const bScore =
        b.insights?.seen ?? b.insights?.impressions ?? (b.insights?.likes ?? 0) + (b.insights?.comments ?? 0);
      return bScore - aScore;
    })[0] ?? null;
}

function titleForPerformanceRow(row: CreatorPostPerformanceData["rows"][number]): string {
  return row.relay?.title?.trim() || row.patreon_post_id;
}

const MOCK_RADIAL_POST_TEMPLATES: Array<
  Omit<RadialPostMetric, "angle" | "normalizedReach" | "normalizedViews" | "publishedAt"> & {
    daysAgo: number;
  }
> = [
  {
    id: "mock-reach-morning-routine",
    title: "My morning routine for deep work",
    daysAgo: 3,
    impressions: 5100,
    seen: 2400,
    likes: 238,
    comments: 44,
    conversions: 44,
    href: "/studio/preview?post_id=mock-reach-morning-routine",
    thumbnailUrl: "https://picsum.photos/seed/p01/120/120",
    source: "mock"
  },
  {
    id: "mock-reach-process-study",
    title: "Process study: color blocking",
    daysAgo: 6,
    impressions: 3800,
    seen: 1600,
    likes: 182,
    comments: 29,
    conversions: 18,
    href: "/studio/preview?post_id=mock-reach-process-study",
    thumbnailUrl: "https://picsum.photos/seed/p02/120/120",
    source: "mock"
  },
  {
    id: "mock-reach-sketch-pack",
    title: "Sketch pack preview",
    daysAgo: 10,
    impressions: 2900,
    seen: 1800,
    likes: 211,
    comments: 22,
    conversions: 31,
    href: "/studio/preview?post_id=mock-reach-sketch-pack",
    thumbnailUrl: "https://picsum.photos/seed/p03/120/120",
    source: "mock"
  },
  {
    id: "mock-reach-archive-drop",
    title: "Archive drop: hidden studies",
    daysAgo: 15,
    impressions: 2100,
    seen: 900,
    likes: 86,
    comments: 14,
    conversions: 8,
    href: "/studio/preview?post_id=mock-reach-archive-drop",
    thumbnailUrl: "https://picsum.photos/seed/p04/120/120",
    source: "mock"
  },
  {
    id: "mock-reach-studio-notes",
    title: "Studio notes and tools",
    daysAgo: 22,
    impressions: 1600,
    seen: 760,
    likes: 64,
    comments: 9,
    conversions: 5,
    href: "/studio/preview?post_id=mock-reach-studio-notes",
    thumbnailUrl: "https://picsum.photos/seed/p05/120/120",
    source: "mock"
  },
  {
    id: "mock-reach-wip-teaser",
    title: "WIP teaser: background pass",
    daysAgo: 28,
    impressions: 1200,
    seen: 640,
    likes: 72,
    comments: 11,
    conversions: 10,
    href: "/studio/preview?post_id=mock-reach-wip-teaser",
    thumbnailUrl: "https://picsum.photos/seed/p06/120/120",
    source: "mock"
  },
  {
    id: "mock-reach-newsletter-lessons",
    title: "Lessons from 100 newsletter issues",
    daysAgo: 45,
    impressions: 7200,
    seen: 3100,
    likes: 540,
    comments: 39,
    conversions: 27,
    href: "/studio/preview?post_id=mock-reach-newsletter-lessons",
    thumbnailUrl: "https://picsum.photos/seed/p07/120/120",
    source: "mock"
  },
  {
    id: "mock-reach-shipping",
    title: "Stop optimising - start shipping",
    daysAgo: 60,
    impressions: 3100,
    seen: 1400,
    likes: 122,
    comments: 17,
    conversions: 12,
    href: "/studio/preview?post_id=mock-reach-shipping",
    thumbnailUrl: "https://picsum.photos/seed/p08/120/120",
    source: "mock"
  },
  {
    id: "mock-reach-writing-system",
    title: "The writing system that changed everything",
    daysAgo: 75,
    impressions: 5500,
    seen: 2500,
    likes: 210,
    comments: 31,
    conversions: 22,
    href: "/studio/preview?post_id=mock-reach-writing-system",
    thumbnailUrl: "https://picsum.photos/seed/p09/120/120",
    source: "mock"
  },
  {
    id: "mock-reach-pricing-product",
    title: "How to price your first digital product",
    daysAgo: 85,
    impressions: 9100,
    seen: 4200,
    likes: 602,
    comments: 56,
    conversions: 43,
    href: "/studio/preview?post_id=mock-reach-pricing-product",
    thumbnailUrl: "https://picsum.photos/seed/p10/120/120",
    source: "mock"
  }
];

function engagementSaturationShare(seen: number, likes: number, comments: number): number {
  if (seen <= 0) return 0;
  const signals = likes + comments;
  if (signals <= 0) return 0;
  return Math.min(1, signals / seen);
}

type PostPerformanceBadge = {
  label: "Hot" | "Fan Favorite" | "Conversation" | "Sleeper Hit" | "Wide Reach";
  tone: "hot" | "favorite" | "conversation" | "sleeper" | "reach";
  detail: string;
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[midpoint - 1] + sorted[midpoint]) / 2 : sorted[midpoint];
}

function percentile(values: number[], threshold: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * threshold) - 1));
  return sorted[index];
}

function postPerformanceBadge(
  metric: RadialPostMetric,
  cohort: RadialPostMetric[]
): PostPerformanceBadge | null {
  const signals = metric.likes + metric.comments;
  const engagementRate = metric.seen > 0 ? signals / metric.seen : 0;
  const likeRate = metric.seen > 0 ? metric.likes / metric.seen : 0;
  const commentRate = metric.seen > 0 ? metric.comments / metric.seen : 0;
  const medianImpressions = median(cohort.map((row) => row.impressions));
  const medianViews = median(cohort.map((row) => row.seen));
  const minimumViews = Math.max(100, medianViews * 0.6);
  const topSignals = percentile(cohort.map((row) => row.likes + row.comments), 0.85);
  const topLikes = percentile(cohort.map((row) => row.likes), 0.85);
  const topComments = percentile(cohort.map((row) => row.comments), 0.85);
  const topEngagementRate = percentile(cohort.map((row) => engagementSaturationShare(row.seen, row.likes, row.comments)), 0.85);
  const topLikeRate = percentile(cohort.map((row) => (row.seen > 0 ? row.likes / row.seen : 0)), 0.85);
  const topCommentRate = percentile(cohort.map((row) => (row.seen > 0 ? row.comments / row.seen : 0)), 0.85);
  const topReach = percentile(cohort.map((row) => row.impressions), 0.9);
  const topViews = percentile(cohort.map((row) => row.seen), 0.9);

  if (
    metric.impressions <= medianImpressions * 0.75 &&
    metric.seen >= Math.max(80, medianViews * 0.35) &&
    engagementRate >= Math.max(0.1, topEngagementRate) &&
    signals >= Math.max(40, topSignals * 0.35)
  ) {
    return {
      label: "Sleeper Hit",
      tone: "sleeper",
      detail: "Lower reach, unusually strong fan response."
    };
  }

  if (
    metric.seen >= minimumViews &&
    engagementRate >= Math.max(0.1, topEngagementRate) &&
    signals >= Math.max(60, topSignals * 0.75)
  ) {
    return {
      label: "Hot",
      tone: "hot",
      detail: "Strong response from the people who viewed it."
    };
  }

  if (metric.comments >= Math.max(8, topComments) && commentRate >= Math.max(0.02, topCommentRate)) {
    return {
      label: "Conversation",
      tone: "conversation",
      detail: "Comment-heavy response compared with nearby posts."
    };
  }

  if (metric.likes >= Math.max(30, topLikes) && likeRate >= Math.max(0.07, topLikeRate)) {
    return {
      label: "Fan Favorite",
      tone: "favorite",
      detail: "Like-heavy response from viewers."
    };
  }

  if (metric.impressions >= topReach || metric.seen >= topViews) {
    return {
      label: "Wide Reach",
      tone: "reach",
      detail: "This post traveled farther than most in this window."
    };
  }

  return null;
}

function buildMockRadialPosts(
  now = Date.now()
): Array<Omit<RadialPostMetric, "angle" | "normalizedReach" | "normalizedViews">> {
  return MOCK_RADIAL_POST_TEMPLATES.map(({ daysAgo, ...template }) => ({
    ...template,
    publishedAt: new Date(now - daysAgo * 86_400_000).toISOString()
  }));
}

function isPublishedWithinWindow(
  publishedAt: string | null | undefined,
  days: number,
  now = Date.now()
): boolean {
  if (!publishedAt) return false;
  const publishedMs = new Date(publishedAt).getTime();
  if (!Number.isFinite(publishedMs) || publishedMs > now) return false;
  return now - publishedMs <= days * 86_400_000;
}

function rowToRadialMetric(
  row: CreatorPostPerformanceData["rows"][number],
  fallbackIndex: number
): Omit<RadialPostMetric, "angle" | "normalizedReach" | "normalizedViews"> {
  const id = row.post_id ?? row.patreon_post_id ?? `post-${fallbackIndex}`;
  const impressions = row.insights?.impressions ?? row.insights?.seen ?? 0;
  const seen = row.insights?.seen ?? Math.round(impressions * 0.45);
  const likes = row.insights?.likes ?? 0;
  const comments = row.insights?.comments ?? 0;
  return {
    id,
    title: titleForPerformanceRow(row),
    publishedAt: row.relay?.published_at ?? row.insights?.as_of ?? null,
    impressions,
    seen,
    likes,
    comments,
    conversions: comments,
    href: row.post_id ? `/studio/preview?post_id=${encodeURIComponent(row.post_id)}` : "/studio/analytics",
    source: row.insights ? "live" : "derived"
  };
}

function unifiedTopPostToRadialMetric(
  post: CreatorUnifiedPerformanceData["top_posts"][number],
  source: CreatorUnifiedPerformanceData["source"]
): Omit<RadialPostMetric, "angle" | "normalizedReach" | "normalizedViews"> {
  const patreon = post.destinations.find((entry) => entry.destination === "patreon");
  const impressions =
    patreon?.impressions ??
    post.destinations.reduce((sum, entry) => sum + entry.impressions, 0);
  const seen =
    patreon?.seen ?? post.destinations.reduce((sum, entry) => sum + entry.seen + entry.views, 0);
  const likes = post.destinations.reduce((sum, entry) => sum + entry.likes, 0);
  const comments = post.destinations.reduce((sum, entry) => sum + entry.comments, 0);

  return {
    id: post.post_id,
    title: post.title?.trim() || post.post_id,
    publishedAt: null,
    impressions: impressions || post.total_reach,
    seen: seen || Math.round((impressions || post.total_reach) * 0.45),
    likes,
    comments,
    conversions: comments,
    href: `/studio/preview?post_id=${encodeURIComponent(post.post_id)}`,
    source: source === "rollup" ? "live" : "derived"
  };
}

function buildRadialPostMetrics(
  performance: CreatorPostPerformanceData | null,
  unifiedPerformance: CreatorUnifiedPerformanceData | null,
  days: number
): RadialPostMetric[] {
  if (unifiedPerformance?.top_posts?.length) {
    const liveRows = unifiedPerformance.top_posts.map((post) =>
      unifiedTopPostToRadialMetric(post, unifiedPerformance.source)
    );
    const sorted = [...liveRows].sort((a, b) => b.impressions - a.impressions);
    const maxReach = Math.max(1, ...sorted.map((row) => row.impressions));
    const step = (2 * Math.PI) / Math.max(sorted.length, 1);

    return sorted.slice(0, 18).map((row, index) => ({
      ...row,
      angle: -Math.PI / 2 + index * step,
      normalizedReach: Math.max(0.08, row.impressions / maxReach),
      normalizedViews: Math.max(0.08, row.seen / maxReach)
    }));
  }

  const now = Date.now();
  const liveRows = [...(performance?.rows ?? [])]
    .filter((row) => {
      const publishedAt = row.relay?.published_at ?? row.insights?.as_of;
      return isPublishedWithinWindow(publishedAt, days, now);
    })
    .map(rowToRadialMetric);

  const mockRows = buildMockRadialPosts(now).filter(
    (mock) => !liveRows.some((row) => row.id === mock.id) && isPublishedWithinWindow(mock.publishedAt, days, now)
  );

  const baseRows = (liveRows.length >= 8 ? liveRows : [...liveRows, ...mockRows]).slice(0, 18);
  const sorted = [...baseRows].sort((a, b) => b.impressions - a.impressions);
  const maxReach = Math.max(1, ...sorted.map((row) => row.impressions));
  const step = (2 * Math.PI) / Math.max(sorted.length, 1);

  return sorted.map((row, index) => ({
    ...row,
    angle: -Math.PI / 2 + index * step,
    normalizedReach: Math.max(0.08, row.impressions / maxReach),
    normalizedViews: Math.max(0.08, row.seen / maxReach)
  }));
}

function timeScaleLabel(scale: TimeScale): string {
  return scale === "7d" ? "Week" : scale === "30d" ? "Month" : "Quarter";
}

function formatDestinationLabel(destination: string): string {
  if (destination === "patreon") return "Patreon";
  if (destination === "x") return "X";
  if (destination === "deviantart") return "DeviantArt";
  if (destination === "relay") return "Relay";
  return destination;
}

function isUnifiedPerformanceStale(unified: CreatorUnifiedPerformanceData | null): boolean {
  if (!unified?.rollup_computed_at) return unified?.source === "csv_fallback";
  const computedMs = new Date(unified.rollup_computed_at).getTime();
  if (!Number.isFinite(computedMs)) return unified.source === "csv_fallback";
  return Date.now() - computedMs > 48 * 3_600_000;
}

function unifiedDataSourceLabel(unified: CreatorUnifiedPerformanceData | null): string {
  if (!unified) return "CSV import";
  if (unified.source === "csv_fallback") return "CSV import";
  return "Live rollups";
}

function metricChipMeta(mode: PostMetricMode): {
  label: string;
  dot: string;
  disabled?: boolean;
  badge?: string;
} {
  if (mode === "conversions") return { label: "Conversions", dot: "#60a5fa", badge: "proxy" };
  if (mode === "tips") return { label: "Tips", dot: "rgba(255,255,255,0.2)", badge: "soon", disabled: true };
  return { label: "Reach", dot: "#34d399" };
}

function bestTierFloorCents(summary: CreatorMembershipSummaryData | null): number | null {
  const amounts = summary?.tier_breakdown
    ?.map((tier) => tier.amount_cents)
    .filter((amount): amount is number => typeof amount === "number" && amount > 0);
  if (!amounts?.length) return null;
  return Math.min(...amounts);
}

function retentionScore(summary7d: CreatorMembershipSummaryData | null): number | null {
  if (!summary7d) return null;
  const base = summary7d.active_paying_members + summary7d.cancels_in_window;
  if (base <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((summary7d.active_paying_members / base) * 100)));
}

function strongestTierLoss(stickiness: CreatorTierStickinessData | null) {
  return [...(stickiness?.tiers ?? [])]
    .filter((tier) => tier.cancel_events_in_window > 0 || tier.churn_proxy > 0)
    .sort((a, b) => {
      if (b.cancel_events_in_window !== a.cancel_events_in_window) {
        return b.cancel_events_in_window - a.cancel_events_in_window;
      }
      return b.churn_proxy - a.churn_proxy;
    })[0] ?? null;
}

function PostReachRadialChart({
  metrics,
  activeIndex,
  lockedIndex,
  showReachSpokes,
  showViewsOverlay,
  showEngagementMarkers,
  onHover,
  onLock
}: {
  metrics: RadialPostMetric[];
  activeIndex: number | null;
  lockedIndex: number | null;
  showReachSpokes: boolean;
  showViewsOverlay: boolean;
  showEngagementMarkers: boolean;
  onHover: (index: number | null) => void;
  onLock: (index: number | null) => void;
}) {
  const size = 428;
  const cx = size / 2;
  const cy = size / 2;
  const centerRadius = 62;
  const minSpoke = 20;
  const maxSpoke = 100;
  const totalReach = metrics.reduce((sum, metric) => sum + metric.impressions, 0);
  const activeMetric = activeIndex == null ? null : metrics[activeIndex] ?? null;
  const topIndices = new Set(
    [...metrics]
      .map((metric, index) => ({ metric, index }))
      .sort((a, b) => b.metric.impressions - a.metric.impressions)
      .slice(0, 3)
      .map((item) => item.index)
  );

  if (metrics.length === 0) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-3xl border border-dashed border-[#1F1F1F] bg-[#050505]">
        <p className="max-w-[220px] text-center text-xs leading-relaxed text-[#777]">
          Waiting for post performance data. The reach map will populate as posts collect impressions.
        </p>
      </div>
    );
  }

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Post reach radial chart with ${metrics.length} posts and ${formatNumber(totalReach)} total impressions.`}
        className="overflow-visible"
      >
        <defs>
          <radialGradient id="post-reach-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#052e16" stopOpacity="0.58" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
          <filter id="post-reach-glow" x="0" y="0" width="428" height="428" filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="post-reach-active-glow" x="0" y="0" width="428" height="428" filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <style>
            {`
              @keyframes analytics-badge-pop {
                0% { opacity: 0; transform: translateY(5px) scale(0.72); }
                62% { opacity: 1; transform: translateY(-1px) scale(1.06); }
                100% { opacity: 1; transform: translateY(0) scale(1); }
              }
            `}
          </style>
        </defs>

        <circle cx={cx} cy={cy} r={190} fill="url(#post-reach-bg)" />
        {Array.from({ length: 40 }).map((_, index) => {
          const angle = -Math.PI / 2 + (index * 2 * Math.PI) / 40;
          return (
            <line
              key={`guide-${index}`}
              x1={cx}
              y1={cy}
              x2={cx + Math.cos(angle) * 188}
              y2={cy + Math.sin(angle) * 188}
              stroke="rgba(52,211,153,0.06)"
              strokeWidth={0.6}
            />
          );
        })}
        {[0.38, 0.68, 1].map((radiusScale) => (
          <circle
            key={radiusScale}
            cx={cx}
            cy={cy}
            r={centerRadius + maxSpoke * radiusScale}
            fill="none"
            stroke="rgba(52,211,153,0.055)"
            strokeWidth={0.75}
          />
        ))}

        {metrics.map((metric, index) => {
          const isActive = activeIndex === index;
          const isDimmed = activeIndex != null && !isActive;
          const length = minSpoke + metric.normalizedReach * (maxSpoke - minSpoke);
          const viewsShare = metric.impressions > 0 ? Math.min(metric.seen / metric.impressions, 1) : 0;
          const viewsLength = metric.seen > 0 ? Math.max(6, length * viewsShare) : 0;
          const startR = centerRadius + 6;
          const endR = startR + length;
          const visibleViewsEndR = startR + viewsLength;
          const collapsedViewsEndR = startR;
          const viewsEndR = showViewsOverlay ? visibleViewsEndR : collapsedViewsEndR;
          const unitX = Math.cos(metric.angle);
          const unitY = Math.sin(metric.angle);
          const rightX = -unitY;
          const rightY = unitX;
          const x1 = cx + unitX * startR;
          const y1 = cy + unitY * startR;
          const x2 = cx + unitX * endR;
          const y2 = cy + unitY * endR;
          const vx2 = cx + unitX * viewsEndR;
          const vy2 = cy + unitY * viewsEndR;
          const engagementSaturation = engagementSaturationShare(metric.seen, metric.likes, metric.comments);
          const performanceBadge = postPerformanceBadge(metric, metrics);
          const engagementFillLength =
            showEngagementMarkers && showViewsOverlay && viewsLength > 0 && engagementSaturation > 0
              ? viewsLength * engagementSaturation
              : 0;
          const engagementEndR = startR + engagementFillLength;
          const ex2 = cx + unitX * engagementEndR;
          const ey2 = cy + unitY * engagementEndR;
          const badgeWidth =
            performanceBadge?.label === "Hot"
              ? 38
              : performanceBadge?.label === "Wide Reach" || performanceBadge?.label === "Sleeper Hit"
                ? 70
                : performanceBadge?.label === "Conversation"
                  ? 84
                  : 82;
          const badgeHeight = 18;
          const badgePad = 6;
          const rawBadgeX = vx2 + unitX * 9 + rightX * 24;
          const rawBadgeY = vy2 + unitY * 9 + rightY * 24;
          const badgeX = Math.min(size - badgeWidth - badgePad, Math.max(badgePad, rawBadgeX - badgeWidth / 2));
          const badgeY = Math.min(size - badgeHeight - badgePad, Math.max(badgePad, rawBadgeY - badgeHeight / 2));
          const hitLen = length + 20;
          const hitX = cx + unitX * (startR - 10);
          const hitY = cy + unitY * (startR - 10);
          const hitAngle = (metric.angle * 180) / Math.PI;
          const dotX = cx + unitX * (centerRadius + 2);
          const dotY = cy + unitY * (centerRadius + 2);

          return (
            <g
              key={metric.id}
              role="button"
              tabIndex={0}
              aria-label={`${metric.title}, ${formatNumber(metric.impressions)} impressions`}
              aria-pressed={lockedIndex === index}
              onMouseEnter={() => onHover(index)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onLock(lockedIndex === index ? null : index)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onLock(lockedIndex === index ? null : index);
                }
              }}
              className="outline-none"
              style={{ cursor: "pointer" }}
            >
              {isActive ? (
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#34d399"
                  strokeWidth={showReachSpokes ? 10 : 0}
                  strokeLinecap="round"
                  opacity={showReachSpokes ? 0.15 : 0}
                  filter="url(#post-reach-active-glow)"
                />
              ) : null}
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={isActive ? "#6ee7b7" : "#34d399"}
                strokeWidth={showReachSpokes ? (isActive ? 3.5 : 2.5) : 0}
                strokeLinecap="round"
                opacity={showReachSpokes ? (isActive ? 1 : isDimmed ? 0.22 : 0.72) : 0}
                filter={isActive ? "url(#post-reach-glow)" : undefined}
                style={{ transition: "opacity 0.35s ease, stroke-width 0.2s ease" }}
              />
              <line
                x1={x1}
                y1={y1}
                x2={vx2}
                y2={vy2}
                stroke="#435E8E"
                strokeWidth={showViewsOverlay ? (isActive ? 10 : 8.2) : 0}
                strokeLinecap="round"
                opacity={showViewsOverlay ? (isDimmed ? 0.45 : 0.9) : 0}
                style={{
                  transition:
                    "x2 0.38s cubic-bezier(0.22,1,0.36,1), y2 0.38s cubic-bezier(0.22,1,0.36,1), opacity 0.28s ease, stroke-width 0.28s ease"
                }}
              />
              <line
                x1={x1}
                y1={y1}
                x2={vx2}
                y2={vy2}
                stroke="#004348"
                strokeWidth={showViewsOverlay ? (isActive ? 9 : 7.2) : 0}
                strokeLinecap="round"
                opacity={showViewsOverlay ? (isDimmed ? 0.45 : 0.9) : 0}
                filter={isActive && showViewsOverlay ? "url(#post-reach-glow)" : undefined}
                style={{
                  transition:
                    "x2 0.38s cubic-bezier(0.22,1,0.36,1), y2 0.38s cubic-bezier(0.22,1,0.36,1), opacity 0.28s ease, stroke-width 0.28s ease"
                }}
              />
              {topIndices.has(index) ? (
                <circle
                  cx={dotX}
                  cy={dotY}
                  r={isActive ? 4 : 3}
                  fill={isActive ? "#6ee7b7" : "#34d399"}
                  opacity={isActive ? 1 : isDimmed ? 0.3 : 0.7}
                  filter="url(#post-reach-glow)"
                />
              ) : null}
              <rect
                x={0}
                y={-12}
                width={hitLen}
                height={24}
                fill="transparent"
                transform={`translate(${hitX},${hitY}) rotate(${hitAngle})`}
              />
              {/*
                Engagement saturation sits inside the Views segment: fill length is the
                literal share of views that produced a like or comment.
              */}
              {showEngagementMarkers && engagementFillLength > 0 ? (
                <g pointerEvents="none">
                  <line
                    x1={x1}
                    y1={y1}
                    x2={ex2}
                    y2={ey2}
                    stroke="#435E8E"
                    strokeWidth={isActive ? 5.5 : 4.5}
                    strokeLinecap="round"
                    opacity={isActive ? 0.98 : isDimmed ? 0.28 : 0.72}
                    filter={isActive ? "url(#post-reach-glow)" : undefined}
                    style={{
                      transition:
                        "x2 0.38s cubic-bezier(0.22,1,0.36,1), y2 0.38s cubic-bezier(0.22,1,0.36,1), opacity 0.28s ease, stroke-width 0.28s ease"
                    }}
                  />
                  <line
                    x1={x1}
                    y1={y1}
                    x2={ex2}
                    y2={ey2}
                    stroke={isActive ? "#ffffff" : "#f0fdf4"}
                    strokeWidth={isActive ? 2.8 : 2.2}
                    strokeLinecap="round"
                    opacity={isActive ? 1 : isDimmed ? 0.34 : 0.88}
                    filter={isActive ? "url(#post-reach-glow)" : undefined}
                    style={{
                      transition:
                        "x2 0.38s cubic-bezier(0.22,1,0.36,1), y2 0.38s cubic-bezier(0.22,1,0.36,1), opacity 0.28s ease, stroke-width 0.28s ease"
                    }}
                  />
                  <circle
                    cx={ex2}
                    cy={ey2}
                    r={isActive ? 3.1 : 2.4}
                    fill="#f0fdf4"
                    opacity={isActive ? 0.95 : isDimmed ? 0.22 : 0.6}
                    filter={isActive ? "url(#post-reach-glow)" : undefined}
                    style={{ transition: "cx 0.38s cubic-bezier(0.22,1,0.36,1), cy 0.38s cubic-bezier(0.22,1,0.36,1), opacity 0.28s ease, r 0.28s ease" }}
                  />
                </g>
              ) : null}
              {showEngagementMarkers && showViewsOverlay && performanceBadge && isActive ? (
                <foreignObject
                  x={badgeX}
                  y={badgeY}
                  width={badgeWidth}
                  height={badgeHeight}
                  style={{ overflow: "visible", pointerEvents: "none" }}
                  suppressHydrationWarning
                >
                  <div
                    className="flex h-full w-full items-center justify-center rounded-full px-1.5 text-[9px] font-bold leading-none shadow-[0_4px_12px_rgba(0,0,0,0.35)] backdrop-blur-sm"
                    style={{
                      background:
                        performanceBadge.tone === "reach"
                          ? "rgba(52,211,153,0.16)"
                          : "rgba(67,94,142,0.42)",
                      border:
                        performanceBadge.tone === "reach"
                          ? "1px solid rgba(52,211,153,0.38)"
                          : "1px solid rgba(240,253,244,0.5)",
                      color: performanceBadge.tone === "reach" ? "#9bf0c4" : "#f0fdf4",
                      boxShadow:
                        performanceBadge.tone === "reach"
                          ? "0 0 10px rgba(52,211,153,0.22)"
                          : "0 0 10px rgba(240,253,244,0.18), 0 0 12px rgba(67,94,142,0.34)",
                      animation: "analytics-badge-pop 0.34s cubic-bezier(0.22,1.35,0.36,1) both",
                      transformOrigin: "center"
                    }}
                  >
                    {performanceBadge.label}
                  </div>
                </foreignObject>
              ) : null}
            </g>
          );
        })}

        <circle cx={cx} cy={cy} r={centerRadius} fill="#050a08" stroke="rgba(52,211,153,0.16)" />
        <circle cx={cx} cy={cy} r={centerRadius - 1} fill="none" stroke="rgba(52,211,153,0.05)" strokeWidth={9} />
        {activeMetric ? (
          <foreignObject
            x={cx - 54}
            y={cy - 46}
            width={108}
            height={64}
            style={{ overflow: "visible", pointerEvents: "none" }}
            suppressHydrationWarning
          >
            <div
              className="relay-animate-fade-in flex h-full w-full items-center justify-center px-1 text-center text-[11px] font-semibold leading-[1.22] text-[#f0fdf4]"
              style={{
                textShadow: "0 0 10px rgba(52,211,153,0.18)"
              }}
            >
              <span className="line-clamp-2">{activeMetric.title}</span>
            </div>
          </foreignObject>
        ) : (
          <>
            <text x={cx} y={cy - 16} textAnchor="middle" dominantBaseline="middle" fontSize={31} fontWeight={700} fill="#f0fdf4">
              {metrics.length}
            </text>
            <text x={cx} y={cy + 5} textAnchor="middle" dominantBaseline="middle" fontSize={11} fill="rgba(240,253,244,0.52)" letterSpacing="0.12em">
              POSTS
            </text>
          </>
        )}
        <text x={cx} y={cy + 27} textAnchor="middle" dominantBaseline="middle" fontSize={19} fontWeight={700} fill="#34d399">
          {formatNumber(activeMetric?.impressions ?? totalReach)}
        </text>
        <text x={cx} y={cy + 46} textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="rgba(52,211,153,0.56)" letterSpacing="0.12em">
          REACH
        </text>
      </svg>
    </div>
  );
}

function PostReachDetailPanel({
  metrics,
  activeIndex,
  locked,
  onUnlock
}: {
  metrics: RadialPostMetric[];
  activeIndex: number | null;
  locked: boolean;
  onUnlock: () => void;
}) {
  const [topPanelStatsOpen, setTopPanelStatsOpen] = useState(false);
  const active = activeIndex == null ? null : metrics[activeIndex] ?? null;
  const top = [...metrics].sort((a, b) => b.impressions - a.impressions).slice(0, 3);
  const topPost = top[0] ?? null;
  const panelKey = active?.id ?? "overview";

  if (!active) {
    if (!topPost) {
      return (
        <div
          className="flex h-[320px] items-center justify-center rounded-xl p-4"
          style={{
            background: "rgba(5,10,8,0.7)",
            border: "1px solid rgba(52,211,153,0.1)"
          }}
        >
          <p className="max-w-[220px] text-center text-xs leading-relaxed text-[#777]">
            Waiting for post performance data. Hover a spoke when metrics arrive.
          </p>
        </div>
      );
    }

    const topPublished = topPost.publishedAt
      ? new Date(topPost.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "Date unknown";
    const topSignals = topPost.likes + topPost.comments;
    const topEngagementRate = topPost.seen > 0 ? (topSignals / topPost.seen) * 100 : null;
    const topPerformanceBadge = postPerformanceBadge(topPost, metrics);

    return (
      <div
        className="flex h-[320px] flex-col overflow-hidden rounded-xl p-3"
        style={{
          background: "rgba(5,10,8,0.7)",
          border: "1px solid rgba(52,211,153,0.1)"
        }}
        onMouseEnter={() => setTopPanelStatsOpen(true)}
        onMouseLeave={() => setTopPanelStatsOpen(false)}
      >
        <div key={panelKey} className="relative h-full relay-animate-fade-in">
          <div
            className="absolute inset-0 flex flex-col gap-3 transition-all duration-300"
            style={{
              opacity: topPanelStatsOpen ? 0 : 1,
              transform: topPanelStatsOpen ? "translateY(-6px) scale(0.98)" : "translateY(0) scale(1)",
              pointerEvents: topPanelStatsOpen ? "none" : "auto"
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <p
                className="text-xs font-medium uppercase"
                style={{ color: "rgba(240,253,244,0.4)", letterSpacing: "0.08em" }}
              >
                Top Performing Post
              </p>
              <span className="text-[10px] text-[rgba(240,253,244,0.34)]">Hover for stats</span>
            </div>
            <Link
              href={topPost.href}
              className="group relative flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-[#2a7a4a]/25 bg-[#07100c] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            >
              {topPost.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- analytics concept hero; source images may be external and unoptimized in preview data.
                <img
                  src={topPost.thumbnailUrl}
                  alt=""
                  aria-hidden="true"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  style={{ filter: "saturate(0.95) contrast(1.03)" }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[rgba(52,211,153,0.06)]">
                  <BarChart3 className="h-10 w-10 text-[#4a8c6e]" aria-hidden />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#020806] via-[#020806]/32 to-transparent" aria-hidden />
              {topPerformanceBadge ? (
                <span
                  className="absolute left-3 top-3 rounded-full border px-2 py-1 text-[10px] font-semibold backdrop-blur"
                  style={{
                    background:
                      topPerformanceBadge.tone === "reach"
                        ? "rgba(52,211,153,0.18)"
                        : topPerformanceBadge.tone === "conversation"
                          ? "rgba(147,197,253,0.18)"
                          : topPerformanceBadge.tone === "favorite"
                            ? "rgba(240,253,244,0.12)"
                            : "rgba(67,94,142,0.24)",
                    borderColor:
                      topPerformanceBadge.tone === "reach"
                        ? "rgba(52,211,153,0.38)"
                        : topPerformanceBadge.tone === "conversation"
                          ? "rgba(147,197,253,0.3)"
                          : "rgba(240,253,244,0.28)",
                    color:
                      topPerformanceBadge.tone === "reach"
                        ? "#9bf0c4"
                        : topPerformanceBadge.tone === "conversation"
                          ? "#bfdbfe"
                          : "#f0fdf4"
                  }}
                >
                  {topPerformanceBadge.label}
                </span>
              ) : null}
              <div className="absolute inset-x-0 bottom-0 p-4">
                <p className="line-clamp-2 text-base font-semibold leading-tight text-[#f0fdf4]">{topPost.title}</p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[rgba(240,253,244,0.5)]">
                  {topPublished} · {formatNumber(topPost.impressions)} reach
                </p>
              </div>
            </Link>
            <p className="h-4 text-[10px] leading-none text-[#666]">
              Hover a spoke for detail. Click to lock a post in place.
            </p>
          </div>

          <div
            className="absolute inset-0 flex flex-col gap-3 transition-all duration-300"
            style={{
              opacity: topPanelStatsOpen ? 1 : 0,
              transform: topPanelStatsOpen ? "translateY(0) scale(1)" : "translateY(6px) scale(0.98)",
              pointerEvents: topPanelStatsOpen ? "auto" : "none"
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <p
                className="text-xs font-medium uppercase"
                style={{ color: "rgba(240,253,244,0.4)", letterSpacing: "0.08em" }}
              >
                Top Performing Post
              </p>
              <span className="text-[10px] text-[rgba(240,253,244,0.34)]">Stats preview</span>
            </div>
            <div className="rounded-2xl border border-[#2a7a4a]/15 bg-[#0a1510]/70 p-3">
              <p className="line-clamp-1 text-sm font-semibold text-[#f0fdf4]">{topPost.title}</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[rgba(240,253,244,0.42)]">
                {topPublished} · {topPost.source === "live" ? "Insights CSV" : topPost.source === "derived" ? "Relay post data" : "Mock preview"}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-[#777]">Reach</p>
                  <p className="mt-0.5 font-mono text-lg font-bold text-[#34d399]">{formatNumber(topPost.impressions)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#777]">Views</p>
                  <p className="mt-0.5 font-mono text-lg font-bold text-[#f0fdf4]">{formatNumber(topPost.seen)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#777]">Signals</p>
                  <p className="mt-0.5 font-mono text-lg font-bold text-[#f0fdf4]">{formatNumber(topSignals)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#777]">Engage rate</p>
                  <p className="mt-0.5 font-mono text-lg font-bold text-[#bfdbfe]">{formatPercent(topEngagementRate)}</p>
                </div>
              </div>
            </div>
            <Link
              href={topPost.href}
              className="mt-auto flex h-8 items-center justify-center gap-2 rounded-xl border border-[#2a7a4a]/60 bg-[#0D3D2C] text-xs font-semibold text-[#9bf0c4] hover:bg-[#124a36]"
            >
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              Open post preview
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const conversionRate = active.impressions > 0 ? Math.round((active.conversions / active.impressions) * 1000) / 10 : 0;
  const published = active.publishedAt
    ? new Date(active.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "Date unknown";
  const performanceBadge = postPerformanceBadge(active, metrics);

  return (
    <div
      className="flex h-[320px] flex-col gap-4 overflow-hidden rounded-xl p-3"
      style={{
        background: "rgba(5,10,8,0.7)",
        border: "1px solid rgba(52,211,153,0.1)"
      }}
    >
      <div key={panelKey} className="flex h-full flex-col gap-2 relay-animate-fade-in">
        <div className="relative h-[112px] overflow-hidden rounded-2xl border border-[#2a7a4a]/25 bg-[#07100c] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          {active.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- analytics concept hero; source images may be external and unoptimized in preview data.
            <img
              src={active.thumbnailUrl}
              alt=""
              aria-hidden="true"
              className="h-full w-full object-cover"
              style={{ filter: "saturate(0.95) contrast(1.03)" }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[rgba(52,211,153,0.06)]">
              <BarChart3 className="h-8 w-8 text-[#4a8c6e]" aria-hidden />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#020806] via-[#020806]/35 to-transparent" aria-hidden />
          <div className="absolute inset-x-0 bottom-0 p-3">
            <p className="line-clamp-1 text-sm font-semibold leading-snug text-[#f0fdf4]">{active.title}</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[rgba(240,253,244,0.5)]">
              {published} · {active.source === "live" ? "Insights CSV" : active.source === "derived" ? "Relay post data" : "Mock preview"}
            </p>
          </div>
          {performanceBadge ? (
            <span
              className="absolute left-2 top-2 rounded-full border px-2 py-1 text-[10px] font-semibold backdrop-blur"
              style={{
                background:
                  performanceBadge.tone === "reach"
                    ? "rgba(52,211,153,0.18)"
                    : performanceBadge.tone === "conversation"
                      ? "rgba(147,197,253,0.18)"
                      : performanceBadge.tone === "favorite"
                        ? "rgba(240,253,244,0.12)"
                        : "rgba(67,94,142,0.24)",
                borderColor:
                  performanceBadge.tone === "reach"
                    ? "rgba(52,211,153,0.38)"
                    : performanceBadge.tone === "conversation"
                      ? "rgba(147,197,253,0.3)"
                      : "rgba(240,253,244,0.28)",
                color:
                  performanceBadge.tone === "reach"
                    ? "#9bf0c4"
                    : performanceBadge.tone === "conversation"
                      ? "#bfdbfe"
                      : "#f0fdf4"
              }}
              title={performanceBadge.detail}
            >
              {performanceBadge.label}
            </span>
          ) : null}
          {locked ? (
            <button
              type="button"
              onClick={onUnlock}
              className="absolute right-2 top-2 rounded-xl border border-[#2a7a4a]/40 bg-[#020806]/80 px-2 py-1 text-[10px] font-semibold text-[#9bf0c4] backdrop-blur"
            >
              Unlock
            </button>
          ) : null}
        </div>

        <div className="grid h-[78px] grid-cols-2 gap-2 rounded-xl border border-[#2a7a4a]/15 bg-[#0a1510]/70 p-2">
          <div>
            <p className="flex items-center gap-1 text-[10px] text-[#777]"><Eye className="h-3 w-3" /> Impressions</p>
            <p className="mt-0.5 font-mono text-base font-bold text-[#34d399]">{formatNumber(active.impressions)}</p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-[10px] text-[#777]"><Eye className="h-3 w-3" /> Views</p>
            <p className="mt-0.5 font-mono text-base font-bold text-[#F0F0F0]">{formatNumber(active.seen)}</p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-[10px] text-[#777]"><Star className="h-3 w-3" /> Likes</p>
            <p className="mt-0.5 font-mono text-base font-bold text-[#F0F0F0]">{formatNumber(active.likes)}</p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-[10px] text-[#777]"><MessageCircle className="h-3 w-3" /> Comments</p>
            <p className="mt-0.5 font-mono text-base font-bold text-[#F0F0F0]">{formatNumber(active.comments)}</p>
          </div>
        </div>

        <div className="h-[42px] rounded-xl border border-[#6a5a2a]/50 bg-[#1a1808] p-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#d4af37]">
            Action signal
          </p>
          <p className="mt-0.5 line-clamp-1 text-[11px] leading-snug text-[#C8BFA6]">
            {active.impressions > 2500 && conversionRate < 1
              ? "High reach with low conversion. Better as awareness than paid promo."
              : "Reach and engagement move together. Strong promo candidate."}
          </p>
        </div>

        <div className="mt-auto">
          <Link
            href={active.href}
            className="flex h-8 items-center justify-center gap-2 rounded-xl border border-[#2a7a4a]/60 bg-[#0D3D2C] text-xs font-semibold text-[#9bf0c4] hover:bg-[#124a36]"
          >
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            Open post preview
          </Link>
        </div>
      </div>
    </div>
  );
}

function PostPerformanceTable({
  metrics,
  activeIndex,
  lockedIndex,
  onHover,
  onLock
}: {
  metrics: RadialPostMetric[];
  activeIndex: number | null;
  lockedIndex: number | null;
  onHover: (index: number | null) => void;
  onLock: (index: number | null) => void;
}) {
  return (
    <div
      className="flex h-[428px] w-[428px] shrink-0 flex-col overflow-hidden rounded-3xl border p-3 relay-animate-fade-in"
      style={{
        background: "rgba(5,10,8,0.62)",
        borderColor: "rgba(52,211,153,0.1)"
      }}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[rgba(240,253,244,0.42)]">
          Ranked posts
        </p>
        <p className="text-[10px] text-[rgba(240,253,244,0.28)]">Hover rows for detail</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="grid gap-1.5">
          {metrics.map((metric, index) => {
            const isActive = activeIndex === index;
            const badge = postPerformanceBadge(metric, metrics);
            const published = metric.publishedAt
              ? new Date(metric.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
              : "Date unknown";
            const signals = metric.likes + metric.comments;
            const engagementRate = metric.seen > 0 ? (signals / metric.seen) * 100 : null;

            return (
              <button
                key={metric.id}
                type="button"
                aria-pressed={lockedIndex === index}
                onMouseEnter={() => onHover(index)}
                onMouseLeave={() => onHover(null)}
                onClick={() => onLock(lockedIndex === index ? null : index)}
                className="group grid grid-cols-[minmax(0,1fr)_52px_52px_42px] items-center gap-2 rounded-2xl border px-3 py-2 text-left transition-all duration-150"
                style={{
                  background: isActive ? "rgba(13,61,44,0.48)" : "rgba(255,255,255,0.025)",
                  borderColor: isActive ? "rgba(52,211,153,0.34)" : "rgba(255,255,255,0.055)",
                  boxShadow: isActive ? "0 0 18px rgba(52,211,153,0.1)" : "none"
                }}
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="font-mono text-[10px] text-[rgba(52,211,153,0.62)]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <p className="truncate text-xs font-semibold text-[#f0fdf4]">{metric.title}</p>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[10px] text-[rgba(240,253,244,0.34)]">{published}</span>
                    {badge ? (
                      <span
                        className="rounded-full border px-1.5 py-0.5 text-[9px] font-semibold"
                        style={{
                          background: badge.tone === "reach" ? "rgba(52,211,153,0.14)" : "rgba(67,94,142,0.2)",
                          borderColor: badge.tone === "reach" ? "rgba(52,211,153,0.28)" : "rgba(240,253,244,0.16)",
                          color: badge.tone === "reach" ? "#9bf0c4" : "rgba(240,253,244,0.78)"
                        }}
                      >
                        {badge.label}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-[rgba(240,253,244,0.3)]">Reach</p>
                  <p className="font-mono text-xs font-bold text-[#34d399]">{formatNumber(metric.impressions)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-[rgba(240,253,244,0.3)]">Views</p>
                  <p className="font-mono text-xs font-bold text-[#f0fdf4]">{formatNumber(metric.seen)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-[rgba(240,253,244,0.3)]">Eng.</p>
                  <p className="font-mono text-xs font-bold text-[#bfdbfe]">{formatPercent(engagementRate)}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function OptionsMenu({ label, items }: { label: string; items: string[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        className="rounded-xl p-1.5 text-[#777] hover:bg-[#1a1a1a] hover:text-[#E8E8E8]"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 min-w-40 rounded-2xl border border-[#2a2a2a] bg-[#101010] p-1 shadow-xl shadow-black/40"
        >
          {items.map((item) => (
            <button
              key={item}
              type="button"
              role="menuitem"
              className="block w-full rounded-xl px-3 py-2 text-left text-xs text-[#B8B8B8] hover:bg-[#1a1a1a] hover:text-[#F0F0F0]"
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function InsightFamilyTabs({
  activeFamily,
  onChange,
  className
}: {
  activeFamily: InsightFamily;
  onChange: (family: InsightFamily) => void;
  className?: string;
}) {
  return (
    <div className={classNames("flex min-w-0 items-center", className)}>
      <div
        role="tablist"
        aria-label="Analytics insight families"
        className="flex min-w-0 gap-1 overflow-x-auto"
      >
        {INSIGHT_FAMILIES.map((family) => {
          const selected = family.id === activeFamily;
          return (
            <button
              key={family.id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`analytics-family-${family.id}`}
              id={`analytics-family-tab-${family.id}`}
              title={family.description}
              onClick={() => onChange(family.id)}
              className={classNames(
                "min-w-[116px] rounded-2xl border px-3 py-2 text-left transition-colors",
                selected
                  ? "border-[#245c45] bg-[#0a1510] text-[#9bf0c4] shadow-[inset_0_0_0_1px_rgba(42,122,74,0.45)]"
                  : "border-transparent text-[#777] hover:border-[#1a2a22] hover:bg-[#101010] hover:text-[#E8E8E8]"
              )}
            >
              <span className="block text-xs font-semibold">{family.label}</span>
              <span className="mt-0.5 block text-[9px] uppercase tracking-wide opacity-60">{family.eyebrow}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PerformancePanel({
  performance,
  unifiedPerformance,
  performanceRange,
  onPerformanceRangeChange,
  activeFamily,
  onFamilyChange
}: {
  performance: CreatorPostPerformanceData | null;
  unifiedPerformance: CreatorUnifiedPerformanceData | null;
  performanceRange: TimeScale;
  onPerformanceRangeChange: (range: TimeScale) => void;
  activeFamily: InsightFamily;
  onFamilyChange: (family: InsightFamily) => void;
}) {
  const scale = performanceRange;
  const setScale = onPerformanceRangeChange;
  const [metricMode, setMetricMode] = useState<PostMetricMode>("engagement");
  const [insightsOpen, setInsightsOpen] = useState(true);
  const [exposureOpen, setExposureOpen] = useState(true);
  const [incomeOpen, setIncomeOpen] = useState(true);
  const [showReachSpokes, setShowReachSpokes] = useState(true);
  const [showViewsOverlay, setShowViewsOverlay] = useState(true);
  const [showEngagementMarkers, setShowEngagementMarkers] = useState(true);
  const [viewMode, setViewMode] = useState<PerformanceViewMode>("graph");
  const [hoveredPostIndex, setHoveredPostIndex] = useState<number | null>(null);
  const [lockedPostIndex, setLockedPostIndex] = useState<number | null>(null);

  const days = SCALE_DAYS[scale];
  const radialMetrics = useMemo(
    () => buildRadialPostMetrics(performance, unifiedPerformance, days),
    [performance, unifiedPerformance, days]
  );
  const activePostIndex = lockedPostIndex ?? hoveredPostIndex;
  const performanceStale = isUnifiedPerformanceStale(unifiedPerformance);

  useEffect(() => {
    setHoveredPostIndex(null);
    setLockedPostIndex(null);
  }, [scale]);

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-[#1F1F1F] bg-[#020806] shadow-[0_18px_60px_-46px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.025)]"
      aria-labelledby="analytics-performance-heading"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_45%,rgba(45,106,79,0.12),transparent_50%)]" aria-hidden />
      <div className="relative z-10 flex flex-col gap-6 p-6">
        <div className="flex min-w-0 flex-wrap items-center gap-4">
          <InsightFamilyTabs activeFamily={activeFamily} onChange={onFamilyChange} />
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2
              id="analytics-performance-heading"
              className="text-base font-semibold leading-tight"
              style={{ color: "#f0fdf4", letterSpacing: "-0.2px" }}
            >
              Post Engagement
            </h2>
            <p
              className="mt-0.5 text-xs"
              style={{ color: "rgba(240,253,244,0.4)", letterSpacing: "0.01em" }}
            >
              Each spoke is a post ranked by reach · {unifiedDataSourceLabel(unifiedPerformance)} · last {days} days
            </p>
          </div>
        </div>

        {performanceStale ? (
          <p
            className="rounded-2xl border border-[#6a5a2a]/70 bg-[#1a1808] px-3 py-2 text-[11px] leading-relaxed text-[#e8d9a8]"
            data-testid="analytics-unified-stale-warning"
          >
            Post performance may be outdated. Refresh linked post stats or wait for the daily rollup job when live
            snapshots are available.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-6 lg:flex-nowrap">
          <div className="relative flex shrink-0 items-center justify-center">
            {viewMode === "graph" ? (
              <div className="absolute left-1 top-1 z-20 w-[190px]">
              <button
                type="button"
                onClick={() => {
                  if (!insightsOpen) {
                    setInsightsOpen(true);
                    setExposureOpen(true);
                    setIncomeOpen(true);
                    return;
                  }
                  if (!exposureOpen || !incomeOpen) {
                    setExposureOpen(true);
                    setIncomeOpen(true);
                    return;
                  }
                  setInsightsOpen(false);
                }}
                className="inline-flex items-center gap-2 bg-transparent p-0 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9bf0c4] opacity-90 transition-opacity hover:opacity-100"
                aria-expanded={insightsOpen}
              >
                Insights
                <ChevronDown
                  className={classNames("h-3 w-3 transition-transform", insightsOpen && "rotate-180")}
                  aria-hidden
                />
              </button>
              {insightsOpen ? (
                <div className="mt-3 grid grid-cols-2 gap-0 relay-animate-fade-in">
                  <section className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const next = !(showReachSpokes || showViewsOverlay || showEngagementMarkers);
                        setShowReachSpokes(next);
                        setShowViewsOverlay(next);
                        setShowEngagementMarkers(next);
                      }}
                      onDoubleClick={() => setExposureOpen((value) => !value)}
                      className="inline-flex items-center gap-1.5 bg-transparent p-0 text-[9px] font-semibold uppercase tracking-[0.18em] text-[rgba(240,253,244,0.48)] transition-colors hover:text-[rgba(240,253,244,0.68)]"
                      title="Click to toggle Exposure layers."
                    >
                      Exposure
                    </button>
                    {exposureOpen ? (
                      <div className="flex flex-col items-start gap-1">
                        {[
                          { label: "Reach", active: showReachSpokes, color: "#34d399", onClick: () => setShowReachSpokes((value) => !value) },
                          {
                            label: "Views",
                            active: showViewsOverlay,
                            color: "#004348",
                            chipColor: "#2dd4bf",
                            onClick: () => setShowViewsOverlay((value) => !value)
                          },
                          { label: "Engage", active: showEngagementMarkers, color: "#d1fae5", onClick: () => setShowEngagementMarkers((value) => !value) }
                        ].map((chip) => {
                          const displayColor = chip.chipColor ?? chip.color;
                          return (
                          <button
                            key={chip.label}
                            type="button"
                            aria-pressed={chip.active}
                            onClick={chip.onClick}
                            className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8px] font-semibold shadow-[0_6px_18px_rgba(0,0,0,0.18)] backdrop-blur-sm transition-all duration-150"
                            style={{
                              background: chip.active ? "rgba(0,0,0,0.38)" : "rgba(0,0,0,0.16)",
                              border: chip.active ? `1px solid ${displayColor}66` : "1px solid rgba(255,255,255,0.045)",
                              color: chip.active ? displayColor : "rgba(240,253,244,0.38)"
                            }}
                          >
                            <span
                              className="inline-block h-1.5 w-1.5 rounded-full"
                              style={{
                                background: displayColor,
                                opacity: chip.active ? 1 : 0.36,
                                boxShadow: chip.active ? `0 0 6px ${displayColor}88` : undefined
                              }}
                            />
                            {chip.label}
                          </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </section>

                  <section className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setMetricMode(metricMode === "conversions" ? "engagement" : "conversions");
                      }}
                      onDoubleClick={() => setIncomeOpen((value) => !value)}
                      className="inline-flex items-center gap-1.5 bg-transparent p-0 text-[9px] font-semibold uppercase tracking-[0.18em] text-[rgba(240,253,244,0.48)] transition-colors hover:text-[rgba(240,253,244,0.68)]"
                      title="Click to toggle Income mode."
                    >
                      Income
                    </button>
                    {incomeOpen ? (
                      <div className="flex flex-col items-start gap-1">
                        {(["conversions", "tips"] as PostMetricMode[]).map((mode) => {
                          const meta = metricChipMeta(mode);
                          const active = metricMode === mode;
                          return (
                            <button
                              key={mode}
                              type="button"
                              disabled={meta.disabled}
                              aria-pressed={active}
                              onClick={() => {
                                if (!meta.disabled) setMetricMode(active ? "engagement" : mode);
                              }}
                              className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8px] font-semibold shadow-[0_6px_18px_rgba(0,0,0,0.18)] backdrop-blur-sm transition-all duration-150"
                              style={{
                                background: meta.disabled
                                  ? "rgba(0,0,0,0.10)"
                                  : active
                                    ? "rgba(0,0,0,0.38)"
                                    : "rgba(0,0,0,0.16)",
                                border: meta.disabled
                                  ? "1px solid rgba(255,255,255,0.035)"
                                  : active
                                    ? `1px solid ${meta.dot}44`
                                    : "1px solid rgba(255,255,255,0.045)",
                                color: meta.disabled
                                  ? "rgba(240,253,244,0.25)"
                                  : active
                                    ? meta.dot
                                    : "rgba(240,253,244,0.38)",
                                cursor: meta.disabled ? "not-allowed" : "pointer"
                              }}
                            >
                              <span
                                className="inline-block h-1.5 w-1.5 rounded-full"
                                style={{ background: meta.dot, opacity: meta.disabled ? 0.3 : active ? 1 : 0.45 }}
                              />
                              {meta.label === "Conversions" ? "Conv." : meta.label}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </section>
                </div>
              ) : null}
            </div>
            ) : null}
            {viewMode === "graph" ? (
              <PostReachRadialChart
                metrics={radialMetrics}
                activeIndex={activePostIndex}
                lockedIndex={lockedPostIndex}
                showReachSpokes={showReachSpokes}
                showViewsOverlay={showViewsOverlay}
                showEngagementMarkers={showEngagementMarkers}
                onHover={setHoveredPostIndex}
                onLock={setLockedPostIndex}
              />
            ) : (
              <PostPerformanceTable
                metrics={radialMetrics}
                activeIndex={activePostIndex}
                lockedIndex={lockedPostIndex}
                onHover={setHoveredPostIndex}
                onLock={setLockedPostIndex}
              />
            )}
          </div>

          <div className="min-w-[240px] flex-1">
            <PostReachDetailPanel
              metrics={radialMetrics}
              activeIndex={activePostIndex}
              locked={lockedPostIndex != null}
              onUnlock={() => setLockedPostIndex(null)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-1 flex items-center rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.035)] p-0.5">
              {(["graph", "table"] as PerformanceViewMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={viewMode === mode}
                  onClick={() => {
                    setViewMode(mode);
                    setHoveredPostIndex(null);
                    setLockedPostIndex(null);
                  }}
                  className="rounded-md px-2.5 py-0.5 text-xs font-medium capitalize transition-all duration-150"
                  style={{
                    background: viewMode === mode ? "rgba(52,211,153,0.15)" : "transparent",
                    color: viewMode === mode ? "#34d399" : "rgba(240,253,244,0.42)"
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
            {(["7d", "30d", "90d"] as TimeScale[]).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={scale === item}
                onClick={() => setScale(item)}
                className="rounded-lg px-3 py-1 text-xs font-medium transition-all duration-150"
                style={{
                  background: scale === item ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.04)",
                  border: scale === item ? "1px solid rgba(52,211,153,0.35)" : "1px solid rgba(255,255,255,0.08)",
                  color: scale === item ? "#34d399" : "rgba(240,253,244,0.45)"
                }}
              >
                {timeScaleLabel(item)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="6.5" stroke="rgba(240,253,244,0.25)" strokeWidth="1.3" />
              <path d="M8 7V11M8 5.5V5" stroke="rgba(240,253,244,0.25)" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <span className="text-xs" style={{ color: "rgba(240,253,244,0.3)", letterSpacing: "0.02em" }}>
              Metrics are estimates
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function GrowthPanel({
  summary,
  summary7d,
  stickiness
}: {
  summary: CreatorMembershipSummaryData | null;
  summary7d: CreatorMembershipSummaryData | null;
  stickiness: CreatorTierStickinessData | null;
}) {
  const [retentionOpen, setRetentionOpen] = useState(false);
  const tierFloor = bestTierFloorCents(summary);
  const estimatedNewRevenue = tierFloor == null ? null : tierFloor * (summary7d?.adds_in_window ?? 0);
  const retention = retentionScore(summary7d);
  const tierLoss = strongestTierLoss(stickiness);

  return (
    <section className="rounded-2xl border border-[#1F1F1F] bg-[#101010] p-4" aria-labelledby="analytics-growth-heading">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="analytics-growth-heading" className="text-xs font-semibold uppercase tracking-[0.18em] text-[#888]">
          Growth
        </h2>
        <OptionsMenu label="Growth options" items={["Revenue breakdown", "Tier economics"]} />
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <div className="rounded-2xl border border-[#2a7a4a]/45 bg-[#0A0A0A] p-3 text-center">
          <span className="font-mono text-3xl font-bold tracking-tight text-[#F5F5F5]">
            {formatMoneyCents(estimatedNewRevenue)}
          </span>
          <p className="mt-1 text-xs font-medium text-[#888]">Est. new revenue · 7d</p>
          <Link
            href="/studio/actions"
            className="mt-2 inline-flex h-7 w-full items-center justify-center rounded-full border border-[#2a7a4a]/70 text-[10px] font-semibold text-[#9bf0c4] hover:bg-[#0a1510]"
          >
            Open offer tools
          </Link>
        </div>

        <div className="rounded-2xl border border-[#2a7a4a]/45 bg-[#0A0A0A] p-3 text-center">
          <div className="flex items-baseline justify-center gap-1">
            <span className="font-mono text-3xl font-bold tracking-tight text-[#F5F5F5]">
              {retention ?? "--"}
            </span>
            <span className="text-[10px] font-medium text-[#777]">/100</span>
          </div>
          <p className="mt-1 text-xs font-medium text-[#888]">Retention pulse</p>
          <button
            type="button"
            onClick={() => setRetentionOpen((value) => !value)}
            className="mt-2 inline-flex h-7 w-full items-center justify-center rounded-full border border-[#2a2a2a] text-[#888] hover:text-[#E8E8E8]"
          >
            <ChevronDown className={classNames("h-3.5 w-3.5 transition-transform", retentionOpen && "rotate-180")} />
          </button>
        </div>
      </div>

      {retentionOpen ? (
        <div className="mt-2 rounded-xl border border-[#2a2a2a] bg-[#0A0A0A] p-2">
          {tierLoss ? (
            <div className="flex items-center justify-between gap-3 px-2 py-1.5">
              <span className="text-[11px] font-semibold text-[#E8E8E8]">{tierLoss.title}</span>
              <span className="font-mono text-[11px] font-bold text-[#e8b4a8]">
                -{tierLoss.cancel_events_in_window} cancels
              </span>
            </div>
          ) : (
            <p className="px-2 py-1.5 text-[11px] text-[#888]">No tier churn warning in this window.</p>
          )}
          <p className="px-2 pb-1 text-[10px] leading-relaxed text-[#666]">
            Tier guidance stays advisory: review price, cadence, and reward timing in Patreon.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function AudiencePanel({
  performance,
  unifiedPerformance,
  performanceRange,
  usagePreview
}: {
  performance: CreatorPostPerformanceData | null;
  unifiedPerformance: CreatorUnifiedPerformanceData | null;
  performanceRange: TimeScale;
  usagePreview: CreatorUsagePreviewData | null;
}) {
  const top = topInterestRow(performance);
  const unifiedReach =
    (unifiedPerformance?.totals.seen ?? 0) +
    (unifiedPerformance?.totals.impressions ?? 0) +
    (unifiedPerformance?.totals.views ?? 0);
  const galleryViews =
    unifiedReach > 0
      ? unifiedReach
      : top?.insights?.seen ?? top?.insights?.impressions ?? null;
  const reachSource =
    unifiedReach > 0 ? unifiedDataSourceLabel(unifiedPerformance) : galleryViews != null ? "CSV" : null;
  const rateLimitHits =
    usagePreview?.bars.find((bar) => bar.metric === "api.rate_limited")?.quantity ?? "0";

  return (
    <section className="rounded-2xl border border-[#1F1F1F] bg-[#101010] p-4" aria-labelledby="analytics-audience-heading">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="analytics-audience-heading" className="text-xs font-semibold uppercase tracking-[0.18em] text-[#888]">
          Audience
        </h2>
        <OptionsMenu label="Audience options" items={["Cohort table", "Stickiness by tier"]} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <div className="rounded-2xl border border-[#2a7a4a]/45 bg-[#0A0A0A] p-3 text-center">
          <div className="mb-1.5 flex items-center justify-center gap-1.5">
            <Eye className="h-3.5 w-3.5 text-[#888]" aria-hidden />
            <span className="text-[10px] font-medium uppercase tracking-wide text-[#888]">Reach</span>
          </div>
          <div className="flex items-center justify-center gap-1.5">
            <span className="font-mono text-2xl font-bold tracking-tight text-[#F5F5F5]">
              {formatNumber(galleryViews)}
            </span>
            {reachSource ? (
              <span className="inline-flex items-center text-[10px] font-bold text-[#9bf0c4]">
                <ArrowUpRight className="h-3 w-3" aria-hidden />
                {reachSource}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[10px] text-[#666]">Cross-platform reach in selected window</p>
        </div>

        <div className="rounded-2xl border border-[#2a7a4a]/45 bg-[#0A0A0A] p-3 text-center">
          <div className="mb-1.5 flex items-center justify-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-[#888]" aria-hidden />
            <span className="text-[10px] font-medium uppercase tracking-wide text-[#888]">Friction</span>
          </div>
          <span className="font-mono text-2xl font-bold tracking-tight text-[#F5F5F5]">{rateLimitHits}</span>
          <p className="mt-1 text-[10px] text-[#666]">rate-limit hits · 30d</p>
        </div>
      </div>

      {unifiedPerformance?.by_destination?.length ? (
        <div className="mt-3 space-y-2" data-testid="analytics-platform-breakdown">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#777]">
            By platform · {timeScaleLabel(performanceRange)}
          </p>
          <div className="grid gap-2">
            {unifiedPerformance.by_destination.map((entry) => (
              <div
                key={entry.destination}
                className="rounded-xl border border-[#2a2a2a] bg-[#0A0A0A] px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#E8E8E8]">
                    {formatDestinationLabel(entry.destination)}
                  </span>
                  <span className="font-mono text-[11px] text-[#9bf0c4]">
                    {formatNumber(entry.impressions + entry.seen + entry.views)} reach
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-[#888]">
                  <span>{formatNumber(entry.likes)} likes</span>
                  <span>{formatNumber(entry.comments)} comments</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}


function ActionPromptStrip({ cards }: { cards: CreatorActionCard[] }) {
  const visible = cards;
  return (
    <section className="rounded-2xl border border-[#1F1F1F] bg-[#101010] p-4" aria-labelledby="analytics-actions-heading">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="analytics-actions-heading" className="text-xs font-semibold uppercase tracking-[0.18em] text-[#888]">
            Recommended actions
          </h2>
          <p className="mt-1 text-xs text-[#777]">
            Clear signal, direct Relay move. Nuanced Patreon strategy remains guidance.
          </p>
        </div>
        <Link href="/studio/actions" className="text-xs font-medium text-[#9bf0c4] hover:underline">
          Open Action Center
        </Link>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5" data-testid="analytics-action-cards">
        {visible.map((card) => (
          <article
            key={card.id}
            className={classNames(
              "flex min-h-[160px] flex-col rounded-2xl border p-3",
              card.tone === "active"
                ? "border-[#2a7a4a]/70 bg-[#0a1510]"
                : card.tone === "guidance"
                  ? "border-[#6a5a2a]/70 bg-[#1a1808]"
                  : "border-[#2a2a2a] bg-[#0A0A0A]"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-[#E8E8E8]">{card.title}</h3>
              <div className="flex flex-col items-end gap-1">
                <span className="rounded-full border border-[#333] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[#999]">
                  {card.tone === "active" ? "Now" : card.tone === "guidance" ? "Guide" : "Watch"}
                </span>
                {card.confidence ? (
                  <span className="text-[9px] uppercase tracking-wide text-[#777]">{card.confidence}</span>
                ) : null}
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[#888]">{card.trigger}</p>
            <p className="mt-2 flex-1 text-[11px] leading-relaxed text-[#B8B8B8]">{card.body}</p>
            {card.href && card.actionLabel ? (
              <Link
                href={card.href}
                className="mt-3 inline-flex min-h-8 items-center justify-center rounded-full border border-[#2a7a4a]/60 bg-[#0D3D2C] px-2 text-center text-[11px] font-semibold text-[#9bf0c4] hover:bg-[#124a36]"
              >
                {card.actionLabel}
              </Link>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function MoreDetailCarousel({
  summary,
  performance,
  unifiedPerformance
}: {
  summary: CreatorMembershipSummaryData | null;
  performance: CreatorPostPerformanceData | null;
  unifiedPerformance: CreatorUnifiedPerformanceData | null;
}) {
  const [slide, setSlide] = useState(0);
  const top = topInterestRow(performance);
  const unifiedTop = unifiedPerformance?.top_posts?.[0] ?? null;
  const topTitle =
    unifiedTop?.title?.trim() ||
    top?.relay?.title ||
    top?.patreon_post_id ||
    "Upload Insights CSV or refresh linked stats";
  const topSeen = unifiedTop
    ? unifiedTop.destinations.reduce((sum, entry) => sum + entry.seen, 0)
    : top?.insights?.seen;
  const topLikes = unifiedTop
    ? unifiedTop.destinations.reduce((sum, entry) => sum + entry.likes, 0)
    : top?.insights?.likes;
  const topComments = unifiedTop
    ? unifiedTop.destinations.reduce((sum, entry) => sum + entry.comments, 0)
    : top?.insights?.comments;
  const slides = [
    {
      id: "movement",
      node: (
        <div className="rounded-2xl border border-[#2a2a2a] bg-[#0A0A0A] p-3">
          <h3 className="mb-2 text-xs font-semibold text-[#E8E8E8]">Member movement</h3>
          <div className="grid grid-cols-2 gap-1.5">
            <DetailChip
              icon={<UserPlus className="h-3.5 w-3.5" />}
              label="Joins"
              value={summary?.events_in_window.join ?? 0}
              tone="good"
            />
            <DetailChip
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              label="Upgrades"
              value={summary?.events_in_window.upgrade ?? 0}
              tone="good"
            />
            <DetailChip
              icon={<TrendingDown className="h-3.5 w-3.5" />}
              label="Downgrades"
              value={summary?.events_in_window.downgrade ?? 0}
              tone="neutral"
            />
            <DetailChip
              icon={<LogOut className="h-3.5 w-3.5" />}
              label="Cancels"
              value={summary?.events_in_window.cancel ?? 0}
              tone="risk"
            />
          </div>
        </div>
      )
    },
    {
      id: "tier-mix",
      node: (
        <div className="rounded-2xl border border-[#2a2a2a] bg-[#0A0A0A] p-3">
          <h3 className="mb-2 text-xs font-semibold text-[#E8E8E8]">Tier mix</h3>
          <div className="space-y-2">
            {(summary?.tier_breakdown ?? []).slice(0, 4).map((tier) => (
              <TierMixBar
                key={tier.tier_id}
                label={tier.title}
                count={tier.patron_count}
                total={summary?.total_patrons ?? 0}
              />
            ))}
            {!summary?.tier_breakdown?.length ? <p className="text-xs text-[#888]">Waiting for tier sync.</p> : null}
          </div>
        </div>
      )
    },
    {
      id: "reach",
      node: (
        <div className="rounded-2xl border border-[#2a2a2a] bg-[#0A0A0A] p-3">
          <h3 className="mb-2 text-xs font-semibold text-[#E8E8E8]">Top post reach</h3>
          <p className="truncate text-xs font-medium text-[#E8E8E8]">{topTitle}</p>
          <div className="mt-2 flex items-center gap-3 text-[#888]">
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              <span className="font-mono text-xs font-bold text-[#E8E8E8]">{formatNumber(topSeen)}</span>
            </span>
            <span className="flex items-center gap-1">
              <Heart className="h-3 w-3" />
              <span className="font-mono text-xs font-bold text-[#E8E8E8]">{formatNumber(topLikes)}</span>
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle className="h-3 w-3" />
              <span className="font-mono text-xs font-bold text-[#E8E8E8]">{formatNumber(topComments)}</span>
            </span>
          </div>
        </div>
      )
    }
  ];

  return (
    <section className="rounded-2xl border border-[#1F1F1F] bg-[#101010] p-4" aria-labelledby="analytics-more-detail-heading">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="analytics-more-detail-heading" className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#888]">
          More detail
        </h2>
        <div className="flex items-center gap-1">
          {slides.map((item, index) => (
            <button
              key={item.id}
              type="button"
              aria-label={`Show detail slide ${index + 1}`}
              onClick={() => setSlide(index)}
              className={classNames(
                "h-1.5 rounded-full transition-all",
                slide === index ? "w-5 bg-[#9bf0c4]" : "w-1.5 bg-[#444]"
              )}
            />
          ))}
        </div>
      </div>

      <div className="relative overflow-hidden" role="region" aria-roledescription="carousel">
        <div
          className="flex transition-transform duration-300 ease-out lg:translate-x-0"
          style={{ transform: `translateX(-${slide * 100}%)` }}
        >
          {slides.map((item) => (
            <div key={item.id} className="min-w-full shrink-0 pr-0 lg:min-w-0 lg:basis-1/3 lg:pr-3">
              {item.node}
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-end gap-2 lg:hidden">
          <button
            type="button"
            disabled={slide === 0}
            onClick={() => setSlide((value) => Math.max(0, value - 1))}
            className="rounded-full border border-[#2a2a2a] px-3 py-1 text-xs text-[#888] disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={slide === slides.length - 1}
            onClick={() => setSlide((value) => Math.min(slides.length - 1, value + 1))}
            className="rounded-full border border-[#2a2a2a] px-3 py-1 text-xs text-[#888] disabled:opacity-40"
          >
            Next
          </button>
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-8 bg-gradient-to-r from-[#101010] to-transparent lg:block" />
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-8 bg-gradient-to-l from-[#101010] to-transparent lg:block" />
      </div>
    </section>
  );
}
function DetailChip({
  icon,
  label,
  value,
  tone
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "good" | "neutral" | "risk";
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-xl bg-[#101010] px-2 py-1.5">
      <span className={tone === "good" ? "text-[#9bf0c4]" : tone === "risk" ? "text-[#e8b4a8]" : "text-[#888]"}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] uppercase tracking-wide text-[#777]">{label}</p>
        <p className="font-mono text-base font-bold tracking-tight text-[#F0F0F0]">{value}</p>
      </div>
    </div>
  );
}

function TierMixBar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="truncate text-[10px] text-[#888]">{label}</span>
        <span className="font-mono text-xs font-bold text-[#E8E8E8]">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#1a1a1a]">
        <div className="h-full rounded-full bg-[#4a8c6e]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function AnalyticsInsightsHub({
  performance,
  unifiedPerformance,
  performanceRange,
  onPerformanceRangeChange,
  summary,
  summary7d,
  stickiness,
  usagePreview,
  actionCards,
  performanceOverview,
  performanceCampaigns,
  performanceTags,
  performanceWorks,
  bundleSuggestions,
  hierarchyDestination,
  onHierarchyDestinationChange,
  performanceGoals,
  goalsBusySuggestionId,
  onAdoptPerformanceGoalSuggestion,
  onRemovePerformanceGoal
}: AnalyticsInsightsHubProps) {
  const [activeFamily, setActiveFamily] = useState<InsightFamily>("goals");

  return (
    <div
      className="mx-auto w-full max-w-[980px]"
      data-testid="analytics-insights-hub"
    >
      <div
        role="tabpanel"
        id={`analytics-family-${activeFamily}`}
        aria-labelledby={`analytics-family-tab-${activeFamily}`}
        data-testid="analytics-insight-family"
      >
        {activeFamily === "goals" ? (
          <PerformancePanel
            performance={performance}
            unifiedPerformance={unifiedPerformance}
            performanceRange={performanceRange}
            onPerformanceRangeChange={onPerformanceRangeChange}
            activeFamily={activeFamily}
            onFamilyChange={setActiveFamily}
          />
        ) : null}

        {activeFamily === "trends" ? (
          <div className="rounded-3xl border border-[#1F1F1F] bg-[#080a09] p-4 sm:p-6">
            <div className="mb-5 flex min-w-0 flex-wrap items-center gap-4">
              <h2 className="text-xs font-semibold uppercase tracking-[0.35em] text-[#888]">Performance</h2>
              <InsightFamilyTabs activeFamily={activeFamily} onChange={setActiveFamily} />
            </div>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <div className="grid gap-3">
                <PerformanceHierarchyPanel
                  performanceRange={performanceRange}
                  overview={performanceOverview}
                  campaigns={performanceCampaigns}
                  tags={performanceTags}
                  works={performanceWorks}
                  bundleSuggestions={bundleSuggestions}
                  hierarchyDestination={hierarchyDestination}
                  onHierarchyDestinationChange={onHierarchyDestinationChange}
                />
                <GrowthPanel summary={summary} summary7d={summary7d} stickiness={stickiness} />
                <AudiencePanel
                  performance={performance}
                  unifiedPerformance={unifiedPerformance}
                  performanceRange={performanceRange}
                  usagePreview={usagePreview}
                />
              </div>
              <MoreDetailCarousel
                summary={summary}
                performance={performance}
                unifiedPerformance={unifiedPerformance}
              />
            </div>
          </div>
        ) : null}

        {activeFamily === "actions" ? (
          <div className="rounded-3xl border border-[#1F1F1F] bg-[#080a09] p-4 sm:p-6">
            <div className="mb-5 flex min-w-0 flex-wrap items-center gap-4">
              <h2 className="text-xs font-semibold uppercase tracking-[0.35em] text-[#888]">Performance</h2>
              <InsightFamilyTabs activeFamily={activeFamily} onChange={setActiveFamily} />
            </div>
            <ActionPromptStrip cards={actionCards} />
            <PerformanceGoalsPanel
              goals={performanceGoals?.goals ?? []}
              suggestedGoals={performanceGoals?.suggested_goals ?? []}
              performanceRange={performanceRange}
              busySuggestionId={goalsBusySuggestionId}
              onAdoptSuggestion={onAdoptPerformanceGoalSuggestion}
              onRemoveGoal={onRemovePerformanceGoal}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
