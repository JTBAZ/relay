"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  ExternalLink,
  Layers,
  RefreshCw,
  Tag,
  Target
} from "lucide-react";
import {
  fetchPerformanceWorkBundle,
  type BundleSuggestionsData,
  type CreatorUnifiedPerformanceMetricTotals,
  type CreatorUnifiedPerformanceRange,
  type PerformanceCampaignGroupWire,
  type PerformanceCampaignRollupsData,
  type PerformanceOverviewData,
  type PerformanceTagGroupWire,
  type PerformanceTagRollupsData,
  type PerformanceWorkBundleData,
  type PerformanceWorkSummaryWire,
  type PerformanceWorksListData
} from "@/lib/relay-api";

type TimeScale = CreatorUnifiedPerformanceRange;

export type PerformanceHierarchyPanelProps = {
  performanceRange: TimeScale;
  overview: PerformanceOverviewData | null;
  campaigns: PerformanceCampaignRollupsData | null;
  tags: PerformanceTagRollupsData | null;
  works: PerformanceWorksListData | null;
  bundleSuggestions: BundleSuggestionsData | null;
  hierarchyDestination: string | null;
  onHierarchyDestinationChange: (destination: string | null) => void;
};

function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "--";
  return Math.round(value).toLocaleString();
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

function formatConfidence(confidence: string): string {
  if (confidence === "high") return "High confidence";
  if (confidence === "medium") return "Medium confidence";
  if (confidence === "low") return "Low confidence";
  return "Unknown confidence";
}

function reachFromTotals(totals: CreatorUnifiedPerformanceMetricTotals): number {
  return totals.impressions + totals.seen + totals.views;
}

function reachForDestination(
  byDestination: Array<CreatorUnifiedPerformanceMetricTotals & { destination: string }>,
  destination: string | null
): number {
  if (!destination) {
    return byDestination.reduce((sum, entry) => sum + reachFromTotals(entry), 0);
  }
  const entry = byDestination.find((row) => row.destination === destination);
  return entry ? reachFromTotals(entry) : 0;
}

function paceStatusLabel(status: string): string {
  if (status === "on_track") return "On track";
  if (status === "behind") return "Behind pace";
  if (status === "complete") return "Goal met";
  if (status === "bonus_available") return "Bonus available";
  return status;
}

function WorkVariantsPanel({
  creativeWorkId,
  performanceRange,
  destination
}: {
  creativeWorkId: string;
  performanceRange: TimeScale;
  destination: string | null;
}) {
  const [bundle, setBundle] = useState<PerformanceWorkBundleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setBundle(null);
    void fetchPerformanceWorkBundle(creativeWorkId, { range: performanceRange })
      .then((report) => {
        if (!cancelled) setBundle(report);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [creativeWorkId, performanceRange]);

  if (loading) {
    return <p className="px-3 py-2 text-[11px] text-[#888]">Loading variants…</p>;
  }
  if (error) {
    return <p className="px-3 py-2 text-[11px] text-[#d4a0a0]">{error}</p>;
  }
  if (!bundle?.variants.length) {
    return <p className="px-3 py-2 text-[11px] text-[#888]">No variants linked yet.</p>;
  }

  return (
    <div className="space-y-2 border-t border-[#222] px-3 py-3" data-testid="analytics-hierarchy-variants">
      {bundle.variants.map((variant) => {
        const variantReach = destination
          ? reachForDestination(variant.by_destination, destination)
          : variant.total_reach;
        return (
          <div
            key={variant.post_id}
            className="rounded-xl border border-[#2a2a2a] bg-[#0A0A0A] px-3 py-2"
            data-testid={`analytics-hierarchy-variant-${variant.post_id}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-[#E8E8E8]">
                  {variant.title?.trim() || variant.post_id}
                </p>
                <p className="text-[10px] uppercase tracking-[0.14em] text-[#666]">
                  {variant.variant_role.replace(/_/g, " ")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-[#9bf0c4]">
                  {formatNumber(variantReach)} reach
                </span>
                <Link
                  href={`/studio/preview?post_id=${encodeURIComponent(variant.post_id)}`}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#9bf0c4] hover:underline"
                >
                  Preview
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </Link>
              </div>
            </div>
            {variant.platform_instances.length ? (
              <div className="mt-2 space-y-1">
                {variant.platform_instances.map((instance) => (
                  <div
                    key={instance.platform_instance_id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#1f1f1f] bg-[#050706] px-2 py-1.5 text-[10px] text-[#888]"
                    data-testid={`analytics-hierarchy-instance-${instance.platform_instance_id}`}
                  >
                    <span className="text-[#bbb]">
                      {formatDestinationLabel(instance.destination)} · {instance.link_source}
                    </span>
                    <span className="text-[#666]">{instance.status}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function PerformanceHierarchyPanel({
  performanceRange,
  overview,
  campaigns,
  tags,
  works,
  bundleSuggestions,
  hierarchyDestination,
  onHierarchyDestinationChange
}: PerformanceHierarchyPanelProps) {
  const [expandedWorkId, setExpandedWorkId] = useState<string | null>(null);

  useEffect(() => {
    setExpandedWorkId(null);
  }, [performanceRange, hierarchyDestination]);

  const platformOptions = useMemo(() => {
    const destinations = new Set<string>();
    for (const entry of overview?.source_summary ?? []) {
      destinations.add(entry.destination);
    }
    for (const entry of overview?.performance.by_destination ?? []) {
      destinations.add(entry.destination);
    }
    return [...destinations].sort();
  }, [overview]);

  const filteredWorks = useMemo(() => {
    const rows = works?.works ?? [];
    if (!hierarchyDestination) return rows;
    return [...rows]
      .map((work) => ({
        ...work,
        scoped_reach: reachForDestination(work.by_destination, hierarchyDestination)
      }))
      .filter((work) => work.scoped_reach > 0)
      .sort((a, b) => b.scoped_reach - a.scoped_reach);
  }, [works, hierarchyDestination]);

  const filteredCampaigns = useMemo(() => {
    const groups = campaigns?.groups ?? [];
    if (!hierarchyDestination) return groups;
    return [...groups]
      .map((group) => ({
        ...group,
        scoped_reach: reachForDestination(group.by_destination, hierarchyDestination)
      }))
      .filter((group) => group.scoped_reach > 0)
      .sort((a, b) => b.scoped_reach - a.scoped_reach);
  }, [campaigns, hierarchyDestination]);

  const filteredTags = useMemo(() => {
    const groups = tags?.groups ?? [];
    if (!hierarchyDestination) return groups.slice(0, 6);
    return [...groups]
      .map((group) => ({
        ...group,
        scoped_reach: reachForDestination(group.by_destination, hierarchyDestination)
      }))
      .filter((group) => group.scoped_reach > 0)
      .sort((a, b) => b.scoped_reach - a.scoped_reach)
      .slice(0, 6);
  }, [tags, hierarchyDestination]);

  const toggleWork = useCallback((creativeWorkId: string) => {
    setExpandedWorkId((current) => (current === creativeWorkId ? null : creativeWorkId));
  }, []);

  const creatorReach = hierarchyDestination
    ? reachForDestination(overview?.performance.by_destination ?? [], hierarchyDestination)
    : reachFromTotals(overview?.performance.totals ?? { impressions: 0, seen: 0, likes: 0, comments: 0, views: 0 });

  const breadcrumb = hierarchyDestination
    ? `Creator · ${formatDestinationLabel(hierarchyDestination)}`
    : "Creator-wide";

  const stale = overview?.freshness.stale ?? false;
  const postingGoal = overview?.posting_goal;

  return (
    <section
      className="rounded-2xl border border-[#1F1F1F] bg-[#101010] p-4"
      aria-labelledby="analytics-hierarchy-heading"
      data-testid="analytics-performance-hierarchy"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#666]">
            <Layers className="h-3.5 w-3.5" aria-hidden />
            Performance intelligence
          </div>
          <h2
            id="analytics-hierarchy-heading"
            className="text-xs font-semibold uppercase tracking-[0.18em] text-[#888]"
          >
            Hierarchy · {timeScaleLabel(performanceRange)}
          </h2>
          <p className="mt-1 text-[11px] text-[#666]" data-testid="analytics-hierarchy-breadcrumb">
            {breadcrumb}
          </p>
        </div>
        {stale ? (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-[#6a5a2a]/70 bg-[#1a1808] px-2.5 py-1 text-[10px] font-medium text-[#e8d9a8]"
            data-testid="analytics-hierarchy-stale-badge"
          >
            <RefreshCw className="h-3 w-3" aria-hidden />
            Rollups stale
          </span>
        ) : null}
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-[#2a7a4a]/45 bg-[#0A0A0A] px-3 py-2.5 text-center">
          <p className="text-[10px] uppercase tracking-[0.14em] text-[#666]">Works</p>
          <p className="font-mono text-xl font-bold text-[#F5F5F5]">
            {formatNumber(overview?.hierarchy.creative_work_count)}
          </p>
        </div>
        <div className="rounded-xl border border-[#2a7a4a]/45 bg-[#0A0A0A] px-3 py-2.5 text-center">
          <p className="text-[10px] uppercase tracking-[0.14em] text-[#666]">Posts</p>
          <p className="font-mono text-xl font-bold text-[#F5F5F5]">
            {formatNumber(overview?.hierarchy.post_count)}
          </p>
        </div>
        <div className="rounded-xl border border-[#2a7a4a]/45 bg-[#0A0A0A] px-3 py-2.5 text-center">
          <p className="text-[10px] uppercase tracking-[0.14em] text-[#666]">Instances</p>
          <p className="font-mono text-xl font-bold text-[#F5F5F5]">
            {formatNumber(overview?.hierarchy.platform_instance_count)}
          </p>
        </div>
        <div className="rounded-xl border border-[#2a7a4a]/45 bg-[#0A0A0A] px-3 py-2.5 text-center">
          <p className="text-[10px] uppercase tracking-[0.14em] text-[#666]">Reach</p>
          <p className="font-mono text-xl font-bold text-[#9bf0c4]">{formatNumber(creatorReach)}</p>
        </div>
      </div>

      {postingGoal?.goal.enabled ? (
        <div
          className="mb-4 rounded-xl border border-[#2a2a2a] bg-[#0A0A0A] px-3 py-2.5"
          data-testid="analytics-hierarchy-posting-goal"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] text-[#bbb]">
              <Target className="h-3.5 w-3.5 text-[#9bf0c4]" aria-hidden />
              <span>
                {postingGoal.posts_this_month}/{postingGoal.goal.monthly_post_target} posts this month
              </span>
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9bf0c4]">
              {paceStatusLabel(postingGoal.pace_status)}
            </span>
          </div>
        </div>
      ) : null}

      {overview?.source_summary.length ? (
        <div className="mb-4 flex flex-wrap gap-2" data-testid="analytics-hierarchy-source-summary">
          {overview.source_summary.map((entry) => (
            <span
              key={entry.destination}
              className="inline-flex items-center gap-1 rounded-full border border-[#2a2a2a] bg-[#0A0A0A] px-2.5 py-1 text-[10px] text-[#aaa]"
            >
              {formatDestinationLabel(entry.destination)} · {entry.source} ·{" "}
              {formatConfidence(entry.confidence)}
            </span>
          ))}
        </div>
      ) : null}

      {platformOptions.length ? (
        <div className="mb-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#777]">
            Platform scope
          </p>
          <div className="flex flex-wrap gap-2" data-testid="analytics-hierarchy-platform-filters">
            <button
              type="button"
              onClick={() => onHierarchyDestinationChange(null)}
              className={
                hierarchyDestination === null
                  ? "rounded-full border border-[#9bf0c4]/60 bg-[#0f1a14] px-3 py-1 text-[11px] font-semibold text-[#9bf0c4]"
                  : "rounded-full border border-[#2a2a2a] bg-[#0A0A0A] px-3 py-1 text-[11px] text-[#aaa] hover:border-[#444]"
              }
            >
              All platforms
            </button>
            {platformOptions.map((destination) => (
              <button
                key={destination}
                type="button"
                onClick={() => onHierarchyDestinationChange(destination)}
                className={
                  hierarchyDestination === destination
                    ? "rounded-full border border-[#9bf0c4]/60 bg-[#0f1a14] px-3 py-1 text-[11px] font-semibold text-[#9bf0c4]"
                    : "rounded-full border border-[#2a2a2a] bg-[#0A0A0A] px-3 py-1 text-[11px] text-[#aaa] hover:border-[#444]"
                }
              >
                {formatDestinationLabel(destination)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#777]">
            Campaign labels
          </p>
          <div className="space-y-2" data-testid="analytics-hierarchy-campaigns">
            {filteredCampaigns.length ? (
              filteredCampaigns.slice(0, 5).map((group) => (
                <div
                  key={group.campaign_label_display}
                  className="rounded-xl border border-[#2a2a2a] bg-[#0A0A0A] px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium text-[#E8E8E8]">
                      {group.campaign_label_display}
                    </span>
                    <span className="font-mono text-[11px] text-[#9bf0c4]">
                      {formatNumber(
                        hierarchyDestination
                          ? (group as PerformanceCampaignGroupWire & { scoped_reach?: number })
                              .scoped_reach ?? 0
                          : group.total_reach
                      )}{" "}
                      reach
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-[#666]">
                    {group.creative_work_count} works · {group.post_count} posts
                  </p>
                </div>
              ))
            ) : (
              <p className="text-[11px] text-[#666]">No campaign rollups in this window.</p>
            )}
          </div>
        </div>

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#777]">
            <Tag className="h-3 w-3" aria-hidden />
            Tags
          </p>
          <div className="space-y-2" data-testid="analytics-hierarchy-tags">
            {filteredTags.length ? (
              filteredTags.map((group) => (
                <div
                  key={group.tag}
                  className="rounded-xl border border-[#2a2a2a] bg-[#0A0A0A] px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium text-[#E8E8E8]">{group.tag}</span>
                    <span className="font-mono text-[11px] text-[#9bf0c4]">
                      {formatNumber(
                        hierarchyDestination
                          ? (group as PerformanceTagGroupWire & { scoped_reach?: number })
                              .scoped_reach ?? 0
                          : group.total_reach
                      )}{" "}
                      reach
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-[#666]">
                    {group.creative_work_count} works · {group.post_count} posts
                  </p>
                </div>
              ))
            ) : (
              <p className="text-[11px] text-[#666]">No tagged works in this window.</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#777]">
          Works & bundles
        </p>
        <div className="space-y-2" data-testid="analytics-hierarchy-works">
          {filteredWorks.length ? (
            filteredWorks.slice(0, 8).map((work) => {
              const workReach = hierarchyDestination
                ? (work as PerformanceWorkSummaryWire & { scoped_reach?: number }).scoped_reach ??
                  reachForDestination(work.by_destination, hierarchyDestination)
                : work.total_reach;
              const expanded = expandedWorkId === work.creative_work_id;
              return (
                <div
                  key={work.creative_work_id}
                  className="overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#0A0A0A]"
                >
                  <button
                    type="button"
                    onClick={() => toggleWork(work.creative_work_id)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-[#111]"
                    aria-expanded={expanded}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-[#E8E8E8]">{work.title}</p>
                      <p className="text-[10px] text-[#666]">
                        {work.member_count} variant{work.member_count === 1 ? "" : "s"}
                        {work.analytics_campaign_label
                          ? ` · ${work.analytics_campaign_label}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-[11px] text-[#9bf0c4]">
                        {formatNumber(workReach)} reach
                      </span>
                      <Link
                        href={`/studio/analytics/works/${encodeURIComponent(work.creative_work_id)}?range=${performanceRange}`}
                        className="text-[10px] font-semibold text-[#9bf0c4] hover:underline"
                        data-testid={`analytics-hierarchy-work-link-${work.creative_work_id}`}
                      >
                        Details
                      </Link>
                      <ChevronRight
                        className={`h-3.5 w-3.5 text-[#666] transition-transform ${expanded ? "rotate-90" : ""}`}
                        aria-hidden
                      />
                    </div>
                  </button>
                  {expanded ? (
                    <WorkVariantsPanel
                      creativeWorkId={work.creative_work_id}
                      performanceRange={performanceRange}
                      destination={hierarchyDestination}
                    />
                  ) : null}
                </div>
              );
            })
          ) : (
            <p className="text-[11px] text-[#666]">No works with performance in this window.</p>
          )}
        </div>
      </div>

      {bundleSuggestions?.suggestions.length ? (
        <div className="mt-4 rounded-xl border border-[#3a3520] bg-[#121008] px-3 py-3" data-testid="analytics-hierarchy-bundle-suggestions">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#c8b878]">
            Suggested bundling · {bundleSuggestions.suggestions.length} pending
          </p>
          <div className="mt-2 space-y-2">
            {bundleSuggestions.suggestions.slice(0, 3).map((suggestion) => (
              <div key={suggestion.suggestion_id} className="text-[11px] text-[#bbb]">
                Merge{" "}
                <Link
                  href={`/studio/preview?post_id=${encodeURIComponent(suggestion.source_post_id)}`}
                  className="font-medium text-[#9bf0c4] hover:underline"
                >
                  {suggestion.source_title?.trim() || suggestion.source_post_id}
                </Link>{" "}
                into {suggestion.target_title} ({suggestion.confidence} confidence)
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
