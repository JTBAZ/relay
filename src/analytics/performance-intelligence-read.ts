/**
 * Performance intelligence Phase 3 — scoped unified read model (V2).
 * @see docs/analytics/UNIFIED_READ_V2.md
 */

import type { CreativeWorkVariantRole, PrismaClient } from "@prisma/client";
import { getCreatorPostingGoalStatus } from "../autopost/posting-goal-service.js";
import {
  aggregateRollupRows,
  getCreatorUnifiedPerformance,
  loadCreatorRollupRows,
  parseUnifiedPerformanceRange,
  resolveUnifiedPerformanceWindow,
  type CreatorUnifiedPerformanceReport,
  type RollupRow,
  type UnifiedPerformanceDestinationTotals,
  type UnifiedPerformanceMetricTotals,
  type UnifiedPerformanceRange
} from "./creator-unified-performance.js";
import {
  platformInstanceRefreshEligibility,
  type PlatformInstanceRefreshEligibilityWire
} from "./platform-instance-refresh-service.js";
import {
  computeWorkCrosspostGaps,
  type PerformanceWorkCrosspostGapsWire
} from "./work-crosspost-gaps.js";

export type { PerformanceWorkCrosspostGapsWire };
export { computeWorkCrosspostGaps };

export type PerformanceReadErrorCode = "NO_TENANT" | "NOT_FOUND";

export type PerformanceFreshnessWire = {
  rollup_computed_at: string | null;
  stale: boolean;
  stale_after_hours: number;
};

export type PerformanceConfidenceWire = "high" | "medium" | "low" | "unknown";

export type PerformanceSourceSummaryWire = {
  destination: string;
  source: string;
  confidence: PerformanceConfidenceWire;
};

const STALE_AFTER_HOURS = 48;

type ReadContext = {
  creatorId: string;
  range: UnifiedPerformanceRange;
  asOf: Date;
  start: Date;
  end: Date;
};

type CreativeWorkWithMembers = {
  id: string;
  title: string;
  description: string | null;
  analyticsCampaignLabel: string | null;
  tags: string[];
  isDefaultBundle: boolean;
  members: Array<{
    postId: string;
    variantRole: string;
    sortOrder: number;
  }>;
};

async function ensureTenant(
  prisma: PrismaClient,
  relayCreatorId: string
): Promise<{ ok: true; creatorId: string } | { ok: false; code: "NO_TENANT" }> {
  const creatorId = relayCreatorId.trim();
  const tenant = await prisma.tenant.findUnique({
    where: { relayCreatorId: creatorId },
    select: { id: true }
  });
  if (!tenant) {
    return { ok: false, code: "NO_TENANT" };
  }
  return { ok: true, creatorId };
}

function buildReadContext(
  creatorId: string,
  options?: { range?: UnifiedPerformanceRange; asOf?: Date }
): ReadContext {
  const range = options?.range ?? "30d";
  const asOf = options?.asOf ?? new Date();
  const { start, end } = resolveUnifiedPerformanceWindow(range, asOf);
  return { creatorId, range, asOf, start, end };
}

function totalReachFromTotals(totals: UnifiedPerformanceMetricTotals): number {
  return totals.impressions + totals.seen + totals.views;
}

export function confidenceFromSource(
  source: string | null | undefined,
  ageHours: number
): PerformanceConfidenceWire {
  const normalized = source?.trim() ?? "";
  if (!normalized) return "unknown";
  if (normalized === "platform_api" || normalized === "extension_dom") {
    return ageHours <= STALE_AFTER_HOURS ? "high" : "medium";
  }
  if (normalized === "third_party" || normalized === "manual") {
    return "medium";
  }
  if (normalized === "public_scrape") {
    return ageHours <= STALE_AFTER_HOURS * 1.5 ? "medium" : "low";
  }
  return ageHours <= STALE_AFTER_HOURS ? "medium" : "low";
}

function buildFreshness(rollupComputedAt: Date | null, asOf: Date): PerformanceFreshnessWire {
  if (!rollupComputedAt) {
    return {
      rollup_computed_at: null,
      stale: true,
      stale_after_hours: STALE_AFTER_HOURS
    };
  }
  const ageHours = (asOf.getTime() - rollupComputedAt.getTime()) / (1000 * 60 * 60);
  return {
    rollup_computed_at: rollupComputedAt.toISOString(),
    stale: ageHours > STALE_AFTER_HOURS,
    stale_after_hours: STALE_AFTER_HOURS
  };
}

function latestSourceByDestination(rows: RollupRow[], asOf: Date): PerformanceSourceSummaryWire[] {
  const latest = new Map<string, { source: string; computedAt: Date }>();
  for (const row of rows) {
    const source = row.source?.trim() || "unknown";
    const existing = latest.get(row.destination);
    if (!existing || row.computedAt > existing.computedAt) {
      latest.set(row.destination, { source, computedAt: row.computedAt });
    }
  }

  return [...latest.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([destination, entry]) => {
      const ageHours = (asOf.getTime() - entry.computedAt.getTime()) / (1000 * 60 * 60);
      return {
        destination,
        source: entry.source,
        confidence: confidenceFromSource(entry.source, ageHours)
      };
    });
}

function mapAggregatedPerformance(
  rows: RollupRow[],
  asOf: Date
): {
  totals: UnifiedPerformanceMetricTotals;
  by_destination: UnifiedPerformanceDestinationTotals[];
  daily_series: ReturnType<typeof aggregateRollupRows>["daily_series"];
  total_reach: number;
  freshness: PerformanceFreshnessWire;
  source_summary: PerformanceSourceSummaryWire[];
} {
  const aggregated = aggregateRollupRows(rows);
  return {
    totals: aggregated.totals,
    by_destination: aggregated.by_destination,
    daily_series: aggregated.daily_series,
    total_reach: totalReachFromTotals(aggregated.totals),
    freshness: buildFreshness(aggregated.rollup_computed_at, asOf),
    source_summary: latestSourceByDestination(rows, asOf)
  };
}

async function loadCreativeWorksForCreator(
  prisma: PrismaClient,
  creatorId: string
): Promise<CreativeWorkWithMembers[]> {
  return prisma.creativeWork.findMany({
    where: { creatorId },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      description: true,
      analyticsCampaignLabel: true,
      tags: true,
      isDefaultBundle: true,
      members: {
        orderBy: [{ sortOrder: "asc" }, { linkedAt: "asc" }],
        select: {
          postId: true,
          variantRole: true,
          sortOrder: true
        }
      }
    }
  });
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

function mapPlatformInstanceWire(row: {
  id: string;
  destination: string;
  externalUrl: string | null;
  externalId: string | null;
  attemptId: string | null;
  linkSource: string;
  status: string;
  refreshPolicy: string;
  linkedAt: Date;
  lastRefreshedAt: Date | null;
}) {
  return {
    platform_instance_id: row.id,
    destination: row.destination,
    external_url: row.externalUrl,
    external_id: row.externalId,
    attempt_id: row.attemptId,
    link_source: row.linkSource,
    status: row.status,
    refresh_policy: row.refreshPolicy,
    linked_at: row.linkedAt.toISOString(),
    last_refreshed_at: row.lastRefreshedAt?.toISOString() ?? null
  };
}

export type PerformanceOverviewReport = {
  creator_id: string;
  as_of: string;
  range: UnifiedPerformanceRange;
  time_range: { start: string; end: string };
  source: "rollup" | "csv_fallback";
  hierarchy: {
    creative_work_count: number;
    post_count: number;
    platform_instance_count: number;
  };
  posting_goal: Awaited<ReturnType<typeof getCreatorPostingGoalStatus>>;
  performance: CreatorUnifiedPerformanceReport;
  freshness: PerformanceFreshnessWire;
  source_summary: PerformanceSourceSummaryWire[];
};

export async function getPerformanceOverview(
  prisma: PrismaClient,
  relayCreatorId: string,
  options?: { range?: UnifiedPerformanceRange; destination?: string | null; asOf?: Date }
): Promise<
  { ok: true; report: PerformanceOverviewReport } | { ok: false; code: PerformanceReadErrorCode }
> {
  const tenant = await ensureTenant(prisma, relayCreatorId);
  if (!tenant.ok) return tenant;

  const ctx = buildReadContext(tenant.creatorId, options);
  const [performanceOut, creativeWorkCount, postCount, platformInstanceCount, postingGoal] =
    await Promise.all([
      getCreatorUnifiedPerformance(prisma, tenant.creatorId, {
        range: ctx.range,
        destination: options?.destination,
        asOf: ctx.asOf
      }),
      prisma.creativeWork.count({ where: { creatorId: tenant.creatorId } }),
      prisma.post.count({ where: { creatorId: tenant.creatorId } }),
      prisma.platformInstance.count({ where: { creatorId: tenant.creatorId, status: "active" } }),
      getCreatorPostingGoalStatus(prisma, tenant.creatorId, ctx.asOf)
    ]);

  if (!performanceOut.ok) {
    return { ok: false, code: "NO_TENANT" };
  }

  const rollupRows = await loadCreatorRollupRows(prisma, tenant.creatorId, {
    start: ctx.start,
    end: ctx.end
  }, { destination: options?.destination?.trim() || undefined });

  const sourceSummary = latestSourceByDestination(rollupRows, ctx.asOf);

  return {
    ok: true,
    report: {
      creator_id: tenant.creatorId,
      as_of: ctx.asOf.toISOString(),
      range: ctx.range,
      time_range: {
        start: ctx.start.toISOString(),
        end: ctx.end.toISOString()
      },
      source: performanceOut.report.source,
      hierarchy: {
        creative_work_count: creativeWorkCount,
        post_count: postCount,
        platform_instance_count: platformInstanceCount
      },
      posting_goal: postingGoal,
      performance: performanceOut.report,
      freshness: buildFreshness(
        performanceOut.report.rollup_computed_at
          ? new Date(performanceOut.report.rollup_computed_at)
          : null,
        ctx.asOf
      ),
      source_summary: sourceSummary
    }
  };
}

export type PerformanceCampaignGroupWire = {
  campaign_label: string | null;
  campaign_label_display: string;
  creative_work_count: number;
  post_count: number;
  total_reach: number;
  totals: UnifiedPerformanceMetricTotals;
  by_destination: UnifiedPerformanceDestinationTotals[];
};

export type PerformanceCampaignRollupReport = {
  creator_id: string;
  as_of: string;
  range: UnifiedPerformanceRange;
  time_range: { start: string; end: string };
  groups: PerformanceCampaignGroupWire[];
  freshness: PerformanceFreshnessWire;
};

export async function getPerformanceCampaignRollups(
  prisma: PrismaClient,
  relayCreatorId: string,
  options?: { range?: UnifiedPerformanceRange; asOf?: Date }
): Promise<
  { ok: true; report: PerformanceCampaignRollupReport } | { ok: false; code: PerformanceReadErrorCode }
> {
  const tenant = await ensureTenant(prisma, relayCreatorId);
  if (!tenant.ok) return tenant;

  const ctx = buildReadContext(tenant.creatorId, options);
  const [works, rollupRows] = await Promise.all([
    loadCreativeWorksForCreator(prisma, tenant.creatorId),
    loadCreatorRollupRows(prisma, tenant.creatorId, { start: ctx.start, end: ctx.end })
  ]);

  const postToCampaign = new Map<string, string | null>();
  for (const work of works) {
    for (const member of work.members) {
      postToCampaign.set(member.postId, work.analyticsCampaignLabel);
    }
  }

  const groupedRows = new Map<string | null, RollupRow[]>();
  for (const row of rollupRows) {
    const label = postToCampaign.get(row.postId) ?? null;
    const bucket = groupedRows.get(label) ?? [];
    bucket.push(row);
    groupedRows.set(label, bucket);
  }

  const workCountByCampaign = new Map<string | null, number>();
  const postCountByCampaign = new Map<string | null, number>();
  for (const work of works) {
    const label = work.analyticsCampaignLabel;
    workCountByCampaign.set(label, (workCountByCampaign.get(label) ?? 0) + 1);
    postCountByCampaign.set(label, (postCountByCampaign.get(label) ?? 0) + work.members.length);
  }

  const labels = new Set<string | null>([
    ...groupedRows.keys(),
    ...workCountByCampaign.keys()
  ]);

  const groups: PerformanceCampaignGroupWire[] = [...labels]
    .map((campaignLabel) => {
      const rows = groupedRows.get(campaignLabel) ?? [];
      const aggregated = mapAggregatedPerformance(rows, ctx.asOf);
      return {
        campaign_label: campaignLabel,
        campaign_label_display: campaignLabel?.trim() || "Uncategorized",
        creative_work_count: workCountByCampaign.get(campaignLabel) ?? 0,
        post_count: postCountByCampaign.get(campaignLabel) ?? 0,
        total_reach: aggregated.total_reach,
        totals: aggregated.totals,
        by_destination: aggregated.by_destination
      };
    })
    .sort((a, b) => b.total_reach - a.total_reach);

  const freshness = buildFreshness(
    rollupRows.reduce<Date | null>((latest, row) => {
      if (!latest || row.computedAt > latest) return row.computedAt;
      return latest;
    }, null),
    ctx.asOf
  );

  return {
    ok: true,
    report: {
      creator_id: tenant.creatorId,
      as_of: ctx.asOf.toISOString(),
      range: ctx.range,
      time_range: { start: ctx.start.toISOString(), end: ctx.end.toISOString() },
      groups,
      freshness
    }
  };
}

export type PerformanceTagGroupWire = {
  tag: string;
  creative_work_count: number;
  post_count: number;
  total_reach: number;
  totals: UnifiedPerformanceMetricTotals;
  by_destination: UnifiedPerformanceDestinationTotals[];
};

export type PerformanceTagRollupReport = {
  creator_id: string;
  as_of: string;
  range: UnifiedPerformanceRange;
  time_range: { start: string; end: string };
  tag_filter: string | null;
  groups: PerformanceTagGroupWire[];
  freshness: PerformanceFreshnessWire;
};

export async function getPerformanceTagRollups(
  prisma: PrismaClient,
  relayCreatorId: string,
  options?: { range?: UnifiedPerformanceRange; tag?: string | null; asOf?: Date }
): Promise<
  { ok: true; report: PerformanceTagRollupReport } | { ok: false; code: PerformanceReadErrorCode }
> {
  const tenant = await ensureTenant(prisma, relayCreatorId);
  if (!tenant.ok) return tenant;

  const ctx = buildReadContext(tenant.creatorId, options);
  const tagFilter = options?.tag?.trim().toLowerCase() || null;
  const works = await loadCreativeWorksForCreator(prisma, tenant.creatorId);
  const scopedWorks = tagFilter
    ? works.filter((work) => work.tags.some((tag) => tag.toLowerCase() === tagFilter))
    : works;

  const postIds = scopedWorks.flatMap((work) => work.members.map((member) => member.postId));
  const rollupRows = await loadCreatorRollupRows(
    prisma,
    tenant.creatorId,
    { start: ctx.start, end: ctx.end },
    { postIds: postIds.length > 0 ? postIds : ["__none__"] }
  );

  const postToTags = new Map<string, string[]>();
  for (const work of scopedWorks) {
    for (const member of work.members) {
      postToTags.set(member.postId, work.tags);
    }
  }

  const groupedRows = new Map<string, RollupRow[]>();
  const workCountByTag = new Map<string, number>();
  const postCountByTag = new Map<string, number>();

  for (const work of scopedWorks) {
    const tags = work.tags.length > 0 ? work.tags : ["untagged"];
    for (const tag of tags) {
      workCountByTag.set(tag, (workCountByTag.get(tag) ?? 0) + 1);
      postCountByTag.set(tag, (postCountByTag.get(tag) ?? 0) + work.members.length);
    }
  }

  for (const row of rollupRows) {
    const tags = postToTags.get(row.postId);
    const tagKeys = tags && tags.length > 0 ? tags : ["untagged"];
    for (const tag of tagKeys) {
      const bucket = groupedRows.get(tag) ?? [];
      bucket.push(row);
      groupedRows.set(tag, bucket);
    }
  }

  const groups: PerformanceTagGroupWire[] = [...groupedRows.entries()]
    .map(([tag, rows]) => {
      const aggregated = mapAggregatedPerformance(rows, ctx.asOf);
      return {
        tag,
        creative_work_count: workCountByTag.get(tag) ?? 0,
        post_count: postCountByTag.get(tag) ?? 0,
        total_reach: aggregated.total_reach,
        totals: aggregated.totals,
        by_destination: aggregated.by_destination
      };
    })
    .sort((a, b) => b.total_reach - a.total_reach);

  const freshness = buildFreshness(
    rollupRows.reduce<Date | null>((latest, row) => {
      if (!latest || row.computedAt > latest) return row.computedAt;
      return latest;
    }, null),
    ctx.asOf
  );

  return {
    ok: true,
    report: {
      creator_id: tenant.creatorId,
      as_of: ctx.asOf.toISOString(),
      range: ctx.range,
      time_range: { start: ctx.start.toISOString(), end: ctx.end.toISOString() },
      tag_filter: tagFilter,
      groups,
      freshness
    }
  };
}

export type PerformanceWorkSummaryWire = {
  creative_work_id: string;
  title: string;
  analytics_campaign_label: string | null;
  tags: string[];
  is_default_bundle: boolean;
  member_count: number;
  total_reach: number;
  totals: UnifiedPerformanceMetricTotals;
  by_destination: UnifiedPerformanceDestinationTotals[];
};

export type PerformanceWorksListReport = {
  creator_id: string;
  as_of: string;
  range: UnifiedPerformanceRange;
  time_range: { start: string; end: string };
  works: PerformanceWorkSummaryWire[];
  freshness: PerformanceFreshnessWire;
};

export async function listPerformanceWorks(
  prisma: PrismaClient,
  relayCreatorId: string,
  options?: { range?: UnifiedPerformanceRange; limit?: number; asOf?: Date }
): Promise<
  { ok: true; report: PerformanceWorksListReport } | { ok: false; code: PerformanceReadErrorCode }
> {
  const tenant = await ensureTenant(prisma, relayCreatorId);
  if (!tenant.ok) return tenant;

  const ctx = buildReadContext(tenant.creatorId, options);
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
  const works = await loadCreativeWorksForCreator(prisma, tenant.creatorId);
  const allPostIds = works.flatMap((work) => work.members.map((member) => member.postId));
  const rollupRows = await loadCreatorRollupRows(
    prisma,
    tenant.creatorId,
    { start: ctx.start, end: ctx.end },
    { postIds: allPostIds.length > 0 ? allPostIds : undefined }
  );

  const rowsByPost = new Map<string, RollupRow[]>();
  for (const row of rollupRows) {
    const bucket = rowsByPost.get(row.postId) ?? [];
    bucket.push(row);
    rowsByPost.set(row.postId, bucket);
  }

  const summaries: PerformanceWorkSummaryWire[] = works.map((work) => {
    const postIds = work.members.map((member) => member.postId);
    const rows = postIds.flatMap((postId) => rowsByPost.get(postId) ?? []);
    const aggregated = mapAggregatedPerformance(rows, ctx.asOf);
    return {
      creative_work_id: work.id,
      title: work.title,
      analytics_campaign_label: work.analyticsCampaignLabel,
      tags: work.tags,
      is_default_bundle: work.isDefaultBundle,
      member_count: work.members.length,
      total_reach: aggregated.total_reach,
      totals: aggregated.totals,
      by_destination: aggregated.by_destination
    };
  });

  summaries.sort((a, b) => b.total_reach - a.total_reach);

  const freshness = buildFreshness(
    rollupRows.reduce<Date | null>((latest, row) => {
      if (!latest || row.computedAt > latest) return row.computedAt;
      return latest;
    }, null),
    ctx.asOf
  );

  return {
    ok: true,
    report: {
      creator_id: tenant.creatorId,
      as_of: ctx.asOf.toISOString(),
      range: ctx.range,
      time_range: { start: ctx.start.toISOString(), end: ctx.end.toISOString() },
      works: summaries.slice(0, limit),
      freshness
    }
  };
}

export type PerformanceVariantWire = {
  post_id: string;
  title: string | null;
  variant_role: string;
  total_reach: number;
  totals: UnifiedPerformanceMetricTotals;
  by_destination: UnifiedPerformanceDestinationTotals[];
  platform_instances: ReturnType<typeof mapPlatformInstanceWire>[];
};

export type PerformanceVariantRoleMetricsWire = {
  member_count: number;
  post_ids: string[];
  total_reach: number;
  totals: UnifiedPerformanceMetricTotals;
  by_destination: UnifiedPerformanceDestinationTotals[];
};

export type PerformanceVariantRoleBreakdown = Partial<
  Record<CreativeWorkVariantRole, PerformanceVariantRoleMetricsWire>
>;

function buildVariantRoleBreakdown(
  members: Array<{ postId: string; variantRole: string }>,
  rowsByPost: Map<string, RollupRow[]>,
  asOf: Date
): PerformanceVariantRoleBreakdown {
  const membersByRole = new Map<string, string[]>();
  for (const member of members) {
    const posts = membersByRole.get(member.variantRole) ?? [];
    posts.push(member.postId);
    membersByRole.set(member.variantRole, posts);
  }

  const breakdown: PerformanceVariantRoleBreakdown = {};
  for (const [role, postIds] of membersByRole.entries()) {
    const rows = postIds.flatMap((postId) => rowsByPost.get(postId) ?? []);
    const aggregated = mapAggregatedPerformance(rows, asOf);
    breakdown[role as CreativeWorkVariantRole] = {
      member_count: postIds.length,
      post_ids: postIds,
      total_reach: aggregated.total_reach,
      totals: aggregated.totals,
      by_destination: aggregated.by_destination
    };
  }

  return breakdown;
}

export type PerformanceWorkBundleReport = {
  creative_work_id: string;
  title: string;
  description: string | null;
  analytics_campaign_label: string | null;
  tags: string[];
  is_default_bundle: boolean;
  as_of: string;
  range: UnifiedPerformanceRange;
  time_range: { start: string; end: string };
  totals: UnifiedPerformanceMetricTotals;
  by_destination: UnifiedPerformanceDestinationTotals[];
  daily_series: ReturnType<typeof aggregateRollupRows>["daily_series"];
  total_reach: number;
  variants: PerformanceVariantWire[];
  role_breakdown?: PerformanceVariantRoleBreakdown;
  crosspost_gaps: PerformanceWorkCrosspostGapsWire;
  freshness: PerformanceFreshnessWire;
  source_summary: PerformanceSourceSummaryWire[];
};

export async function getPerformanceWorkBundle(
  prisma: PrismaClient,
  relayCreatorId: string,
  creativeWorkId: string,
  options?: {
    range?: UnifiedPerformanceRange;
    asOf?: Date;
    groupByVariantRole?: boolean;
  }
): Promise<
  { ok: true; report: PerformanceWorkBundleReport } | { ok: false; code: PerformanceReadErrorCode }
> {
  const tenant = await ensureTenant(prisma, relayCreatorId);
  if (!tenant.ok) return tenant;

  const ctx = buildReadContext(tenant.creatorId, options);
  const work = await prisma.creativeWork.findFirst({
    where: { id: creativeWorkId.trim(), creatorId: tenant.creatorId },
    select: {
      id: true,
      title: true,
      description: true,
      analyticsCampaignLabel: true,
      tags: true,
      isDefaultBundle: true,
      members: {
        orderBy: [{ sortOrder: "asc" }, { linkedAt: "asc" }],
        select: {
          postId: true,
          variantRole: true
        }
      }
    }
  });

  if (!work) {
    return { ok: false, code: "NOT_FOUND" };
  }

  const postIds = work.members.map((member) => member.postId);
  const [rollupRows, titles, platformInstances] = await Promise.all([
    loadCreatorRollupRows(
      prisma,
      tenant.creatorId,
      { start: ctx.start, end: ctx.end },
      { postIds }
    ),
    loadPostTitles(prisma, tenant.creatorId, postIds),
    prisma.platformInstance.findMany({
      where: { creatorId: tenant.creatorId, postId: { in: postIds } },
      orderBy: [{ postId: "asc" }, { destination: "asc" }]
    })
  ]);

  const aggregated = mapAggregatedPerformance(rollupRows, ctx.asOf);
  const rowsByPost = new Map<string, RollupRow[]>();
  for (const row of rollupRows) {
    const bucket = rowsByPost.get(row.postId) ?? [];
    bucket.push(row);
    rowsByPost.set(row.postId, bucket);
  }

  const instancesByPost = new Map<string, ReturnType<typeof mapPlatformInstanceWire>[]>();
  for (const instance of platformInstances) {
    const bucket = instancesByPost.get(instance.postId) ?? [];
    bucket.push(mapPlatformInstanceWire(instance));
    instancesByPost.set(instance.postId, bucket);
  }

  const variants: PerformanceVariantWire[] = work.members.map((member) => {
    const rows = rowsByPost.get(member.postId) ?? [];
    const variantAgg = mapAggregatedPerformance(rows, ctx.asOf);
    return {
      post_id: member.postId,
      title: titles.get(member.postId) ?? null,
      variant_role: member.variantRole,
      total_reach: variantAgg.total_reach,
      totals: variantAgg.totals,
      by_destination: variantAgg.by_destination,
      platform_instances: instancesByPost.get(member.postId) ?? []
    };
  });

  const crosspostGaps = computeWorkCrosspostGaps(work.members, platformInstances);

  const report: PerformanceWorkBundleReport = {
    creative_work_id: work.id,
    title: work.title,
    description: work.description,
    analytics_campaign_label: work.analyticsCampaignLabel,
    tags: work.tags,
    is_default_bundle: work.isDefaultBundle,
    as_of: ctx.asOf.toISOString(),
    range: ctx.range,
    time_range: { start: ctx.start.toISOString(), end: ctx.end.toISOString() },
    totals: aggregated.totals,
    by_destination: aggregated.by_destination,
    daily_series: aggregated.daily_series,
    total_reach: aggregated.total_reach,
    variants,
    crosspost_gaps: crosspostGaps,
    freshness: aggregated.freshness,
    source_summary: aggregated.source_summary
  };

  if (options?.groupByVariantRole) {
    report.role_breakdown = buildVariantRoleBreakdown(work.members, rowsByPost, ctx.asOf);
  }

  return {
    ok: true,
    report
  };
}

export type PerformanceWorkInstanceRowWire = ReturnType<typeof mapPlatformInstanceWire> &
  PlatformInstanceRefreshEligibilityWire;

export type PerformanceWorkPostInstancesWire = {
  post_id: string;
  title: string | null;
  variant_role: string;
  platform_instances: PerformanceWorkInstanceRowWire[];
};

export type PerformanceWorkInstancesReport = {
  creative_work_id: string;
  title: string;
  as_of: string;
  posts: PerformanceWorkPostInstancesWire[];
  crosspost_gaps: PerformanceWorkCrosspostGapsWire;
};

function mapWorkInstanceRow(
  instance: {
    id: string;
    postId: string;
    creatorId: string;
    destination: string;
    externalUrl: string | null;
    externalId: string | null;
    attemptId: string | null;
    linkSource: string;
    status: string;
    refreshPolicy: string;
    linkedAt: Date;
    lastRefreshedAt: Date | null;
    lastManualRefreshRequestedAt: Date | null;
  },
  asOf: Date
): PerformanceWorkInstanceRowWire {
  return {
    ...mapPlatformInstanceWire(instance),
    ...platformInstanceRefreshEligibility(instance, asOf)
  };
}

export async function getPerformanceWorkInstances(
  prisma: PrismaClient,
  relayCreatorId: string,
  creativeWorkId: string,
  options?: { asOf?: Date }
): Promise<
  { ok: true; report: PerformanceWorkInstancesReport } | { ok: false; code: PerformanceReadErrorCode }
> {
  const tenant = await ensureTenant(prisma, relayCreatorId);
  if (!tenant.ok) return tenant;

  const asOf = options?.asOf ?? new Date();
  const work = await prisma.creativeWork.findFirst({
    where: { id: creativeWorkId.trim(), creatorId: tenant.creatorId },
    select: {
      id: true,
      title: true,
      members: {
        orderBy: [{ sortOrder: "asc" }, { linkedAt: "asc" }],
        select: {
          postId: true,
          variantRole: true
        }
      }
    }
  });

  if (!work) {
    return { ok: false, code: "NOT_FOUND" };
  }

  const postIds = work.members.map((member) => member.postId);
  const [titles, platformInstances] = await Promise.all([
    loadPostTitles(prisma, tenant.creatorId, postIds),
    postIds.length > 0
      ? prisma.platformInstance.findMany({
          where: { creatorId: tenant.creatorId, postId: { in: postIds } },
          orderBy: [{ postId: "asc" }, { destination: "asc" }]
        })
      : Promise.resolve([])
  ]);

  const instancesByPost = new Map<string, PerformanceWorkInstanceRowWire[]>();
  for (const instance of platformInstances) {
    const bucket = instancesByPost.get(instance.postId) ?? [];
    bucket.push(mapWorkInstanceRow(instance, asOf));
    instancesByPost.set(instance.postId, bucket);
  }

  const posts: PerformanceWorkPostInstancesWire[] = work.members.map((member) => ({
    post_id: member.postId,
    title: titles.get(member.postId) ?? null,
    variant_role: member.variantRole,
    platform_instances: instancesByPost.get(member.postId) ?? []
  }));

  return {
    ok: true,
    report: {
      creative_work_id: work.id,
      title: work.title,
      as_of: asOf.toISOString(),
      posts,
      crosspost_gaps: computeWorkCrosspostGaps(work.members, platformInstances)
    }
  };
}

export type PerformancePostVariantReport = {
  post_id: string;
  title: string | null;
  creative_work: {
    creative_work_id: string;
    title: string;
    variant_role: string;
    is_default_bundle: boolean;
  } | null;
  as_of: string;
  range: UnifiedPerformanceRange;
  time_range: { start: string; end: string };
  totals: UnifiedPerformanceMetricTotals;
  by_destination: UnifiedPerformanceDestinationTotals[];
  daily_series: ReturnType<typeof aggregateRollupRows>["daily_series"];
  total_reach: number;
  platform_instances: ReturnType<typeof mapPlatformInstanceWire>[];
  freshness: PerformanceFreshnessWire;
  source_summary: PerformanceSourceSummaryWire[];
};

export async function getPerformancePostVariant(
  prisma: PrismaClient,
  relayCreatorId: string,
  postId: string,
  options?: { range?: UnifiedPerformanceRange; asOf?: Date }
): Promise<
  { ok: true; report: PerformancePostVariantReport } | { ok: false; code: PerformanceReadErrorCode }
> {
  const tenant = await ensureTenant(prisma, relayCreatorId);
  if (!tenant.ok) return tenant;

  const normalizedPostId = postId.trim();
  const ctx = buildReadContext(tenant.creatorId, options);

  const post = await prisma.post.findFirst({
    where: { id: normalizedPostId, creatorId: tenant.creatorId },
    select: {
      id: true,
      versions: {
        orderBy: { versionSeq: "desc" },
        take: 1,
        select: { title: true }
      },
      creativeWorkMember: {
        select: {
          variantRole: true,
          creativeWork: {
            select: {
              id: true,
              title: true,
              isDefaultBundle: true
            }
          }
        }
      }
    }
  });

  if (!post) {
    return { ok: false, code: "NOT_FOUND" };
  }

  const [rollupRows, platformInstances] = await Promise.all([
    loadCreatorRollupRows(
      prisma,
      tenant.creatorId,
      { start: ctx.start, end: ctx.end },
      { postIds: [normalizedPostId] }
    ),
    prisma.platformInstance.findMany({
      where: { creatorId: tenant.creatorId, postId: normalizedPostId },
      orderBy: [{ destination: "asc" }]
    })
  ]);

  const aggregated = mapAggregatedPerformance(rollupRows, ctx.asOf);
  const member = post.creativeWorkMember;

  return {
    ok: true,
    report: {
      post_id: post.id,
      title: post.versions[0]?.title ?? null,
      creative_work: member
        ? {
            creative_work_id: member.creativeWork.id,
            title: member.creativeWork.title,
            variant_role: member.variantRole,
            is_default_bundle: member.creativeWork.isDefaultBundle
          }
        : null,
      as_of: ctx.asOf.toISOString(),
      range: ctx.range,
      time_range: { start: ctx.start.toISOString(), end: ctx.end.toISOString() },
      totals: aggregated.totals,
      by_destination: aggregated.by_destination,
      daily_series: aggregated.daily_series,
      total_reach: aggregated.total_reach,
      platform_instances: platformInstances.map(mapPlatformInstanceWire),
      freshness: aggregated.freshness,
      source_summary: aggregated.source_summary
    }
  };
}

export type PerformancePlatformInstanceReport = {
  platform_instance_id: string;
  post_id: string;
  post_title: string | null;
  creative_work: {
    creative_work_id: string;
    title: string;
    variant_role: string;
  } | null;
  destination: string;
  external_url: string | null;
  external_id: string | null;
  attempt_id: string | null;
  link_source: string;
  status: string;
  refresh_policy: string;
  linked_at: string;
  last_refreshed_at: string | null;
  as_of: string;
  range: UnifiedPerformanceRange;
  time_range: { start: string; end: string };
  totals: UnifiedPerformanceMetricTotals;
  by_destination: UnifiedPerformanceDestinationTotals[];
  daily_series: ReturnType<typeof aggregateRollupRows>["daily_series"];
  total_reach: number;
  freshness: PerformanceFreshnessWire;
  source_summary: PerformanceSourceSummaryWire[];
};

export async function getPerformancePlatformInstance(
  prisma: PrismaClient,
  relayCreatorId: string,
  platformInstanceId: string,
  options?: { range?: UnifiedPerformanceRange; asOf?: Date }
): Promise<
  { ok: true; report: PerformancePlatformInstanceReport } | { ok: false; code: PerformanceReadErrorCode }
> {
  const tenant = await ensureTenant(prisma, relayCreatorId);
  if (!tenant.ok) return tenant;

  const ctx = buildReadContext(tenant.creatorId, options);
  const instance = await prisma.platformInstance.findFirst({
    where: { id: platformInstanceId.trim(), creatorId: tenant.creatorId },
    select: {
      id: true,
      postId: true,
      destination: true,
      externalUrl: true,
      externalId: true,
      attemptId: true,
      linkSource: true,
      status: true,
      refreshPolicy: true,
      linkedAt: true,
      lastRefreshedAt: true,
      post: {
        select: {
          versions: {
            orderBy: { versionSeq: "desc" },
            take: 1,
            select: { title: true }
          },
          creativeWorkMember: {
            select: {
              variantRole: true,
              creativeWork: {
                select: {
                  id: true,
                  title: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!instance) {
    return { ok: false, code: "NOT_FOUND" };
  }

  const rollupRows = await loadCreatorRollupRows(
    prisma,
    tenant.creatorId,
    { start: ctx.start, end: ctx.end },
    { postIds: [instance.postId], destination: instance.destination }
  );

  const aggregated = mapAggregatedPerformance(rollupRows, ctx.asOf);
  const member = instance.post.creativeWorkMember;
  const freshnessAnchor =
    instance.lastRefreshedAt ??
    (aggregated.freshness.rollup_computed_at
      ? new Date(aggregated.freshness.rollup_computed_at)
      : null);
  const instanceFreshness = buildFreshness(freshnessAnchor, ctx.asOf);

  return {
    ok: true,
    report: {
      platform_instance_id: instance.id,
      post_id: instance.postId,
      post_title: instance.post.versions[0]?.title ?? null,
      creative_work: member
        ? {
            creative_work_id: member.creativeWork.id,
            title: member.creativeWork.title,
            variant_role: member.variantRole
          }
        : null,
      destination: instance.destination,
      external_url: instance.externalUrl,
      external_id: instance.externalId,
      attempt_id: instance.attemptId,
      link_source: instance.linkSource,
      status: instance.status,
      refresh_policy: instance.refreshPolicy,
      linked_at: instance.linkedAt.toISOString(),
      last_refreshed_at: instance.lastRefreshedAt?.toISOString() ?? null,
      as_of: ctx.asOf.toISOString(),
      range: ctx.range,
      time_range: { start: ctx.start.toISOString(), end: ctx.end.toISOString() },
      totals: aggregated.totals,
      by_destination: aggregated.by_destination,
      daily_series: aggregated.daily_series,
      total_reach: aggregated.total_reach,
      freshness: instanceFreshness,
      source_summary: aggregated.source_summary
    }
  };
}

export { parseUnifiedPerformanceRange, type UnifiedPerformanceRange };
