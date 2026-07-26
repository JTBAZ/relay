/**
 * Performance intelligence Phase 8 — targeted goals tied to work, campaign, platform, or creator scope.
 * @see docs/analytics/INSIGHT_ACTIONS_GOALS.md
 */

import type { PerformanceGoalMetric, PerformanceGoalScope, PrismaClient } from "@prisma/client";
import {
  getPerformanceCampaignRollups,
  getPerformanceOverview,
  listPerformanceWorks,
  type PerformanceCampaignRollupReport,
  type PerformanceOverviewReport,
  type PerformanceWorksListReport,
  type UnifiedPerformanceRange
} from "./performance-intelligence-read.js";

export type PerformanceGoalErrorCode = "NO_TENANT" | "NOT_FOUND" | "INVALID_INPUT";

export type PerformanceGoalScopeWire = "creator" | "work" | "campaign" | "platform";
export type PerformanceGoalMetricWire = "reach" | "likes" | "comments";
export type PerformanceGoalPaceStatus = "on_track" | "behind" | "complete";

export type PerformanceGoalWire = {
  id: string;
  scope: PerformanceGoalScopeWire;
  scope_ref: string | null;
  scope_label: string;
  metric: PerformanceGoalMetricWire;
  target_value: number;
  range: UnifiedPerformanceRange;
  label: string | null;
  enabled: boolean;
  current_value: number;
  progress_ratio: number;
  pace_status: PerformanceGoalPaceStatus;
  created_at: string;
  updated_at: string;
};

export type PerformanceGoalSuggestionWire = {
  suggestion_id: string;
  scope: PerformanceGoalScopeWire;
  scope_ref: string | null;
  scope_label: string;
  metric: PerformanceGoalMetricWire;
  target_value: number;
  range: UnifiedPerformanceRange;
  label: string;
  current_value: number;
  reason: string;
};

export type PerformanceGoalsReport = {
  creator_id: string;
  as_of: string;
  range: UnifiedPerformanceRange;
  goals: PerformanceGoalWire[];
  suggested_goals: PerformanceGoalSuggestionWire[];
};

export type CreatePerformanceGoalInput = {
  scope: PerformanceGoalScopeWire;
  scopeRef?: string | null;
  metric: PerformanceGoalMetricWire;
  targetValue: number;
  range?: UnifiedPerformanceRange;
  label?: string | null;
};

type GoalContext = {
  overview: PerformanceOverviewReport;
  works: PerformanceWorksListReport;
  campaigns: PerformanceCampaignRollupReport;
};

function parseUnifiedRange(raw: string | undefined): UnifiedPerformanceRange {
  if (raw === "7d" || raw === "90d") return raw;
  return "30d";
}

function reachFromTotals(totals: {
  impressions: number;
  seen: number;
  views: number;
}): number {
  return totals.impressions + totals.seen + totals.views;
}

function scopeToWire(scope: PerformanceGoalScope): PerformanceGoalScopeWire {
  return scope;
}

function metricToWire(metric: PerformanceGoalMetric): PerformanceGoalMetricWire {
  return metric;
}

function paceStatus(current: number, target: number): PerformanceGoalPaceStatus {
  if (target <= 0) return "on_track";
  if (current >= target) return "complete";
  if (current >= target * 0.6) return "on_track";
  return "behind";
}

function resolveScopeLabel(
  scope: PerformanceGoalScopeWire,
  scopeRef: string | null,
  ctx: GoalContext
): string {
  if (scope === "creator") return "Creator-wide";
  if (scope === "platform") return scopeRef ?? "Platform";
  if (scope === "campaign") {
    const group = ctx.campaigns.groups.find(
      (entry) => (entry.campaign_label ?? "") === (scopeRef ?? "")
    );
    return group?.campaign_label_display ?? scopeRef ?? "Campaign";
  }
  const work = ctx.works.works.find((entry) => entry.creative_work_id === scopeRef);
  return work?.title ?? scopeRef ?? "Work";
}

function resolveCurrentValue(
  scope: PerformanceGoalScopeWire,
  scopeRef: string | null,
  metric: PerformanceGoalMetricWire,
  ctx: GoalContext
): number {
  if (metric === "reach") {
    if (scope === "creator") {
      return reachFromTotals(ctx.overview.performance.totals);
    }
    if (scope === "platform") {
      const entry = ctx.overview.performance.by_destination.find(
        (row) => row.destination === scopeRef
      );
      return entry ? reachFromTotals(entry) : 0;
    }
    if (scope === "campaign") {
      const group = ctx.campaigns.groups.find(
        (entry) => (entry.campaign_label ?? "") === (scopeRef ?? "")
      );
      return group?.total_reach ?? 0;
    }
    const work = ctx.works.works.find((entry) => entry.creative_work_id === scopeRef);
    return work?.total_reach ?? 0;
  }

  if (metric === "likes") {
    if (scope === "creator") return ctx.overview.performance.totals.likes;
    if (scope === "platform") {
      return (
        ctx.overview.performance.by_destination.find((row) => row.destination === scopeRef)?.likes ??
        0
      );
    }
    if (scope === "campaign") {
      return (
        ctx.campaigns.groups.find((entry) => (entry.campaign_label ?? "") === (scopeRef ?? ""))
          ?.totals.likes ?? 0
      );
    }
    return ctx.works.works.find((entry) => entry.creative_work_id === scopeRef)?.totals.likes ?? 0;
  }

  if (scope === "creator") return ctx.overview.performance.totals.comments;
  if (scope === "platform") {
    return (
      ctx.overview.performance.by_destination.find((row) => row.destination === scopeRef)?.comments ??
      0
    );
  }
  if (scope === "campaign") {
    return (
      ctx.campaigns.groups.find((entry) => (entry.campaign_label ?? "") === (scopeRef ?? ""))
        ?.totals.comments ?? 0
    );
  }
  return ctx.works.works.find((entry) => entry.creative_work_id === scopeRef)?.totals.comments ?? 0;
}

function mapGoalRow(
  row: {
    id: string;
    scope: PerformanceGoalScope;
    scopeRef: string | null;
    metric: PerformanceGoalMetric;
    targetValue: number;
    range: string;
    label: string | null;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
  },
  ctx: GoalContext
): PerformanceGoalWire {
  const scope = scopeToWire(row.scope);
  const metric = metricToWire(row.metric);
  const range = parseUnifiedRange(row.range);
  const currentValue = resolveCurrentValue(scope, row.scopeRef, metric, ctx);
  const progressRatio = row.targetValue > 0 ? currentValue / row.targetValue : 0;

  return {
    id: row.id,
    scope,
    scope_ref: row.scopeRef,
    scope_label: resolveScopeLabel(scope, row.scopeRef, ctx),
    metric,
    target_value: row.targetValue,
    range,
    label: row.label,
    enabled: row.enabled,
    current_value: currentValue,
    progress_ratio: progressRatio,
    pace_status: paceStatus(currentValue, row.targetValue),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString()
  };
}

function buildSuggestedGoals(ctx: GoalContext, range: UnifiedPerformanceRange): PerformanceGoalSuggestionWire[] {
  const suggestions: PerformanceGoalSuggestionWire[] = [];
  const topWork = ctx.works.works[0];
  if (topWork && topWork.total_reach > 0) {
    suggestions.push({
      suggestion_id: `suggest-work-reach-${topWork.creative_work_id}`,
      scope: "work",
      scope_ref: topWork.creative_work_id,
      scope_label: topWork.title,
      metric: "reach",
      target_value: Math.max(topWork.total_reach + 500, Math.ceil(topWork.total_reach * 1.25)),
      range,
      label: `${topWork.title} reach`,
      current_value: topWork.total_reach,
      reason: "Stretch reach on your top-performing work this window."
    });
  }

  const topCampaign = ctx.campaigns.groups[0];
  if (topCampaign && topCampaign.total_reach > 0) {
    suggestions.push({
      suggestion_id: `suggest-campaign-reach-${topCampaign.campaign_label ?? "uncategorized"}`,
      scope: "campaign",
      scope_ref: topCampaign.campaign_label,
      scope_label: topCampaign.campaign_label_display,
      metric: "reach",
      target_value: Math.max(topCampaign.total_reach + 300, Math.ceil(topCampaign.total_reach * 1.2)),
      range,
      label: `${topCampaign.campaign_label_display} reach`,
      current_value: topCampaign.total_reach,
      reason: "Set a campaign-level reach target for your strongest label group."
    });
  }

  const activeDestinations = ctx.overview.performance.by_destination.filter(
    (entry) => reachFromTotals(entry) > 0
  );
  if (activeDestinations.length === 1) {
    const destination = activeDestinations[0]!.destination;
    const current = reachFromTotals(activeDestinations[0]!);
    suggestions.push({
      suggestion_id: `suggest-platform-reach-${destination}`,
      scope: "platform",
      scope_ref: destination,
      scope_label: destination,
      metric: "reach",
      target_value: Math.max(current + 250, Math.ceil(current * 1.15)),
      range,
      label: `${destination} reach`,
      current_value: current,
      reason: "Reach is concentrated on one platform — set a platform goal before expanding."
    });
  }

  return suggestions.slice(0, 3);
}

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

async function loadGoalContext(
  prisma: PrismaClient,
  creatorId: string,
  range: UnifiedPerformanceRange
): Promise<
  { ok: true; ctx: GoalContext; asOf: string } | { ok: false; code: PerformanceGoalErrorCode }
> {
  const [overviewOut, worksOut, campaignsOut] = await Promise.all([
    getPerformanceOverview(prisma, creatorId, { range }),
    listPerformanceWorks(prisma, creatorId, { range, limit: 20 }),
    getPerformanceCampaignRollups(prisma, creatorId, { range })
  ]);

  if (!overviewOut.ok || !worksOut.ok || !campaignsOut.ok) {
    return { ok: false, code: "NO_TENANT" };
  }

  return {
    ok: true,
    asOf: overviewOut.report.as_of,
    ctx: {
      overview: overviewOut.report,
      works: worksOut.report,
      campaigns: campaignsOut.report
    }
  };
}

export async function listCreatorPerformanceGoals(
  prisma: PrismaClient,
  relayCreatorId: string,
  options?: { range?: UnifiedPerformanceRange }
): Promise<
  { ok: true; report: PerformanceGoalsReport } | { ok: false; code: PerformanceGoalErrorCode }
> {
  const tenant = await ensureTenant(prisma, relayCreatorId);
  if (!tenant.ok) return tenant;

  const range = options?.range ?? "30d";
  const loaded = await loadGoalContext(prisma, tenant.creatorId, range);
  if (!loaded.ok) return loaded;

  const rows = await prisma.creatorPerformanceGoal.findMany({
    where: { creatorId: tenant.creatorId, enabled: true },
    orderBy: [{ updatedAt: "desc" }]
  });

  return {
    ok: true,
    report: {
      creator_id: tenant.creatorId,
      as_of: loaded.asOf,
      range,
      goals: rows.map((row) => mapGoalRow(row, loaded.ctx)),
      suggested_goals: buildSuggestedGoals(loaded.ctx, range)
    }
  };
}

function validateCreateInput(input: CreatePerformanceGoalInput): string | null {
  if (!["creator", "work", "campaign", "platform"].includes(input.scope)) {
    return "scope must be creator, work, campaign, or platform.";
  }
  if (!["reach", "likes", "comments"].includes(input.metric)) {
    return "metric must be reach, likes, or comments.";
  }
  if (!Number.isFinite(input.targetValue) || input.targetValue <= 0) {
    return "target_value must be a positive number.";
  }
  if (input.scope !== "creator" && !input.scopeRef?.trim()) {
    return "scope_ref is required for work, campaign, and platform goals.";
  }
  return null;
}

export async function createCreatorPerformanceGoal(
  prisma: PrismaClient,
  relayCreatorId: string,
  input: CreatePerformanceGoalInput
): Promise<
  { ok: true; goal: PerformanceGoalWire } | { ok: false; code: PerformanceGoalErrorCode; message?: string }
> {
  const tenant = await ensureTenant(prisma, relayCreatorId);
  if (!tenant.ok) return tenant;

  const validation = validateCreateInput(input);
  if (validation) {
    return { ok: false, code: "INVALID_INPUT", message: validation };
  }

  const range = input.range ?? "30d";
  const scopeRef = input.scope === "creator" ? null : input.scopeRef?.trim() ?? null;

  if (input.scope === "work" && scopeRef) {
    const work = await prisma.creativeWork.findFirst({
      where: { id: scopeRef, creatorId: tenant.creatorId },
      select: { id: true }
    });
    if (!work) {
      return { ok: false, code: "NOT_FOUND", message: "Work not found." };
    }
  }

  const row = await prisma.creatorPerformanceGoal.create({
    data: {
      creatorId: tenant.creatorId,
      scope: input.scope,
      scopeRef,
      metric: input.metric,
      targetValue: Math.floor(input.targetValue),
      range,
      label: input.label?.trim() || null
    }
  });

  const loaded = await loadGoalContext(prisma, tenant.creatorId, range);
  if (!loaded.ok) {
    return { ok: false, code: "NO_TENANT" };
  }

  return { ok: true, goal: mapGoalRow(row, loaded.ctx) };
}

export async function deleteCreatorPerformanceGoal(
  prisma: PrismaClient,
  relayCreatorId: string,
  goalId: string
): Promise<{ ok: true } | { ok: false; code: PerformanceGoalErrorCode }> {
  const tenant = await ensureTenant(prisma, relayCreatorId);
  if (!tenant.ok) return tenant;

  const existing = await prisma.creatorPerformanceGoal.findFirst({
    where: { id: goalId.trim(), creatorId: tenant.creatorId },
    select: { id: true }
  });
  if (!existing) {
    return { ok: false, code: "NOT_FOUND" };
  }

  await prisma.creatorPerformanceGoal.update({
    where: { id: existing.id },
    data: { enabled: false }
  });

  return { ok: true };
}
