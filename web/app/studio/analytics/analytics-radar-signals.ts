import type { CreatorPostPerformanceData } from "@/lib/relay-api";

export type RadarPostMetric = {
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
  viewRate: number;
  engagementRate: number;
  signals: number;
};

export type RadarPerformanceBadge = {
  label: "Strong Response" | "Fan Favorite" | "Conversation" | "Sleeper Hit" | "High Reach" | "Low Conversion";
  tone: "strong" | "favorite" | "conversation" | "sleeper" | "reach" | "conversion";
  detail: string;
};

export type RadarCohortSummary = {
  totalReach: number;
  postCount: number;
  avgViewRate: number;
  avgEngagementRate: number;
  aboveAvgReachCount: number;
  medianReach: number;
  highReachThreshold: number;
  scaleHighReach: number;
  scaleAvgReach: number;
};

type RadarPostMetricInput = Omit<
  RadarPostMetric,
  "angle" | "normalizedReach" | "normalizedViews" | "viewRate" | "engagementRate" | "signals"
>;

type RadarPostMetricEnriched = RadarPostMetricInput &
  Pick<RadarPostMetric, "viewRate" | "engagementRate" | "signals">;

const MOCK_TEMPLATES: Array<
  Omit<
    RadarPostMetric,
    | "angle"
    | "normalizedReach"
    | "normalizedViews"
    | "viewRate"
    | "engagementRate"
    | "signals"
    | "publishedAt"
  > & { daysAgo: number }
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
  }
];

export function formatRadarNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "--";
  return Math.round(value).toLocaleString();
}

export function formatRadarPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "--";
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

export function viewRate(impressions: number, seen: number): number {
  if (impressions <= 0) return 0;
  return Math.min(100, (seen / impressions) * 100);
}

export function engagementRateFromViews(seen: number, likes: number, comments: number): number {
  if (seen <= 0) return 0;
  return Math.min(100, ((likes + comments) / seen) * 100);
}

export function engagementSaturationShare(seen: number, likes: number, comments: number): number {
  if (seen <= 0) return 0;
  const signals = likes + comments;
  if (signals <= 0) return 0;
  return Math.min(1, signals / seen);
}

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

function enrichMetric(row: RadarPostMetricInput): RadarPostMetricEnriched {
  const signals = row.likes + row.comments;
  return {
    ...row,
    signals,
    viewRate: viewRate(row.impressions, row.seen),
    engagementRate: engagementRateFromViews(row.seen, row.likes, row.comments)
  };
}

function titleForPerformanceRow(row: CreatorPostPerformanceData["rows"][number]): string {
  return row.relay?.title?.trim() || row.patreon_post_id;
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

function rowToRadarMetric(
  row: CreatorPostPerformanceData["rows"][number],
  fallbackIndex: number
): RadarPostMetricEnriched {
  const id = row.post_id ?? row.patreon_post_id ?? `post-${fallbackIndex}`;
  const impressions = row.insights?.impressions ?? row.insights?.seen ?? 0;
  const seen = row.insights?.seen ?? Math.round(impressions * 0.45);
  const likes = row.insights?.likes ?? 0;
  const comments = row.insights?.comments ?? 0;
  return enrichMetric({
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
  });
}

function buildMockPosts(now = Date.now()) {
  return MOCK_TEMPLATES.map(({ daysAgo, ...template }) =>
    enrichMetric({
      ...template,
      publishedAt: new Date(now - daysAgo * 86_400_000).toISOString()
    })
  );
}

export function buildRadarPostMetrics(
  performance: CreatorPostPerformanceData | null,
  days: number
): RadarPostMetric[] {
  const now = Date.now();
  const liveRows = [...(performance?.rows ?? [])]
    .filter((row) => {
      const publishedAt = row.relay?.published_at ?? row.insights?.as_of;
      return isPublishedWithinWindow(publishedAt, days, now);
    })
    .map(rowToRadarMetric);

  const mockRows = buildMockPosts(now).filter(
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

export function summarizeRadarCohort(metrics: RadarPostMetric[]): RadarCohortSummary {
  const totalReach = metrics.reduce((sum, metric) => sum + metric.impressions, 0);
  const medianReach = median(metrics.map((row) => row.impressions));
  const highReachThreshold = percentile(metrics.map((row) => row.impressions), 0.9);
  const maxReach = Math.max(1, ...metrics.map((row) => row.impressions));
  const viewRates = metrics.map((row) => row.viewRate);
  const engagementRates = metrics.map((row) => row.engagementRate);

  return {
    totalReach,
    postCount: metrics.length,
    avgViewRate: viewRates.length ? viewRates.reduce((a, b) => a + b, 0) / viewRates.length : 0,
    avgEngagementRate: engagementRates.length
      ? engagementRates.reduce((a, b) => a + b, 0) / engagementRates.length
      : 0,
    aboveAvgReachCount: metrics.filter((row) => row.impressions >= medianReach).length,
    medianReach,
    highReachThreshold,
    scaleHighReach: maxReach,
    scaleAvgReach: medianReach
  };
}

export function postPerformanceBadge(
  metric: RadarPostMetric,
  cohort: RadarPostMetric[]
): RadarPerformanceBadge | null {
  const signals = metric.signals;
  const engagementRate = metric.engagementRate / 100;
  const likeRate = metric.seen > 0 ? metric.likes / metric.seen : 0;
  const commentRate = metric.seen > 0 ? metric.comments / metric.seen : 0;
  const viewRateRatio = metric.viewRate / 100;
  const medianImpressions = median(cohort.map((row) => row.impressions));
  const medianViews = median(cohort.map((row) => row.seen));
  const minimumViews = Math.max(100, medianViews * 0.6);
  const topSignals = percentile(cohort.map((row) => row.signals), 0.85);
  const topLikes = percentile(cohort.map((row) => row.likes), 0.85);
  const topComments = percentile(cohort.map((row) => row.comments), 0.85);
  const topEngagementRate = percentile(
    cohort.map((row) => engagementSaturationShare(row.seen, row.likes, row.comments)),
    0.85
  );
  const topLikeRate = percentile(cohort.map((row) => (row.seen > 0 ? row.likes / row.seen : 0)), 0.85);
  const topCommentRate = percentile(cohort.map((row) => (row.seen > 0 ? row.comments / row.seen : 0)), 0.85);
  const topReach = percentile(cohort.map((row) => row.impressions), 0.9);
  const topViews = percentile(cohort.map((row) => row.seen), 0.9);

  if (
    metric.impressions >= topReach * 0.85 &&
    viewRateRatio >= 0.35 &&
    engagementRate < Math.max(0.06, topEngagementRate * 0.55)
  ) {
    return {
      label: "Low Conversion",
      tone: "conversion",
      detail: "High reach, but fewer viewers turned into likes or comments."
    };
  }

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
      label: "Strong Response",
      tone: "strong",
      detail: "A high share of viewers left meaningful response."
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
      label: "High Reach",
      tone: "reach",
      detail: "This post traveled farther than most in this window."
    };
  }

  return null;
}

export function actionSignalForPost(metric: RadarPostMetric, cohort: RadarPostMetric[]): string {
  const badge = postPerformanceBadge(metric, cohort);
  const summary = summarizeRadarCohort(cohort);

  if (badge?.label === "Low Conversion") {
    return "High reach with low response rate. Better for awareness than paid promo.";
  }

  if (badge?.label === "Sleeper Hit") {
    return "Smaller audience, strong response. Worth resharing to your core fans.";
  }

  if (badge?.label === "Strong Response") {
    return "Reach and engagement move together. Strong promo candidate.";
  }

  if (metric.viewRate < summary.avgViewRate * 0.7 && metric.impressions >= summary.medianReach) {
    return "Lots of impressions, fewer opens. Test a sharper title or thumbnail.";
  }

  if (metric.engagementRate >= summary.avgEngagementRate * 1.25) {
    return "Viewers are responding well. Consider a follow-up or series.";
  }

  if (metric.impressions >= summary.highReachThreshold) {
    return "Top reach in this window. Capture what worked before the next post.";
  }

  return "Steady performance. Compare view rate and engagement rate against your average.";
}

export function badgeStyles(tone: RadarPerformanceBadge["tone"]): {
  background: string;
  borderColor: string;
  color: string;
} {
  switch (tone) {
    case "reach":
      return {
        background: "rgba(52,211,153,0.18)",
        borderColor: "rgba(52,211,153,0.38)",
        color: "#9bf0c4"
      };
    case "conversion":
      return {
        background: "rgba(212,175,55,0.14)",
        borderColor: "rgba(212,175,55,0.42)",
        color: "#f5d77a"
      };
    case "conversation":
      return {
        background: "rgba(147,197,253,0.18)",
        borderColor: "rgba(147,197,253,0.3)",
        color: "#bfdbfe"
      };
    case "favorite":
      return {
        background: "rgba(240,253,244,0.12)",
        borderColor: "rgba(240,253,244,0.28)",
        color: "#f0fdf4"
      };
    case "sleeper":
    case "strong":
    default:
      return {
        background: "rgba(67,94,142,0.24)",
        borderColor: "rgba(240,253,244,0.28)",
        color: "#f0fdf4"
      };
  }
}
