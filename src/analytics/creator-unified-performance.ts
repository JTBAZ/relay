/**
 * Slice 2d-4 — Creator unified performance read model from daily rollups (+ CSV fallback).
 */

import type { PrismaClient } from "@prisma/client";
import { formatMetricRollupDay } from "./external-metric-rollup-service.js";

export const UNIFIED_PERFORMANCE_RANGES = ["7d", "30d", "90d"] as const;
export type UnifiedPerformanceRange = (typeof UNIFIED_PERFORMANCE_RANGES)[number];

const CORE_METRICS = ["impressions", "seen", "likes", "comments", "views"] as const;
type CoreMetric = (typeof CORE_METRICS)[number];
const REACH_METRICS = new Set<CoreMetric>(["impressions", "seen", "views"]);

export type UnifiedPerformanceMetricTotals = Record<CoreMetric, number>;

export type UnifiedPerformanceDestinationTotals = UnifiedPerformanceMetricTotals & {
  destination: string;
};

export type UnifiedPerformanceTopPostDestination = UnifiedPerformanceMetricTotals & {
  destination: string;
};

export type UnifiedPerformanceTopPost = {
  post_id: string;
  title: string | null;
  total_reach: number;
  destinations: UnifiedPerformanceTopPostDestination[];
};

export type UnifiedPerformanceDailyPoint = UnifiedPerformanceMetricTotals & {
  day: string;
};

export type CreatorUnifiedPerformanceReport = {
  creator_id: string;
  as_of: string;
  range: UnifiedPerformanceRange;
  time_range: { start: string; end: string };
  source: "rollup" | "csv_fallback";
  rollup_computed_at: string | null;
  totals: UnifiedPerformanceMetricTotals;
  by_destination: UnifiedPerformanceDestinationTotals[];
  top_posts: UnifiedPerformanceTopPost[];
  daily_series: UnifiedPerformanceDailyPoint[];
};

export type GetCreatorUnifiedPerformanceResult =
  | { ok: true; report: CreatorUnifiedPerformanceReport }
  | { ok: false; code: "NO_TENANT" };

type RollupRow = {
  postId: string;
  destination: string;
  metricType: string;
  day: Date;
  value: number;
  deltaFromPrior: number | null;
  computedAt: Date;
  source?: string;
};

export type { RollupRow };

function emptyMetricTotals(): UnifiedPerformanceMetricTotals {
  return {
    impressions: 0,
    seen: 0,
    likes: 0,
    comments: 0,
    views: 0
  };
}

function isCoreMetric(metricType: string): metricType is CoreMetric {
  return (CORE_METRICS as readonly string[]).includes(metricType);
}

function addToTotals(
  totals: UnifiedPerformanceMetricTotals,
  metricType: string,
  amount: number
): void {
  if (!isCoreMetric(metricType)) return;
  totals[metricType] += amount;
}

export function parseUnifiedPerformanceRange(raw: string | undefined): UnifiedPerformanceRange {
  const normalized = raw?.trim() ?? "30d";
  if ((UNIFIED_PERFORMANCE_RANGES as readonly string[]).includes(normalized)) {
    return normalized as UnifiedPerformanceRange;
  }
  return "30d";
}

export function resolveUnifiedPerformanceWindow(
  range: UnifiedPerformanceRange,
  asOf: Date
): { start: Date; end: Date } {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const end = asOf;
  const start = new Date(end.getTime());
  start.setUTCDate(start.getUTCDate() - days);
  start.setUTCHours(0, 0, 0, 0);
  return { start, end };
}

export async function loadCreatorRollupRows(
  prisma: PrismaClient,
  creatorId: string,
  window: { start: Date; end: Date },
  filters?: { destination?: string; postIds?: string[] }
): Promise<RollupRow[]> {
  const destinationFilter = filters?.destination?.trim() || undefined;
  const postIds = filters?.postIds?.map((id) => id.trim()).filter(Boolean);

  return prisma.externalPostMetricDaily.findMany({
    where: {
      creatorId,
      day: { gte: window.start, lte: window.end },
      ...(destinationFilter ? { destination: destinationFilter } : {}),
      ...(postIds && postIds.length > 0 ? { postId: { in: postIds } } : {})
    },
    select: {
      postId: true,
      destination: true,
      metricType: true,
      day: true,
      value: true,
      deltaFromPrior: true,
      computedAt: true,
      source: true
    },
    orderBy: [{ day: "asc" }, { destination: "asc" }, { metricType: "asc" }]
  });
}

export function aggregateRollupRows(rows: RollupRow[]): {
  totals: UnifiedPerformanceMetricTotals;
  by_destination: UnifiedPerformanceDestinationTotals[];
  daily_series: UnifiedPerformanceDailyPoint[];
  top_posts: Array<{ postId: string; totalReach: number; destinations: Map<string, UnifiedPerformanceMetricTotals> }>;
  rollup_computed_at: Date | null;
} {
  const totals = emptyMetricTotals();
  const byDestination = new Map<string, UnifiedPerformanceMetricTotals>();
  const daily = new Map<string, UnifiedPerformanceMetricTotals>();
  const posts = new Map<
    string,
    { totalReach: number; destinations: Map<string, UnifiedPerformanceMetricTotals> }
  >();
  let rollupComputedAt: Date | null = null;

  for (const row of rows) {
    if (!rollupComputedAt || row.computedAt > rollupComputedAt) {
      rollupComputedAt = row.computedAt;
    }

    const delta = row.deltaFromPrior ?? 0;
    addToTotals(totals, row.metricType, delta);

    const destinationTotals = byDestination.get(row.destination) ?? emptyMetricTotals();
    addToTotals(destinationTotals, row.metricType, delta);
    byDestination.set(row.destination, destinationTotals);

    const dayKey = formatMetricRollupDay(row.day);
    const dayTotals = daily.get(dayKey) ?? emptyMetricTotals();
    addToTotals(dayTotals, row.metricType, delta);
    daily.set(dayKey, dayTotals);

    const postEntry = posts.get(row.postId) ?? {
      totalReach: 0,
      destinations: new Map<string, UnifiedPerformanceMetricTotals>()
    };
    if (isCoreMetric(row.metricType) && REACH_METRICS.has(row.metricType)) {
      postEntry.totalReach += delta;
    }
    const postDest = postEntry.destinations.get(row.destination) ?? emptyMetricTotals();
    addToTotals(postDest, row.metricType, delta);
    postEntry.destinations.set(row.destination, postDest);
    posts.set(row.postId, postEntry);
  }

  const daily_series = [...daily.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, metrics]) => ({ day, ...metrics }));

  const by_destination = [...byDestination.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([destination, metrics]) => ({ destination, ...metrics }));

  const top_posts = [...posts.entries()]
    .map(([postId, entry]) => ({
      postId,
      totalReach: entry.totalReach,
      destinations: entry.destinations
    }))
    .sort((a, b) => b.totalReach - a.totalReach);

  return {
    totals,
    by_destination,
    daily_series,
    top_posts,
    rollup_computed_at: rollupComputedAt
  };
}

async function loadPostTitles(
  prisma: PrismaClient,
  creatorId: string,
  postIds: string[]
): Promise<Map<string, string | null>> {
  if (postIds.length === 0) return new Map();

  const posts = await prisma.post.findMany({
    where: { creatorId, id: { in: postIds } },
    select: {
      id: true,
      versions: {
        orderBy: { versionSeq: "desc" },
        take: 1,
        select: { title: true }
      }
    }
  });

  return new Map(
    posts.map((post) => [post.id, post.versions[0]?.title ?? null] as const)
  );
}

function mapTopPosts(
  ranked: Array<{
    postId: string;
    totalReach: number;
    destinations: Map<string, UnifiedPerformanceMetricTotals>;
  }>,
  titles: Map<string, string | null>,
  limit: number
): UnifiedPerformanceTopPost[] {
  return ranked.slice(0, limit).map((entry) => ({
    post_id: entry.postId,
    title: titles.get(entry.postId) ?? null,
    total_reach: entry.totalReach,
    destinations: [...entry.destinations.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([destination, metrics]) => ({ destination, ...metrics }))
  }));
}

async function buildCsvFallbackReport(
  prisma: PrismaClient,
  creatorId: string,
  range: UnifiedPerformanceRange,
  asOf: Date,
  topPostsLimit: number
): Promise<Omit<CreatorUnifiedPerformanceReport, "creator_id">> {
  const { start, end } = resolveUnifiedPerformanceWindow(range, asOf);
  const totals = emptyMetricTotals();
  const byDestination: UnifiedPerformanceDestinationTotals[] = [];
  const topPostsRaw: Array<{
    postId: string;
    totalReach: number;
    destinations: Map<string, UnifiedPerformanceMetricTotals>;
  }> = [];

  const latestImport = await prisma.patreonInsightsImport.findFirst({
    where: { creatorId },
    orderBy: { uploadedAt: "desc" },
    select: { id: true }
  });

  if (latestImport) {
    const metrics = await prisma.patreonInsightsPostMetric.findMany({
      where: { importId: latestImport.id, creatorId, postId: { not: null } },
      select: {
        postId: true,
        impressions: true,
        seen: true,
        likes: true,
        comments: true
      },
      take: 500
    });

    const patreonTotals = emptyMetricTotals();
    for (const row of metrics) {
      const postId = row.postId?.trim();
      if (!postId) continue;

      const postTotals = emptyMetricTotals();
      if (row.impressions != null) {
        patreonTotals.impressions += row.impressions;
        postTotals.impressions = row.impressions;
      }
      if (row.seen != null) {
        patreonTotals.seen += row.seen;
        postTotals.seen = row.seen;
      }
      if (row.likes != null) {
        patreonTotals.likes += row.likes;
        postTotals.likes = row.likes;
      }
      if (row.comments != null) {
        patreonTotals.comments += row.comments;
        postTotals.comments = row.comments;
      }

      const totalReach = postTotals.impressions + postTotals.seen + postTotals.views;
      topPostsRaw.push({
        postId,
        totalReach,
        destinations: new Map([["patreon", postTotals]])
      });

      totals.impressions += postTotals.impressions;
      totals.seen += postTotals.seen;
      totals.likes += postTotals.likes;
      totals.comments += postTotals.comments;
    }

    if (metrics.length > 0) {
      byDestination.push({ destination: "patreon", ...patreonTotals });
    }
  }

  topPostsRaw.sort((a, b) => b.totalReach - a.totalReach);
  const titles = await loadPostTitles(
    prisma,
    creatorId,
    topPostsRaw.slice(0, topPostsLimit).map((row) => row.postId)
  );

  return {
    as_of: asOf.toISOString(),
    range,
    time_range: { start: start.toISOString(), end: end.toISOString() },
    source: "csv_fallback",
    rollup_computed_at: null,
    totals,
    by_destination: byDestination,
    top_posts: mapTopPosts(topPostsRaw, titles, topPostsLimit),
    daily_series: []
  };
}

export async function getCreatorUnifiedPerformance(
  prisma: PrismaClient,
  relayCreatorId: string,
  options?: {
    range?: UnifiedPerformanceRange;
    destination?: string | null;
    topPostsLimit?: number;
    asOf?: Date;
  }
): Promise<GetCreatorUnifiedPerformanceResult> {
  const creatorId = relayCreatorId.trim();
  const tenant = await prisma.tenant.findUnique({
    where: { relayCreatorId: creatorId },
    select: { id: true }
  });
  if (!tenant) {
    return { ok: false, code: "NO_TENANT" };
  }

  const range = options?.range ?? "30d";
  const asOf = options?.asOf ?? new Date();
  const { start, end } = resolveUnifiedPerformanceWindow(range, asOf);
  const topPostsLimit = Math.min(Math.max(options?.topPostsLimit ?? 20, 1), 100);
  const destinationFilter = options?.destination?.trim() || undefined;

  const rollupRows = await loadCreatorRollupRows(
    prisma,
    creatorId,
    { start, end },
    { destination: destinationFilter }
  );

  if (rollupRows.length === 0) {
    const fallback = await buildCsvFallbackReport(
      prisma,
      creatorId,
      range,
      asOf,
      topPostsLimit
    );
    return {
      ok: true,
      report: {
        creator_id: creatorId,
        ...fallback
      }
    };
  }

  const aggregated = aggregateRollupRows(rollupRows);
  const titles = await loadPostTitles(
    prisma,
    creatorId,
    aggregated.top_posts.slice(0, topPostsLimit).map((row) => row.postId)
  );

  return {
    ok: true,
    report: {
      creator_id: creatorId,
      as_of: asOf.toISOString(),
      range,
      time_range: { start: start.toISOString(), end: end.toISOString() },
      source: "rollup",
      rollup_computed_at: aggregated.rollup_computed_at?.toISOString() ?? null,
      totals: aggregated.totals,
      by_destination: aggregated.by_destination,
      top_posts: mapTopPosts(aggregated.top_posts, titles, topPostsLimit),
      daily_series: aggregated.daily_series
    }
  };
}
