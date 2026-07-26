/**
 * Performance intelligence Phase 8 — metric-grounded insight action cards.
 * @see docs/analytics/INSIGHT_ACTIONS_GOALS.md
 */

import type { PrismaClient } from "@prisma/client";
import {
  listCreativeWorkBundleSuggestions,
  type BundleSuggestionsReport
} from "./creative-work-bundling-service.js";
import {
  getPerformanceCampaignRollups,
  getPerformanceOverview,
  listPerformanceWorks,
  type PerformanceCampaignRollupReport,
  type PerformanceOverviewReport,
  type PerformanceWorksListReport,
  type UnifiedPerformanceRange
} from "./performance-intelligence-read.js";

export type PerformanceInsightActionTone = "active" | "watching" | "guidance";
export type PerformanceInsightConfidence = "high" | "medium" | "low";

export type PerformanceInsightActionWire = {
  id: string;
  title: string;
  trigger: string;
  body: string;
  action_label: string | null;
  href: string | null;
  tone: PerformanceInsightActionTone;
  confidence: PerformanceInsightConfidence;
};

export type PerformanceInsightActionsReport = {
  creator_id: string;
  as_of: string;
  range: UnifiedPerformanceRange;
  actions: PerformanceInsightActionWire[];
};

function reachFromTotals(totals: {
  impressions: number;
  seen: number;
  views: number;
}): number {
  return totals.impressions + totals.seen + totals.views;
}

function formatDestinationLabel(destination: string): string {
  if (destination === "patreon") return "Patreon";
  if (destination === "x") return "X";
  if (destination === "deviantart") return "DeviantArt";
  if (destination === "relay") return "Relay";
  return destination;
}

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString();
}

export function derivePerformanceInsightActions(input: {
  overview: PerformanceOverviewReport;
  works: PerformanceWorksListReport;
  campaigns: PerformanceCampaignRollupReport;
  bundleSuggestions: BundleSuggestionsReport;
}): PerformanceInsightActionWire[] {
  const actions: PerformanceInsightActionWire[] = [];
  const { overview, works, campaigns, bundleSuggestions } = input;
  const topWork = works.works[0] ?? null;
  const secondWork = works.works[1] ?? null;
  const topPost = overview.performance.top_posts[0] ?? null;

  if (overview.posting_goal.goal.enabled && overview.posting_goal.pace_status === "behind") {
    actions.push({
      id: "perf-posting-goal-behind",
      title: "Posting goal behind pace",
      trigger: `${overview.posting_goal.posts_this_month}/${overview.posting_goal.goal.monthly_post_target} Relay posts this month.`,
      body: "You are behind your monthly posting goal. Ship a supporter-facing post from stored media to get back on pace.",
      action_label: "Create post from media storage",
      href: "/studio/new-post",
      tone: "active",
      confidence: "high"
    });
  }

  if (overview.freshness.stale) {
    actions.push({
      id: "perf-refresh-stale-rollups",
      title: "Refresh stale performance data",
      trigger: "Rollups are older than the freshness threshold.",
      body: "Linked platform stats may be outdated. Refresh instances or wait for the daily rollup before making big moves.",
      action_label: "Open analytics hierarchy",
      href: "/studio/analytics",
      tone: "guidance",
      confidence: "high"
    });
  }

  if (
    topWork &&
    secondWork &&
    topWork.total_reach > 0 &&
    topWork.total_reach >= secondWork.total_reach * 1.4
  ) {
    actions.push({
      id: "perf-double-down-work",
      title: "Double down on top work",
      trigger: `${topWork.title} leads with ${formatNumber(topWork.total_reach)} reach.`,
      body: "Make a follow-up variant or repost in the same format while this work is clearly resonating.",
      action_label: "Open work drilldown",
      href: `/studio/analytics/works/${encodeURIComponent(topWork.creative_work_id)}`,
      tone: "active",
      confidence: "high"
    });
  }

  if (topPost && topPost.total_reach > 0) {
    const engagement =
      topPost.destinations.reduce((sum, entry) => sum + entry.likes + entry.comments, 0) ?? 0;
    const reach = topPost.total_reach;
    if (reach >= 500 && engagement / Math.max(reach, 1) < 0.04) {
      actions.push({
        id: "perf-improve-offer",
        title: "Improve supporter offer",
        trigger: `${topPost.title ?? topPost.post_id} has reach without strong conversion signals.`,
        body: "Attention is landing but engagement is thin — tighten the CTA, promo link, or Patreon discount around this post.",
        action_label: "Open post preview",
        href: `/studio/preview?post_id=${encodeURIComponent(topPost.post_id)}`,
        tone: "active",
        confidence: "medium"
      });
    } else {
      actions.push({
        id: "perf-make-another-like-this",
        title: "Make another post like this",
        trigger: `${topPost.title ?? topPost.post_id} is your top reach post in this window.`,
        body: "Repeat the subject, format, or presentation style that is already pulling attention.",
        action_label: "Create similar post",
        href: "/studio/new-post",
        tone: "active",
        confidence: topPost.total_reach >= 1000 ? "high" : "medium"
      });
    }
  }

  if (topWork && topWork.total_reach >= 800) {
    actions.push({
      id: "perf-turn-into-promo",
      title: "Turn traction into a promo moment",
      trigger: `${topWork.title} is pulling concentrated attention.`,
      body: "Package visible demand into a promo post, featured drop, or campaign push while metrics are warm.",
      action_label: "Open Action Center",
      href: "/studio/actions",
      tone: "active",
      confidence: "medium"
    });
  }

  const activeDestinations = overview.performance.by_destination.filter(
    (entry) => reachFromTotals(entry) > 0
  );
  if (activeDestinations.length === 1 && overview.performance.totals) {
    actions.push({
      id: "perf-test-platform",
      title: "Test another platform",
      trigger: `Reach is concentrated on ${formatDestinationLabel(activeDestinations[0]!.destination)}.`,
      body: "Cross-post a variant to compare how the same work performs on another destination.",
      action_label: "Create cross-platform post",
      href: "/studio/new-post",
      tone: "guidance",
      confidence: "medium"
    });
  }

  const topSuggestion = bundleSuggestions.suggestions[0];
  if (topSuggestion && topSuggestion.confidence !== "low") {
    actions.push({
      id: `perf-bundle-merge-${topSuggestion.suggestion_id}`,
      title: "Confirm suggested bundling",
      trigger: `Relay found a likely match for ${topSuggestion.source_title ?? topSuggestion.source_post_id}.`,
      body: "Merge related variants into one work bundle so performance rolls up across platforms without losing post-level metrics.",
      action_label: "Review in analytics",
      href: "/studio/analytics",
      tone: "guidance",
      confidence: topSuggestion.confidence
    });
  }

  const topCampaign = campaigns.groups[0];
  if (topCampaign && topCampaign.total_reach > 0) {
    actions.push({
      id: "perf-set-campaign-goal",
      title: "Set a campaign reach goal",
      trigger: `${topCampaign.campaign_label_display} reached ${formatNumber(topCampaign.total_reach)} in this window.`,
      body: "Turn campaign momentum into a measurable target on the Actions tab so Relay can track pace.",
      action_label: "View targeted goals",
      href: "/studio/analytics",
      tone: "watching",
      confidence: "low"
    });
  }

  return actions.slice(0, 8);
}

export async function getPerformanceInsightActions(
  prisma: PrismaClient,
  relayCreatorId: string,
  options?: { range?: UnifiedPerformanceRange }
): Promise<
  { ok: true; report: PerformanceInsightActionsReport } | { ok: false; code: "NO_TENANT" }
> {
  const creatorId = relayCreatorId.trim();
  const tenant = await prisma.tenant.findUnique({
    where: { relayCreatorId: creatorId },
    select: { id: true }
  });
  if (!tenant) {
    return { ok: false, code: "NO_TENANT" };
  }

  const range = options?.range ?? "30d";
  const [overviewOut, worksOut, campaignsOut, bundleOut] = await Promise.all([
    getPerformanceOverview(prisma, creatorId, { range }),
    listPerformanceWorks(prisma, creatorId, { range, limit: 8 }),
    getPerformanceCampaignRollups(prisma, creatorId, { range }),
    listCreativeWorkBundleSuggestions(prisma, creatorId, { limit: 3 })
  ]);

  if (!overviewOut.ok || !worksOut.ok || !campaignsOut.ok || !bundleOut.ok) {
    return { ok: false, code: "NO_TENANT" };
  }

  return {
    ok: true,
    report: {
      creator_id: creatorId,
      as_of: overviewOut.report.as_of,
      range,
      actions: derivePerformanceInsightActions({
        overview: overviewOut.report,
        works: worksOut.report,
        campaigns: campaignsOut.report,
        bundleSuggestions: bundleOut.report
      })
    }
  };
}
