"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  ArrowLeft,
  ExternalLink,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp
} from "lucide-react";
import type {
  CreatorUnifiedPerformanceRange,
  PerformanceWorkBundleData
} from "@/lib/relay-api";
import type { WorkDrilldownAction } from "@/lib/work-drilldown-actions";

const RANGE_OPTIONS: CreatorUnifiedPerformanceRange[] = ["7d", "30d", "90d"];

type WorkDrilldownViewProps = {
  bundle: PerformanceWorkBundleData;
  performanceRange: CreatorUnifiedPerformanceRange;
  onPerformanceRangeChange: (range: CreatorUnifiedPerformanceRange) => void;
  suggestedActions: WorkDrilldownAction[];
  refreshBusyId: string | null;
  refreshMessage: string | null;
  onRefreshInstance: (platformInstanceId: string) => void;
};

function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "--";
  return Math.round(value).toLocaleString();
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

function reachFromDay(day: {
  impressions: number;
  seen: number;
  views: number;
}): number {
  return day.impressions + day.seen + day.views;
}

function actionToneClasses(tone: WorkDrilldownAction["tone"]): string {
  if (tone === "refresh") return "border-[#6a5a2a]/70 bg-[#1a1808] text-[#e8d9a8]";
  if (tone === "growth") return "border-[#2a7a4a]/55 bg-[#0f1a14] text-[#d7fbe8]";
  return "border-[#2a3a5a]/55 bg-[#0d1018] text-[#c8d4f0]";
}

function WorkTrendHistory({ bundle }: { bundle: PerformanceWorkBundleData }) {
  const points = useMemo(() => {
    return [...(bundle.daily_series ?? [])]
      .map((day) => ({
        day: day.day,
        reach: reachFromDay(day)
      }))
      .sort((a, b) => a.day.localeCompare(b.day));
  }, [bundle.daily_series]);

  if (!points.length) {
    return <p className="text-[11px] text-[#666]">No daily history in this window yet.</p>;
  }

  const maxReach = Math.max(...points.map((point) => point.reach), 1);
  const width = 640;
  const height = 120;
  const padding = 8;
  const step = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;

  const polyline = points
    .map((point, index) => {
      const x = padding + index * step;
      const y = height - padding - (point.reach / maxReach) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div data-testid="work-drilldown-trend">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-28 w-full"
        role="img"
        aria-label={`Work reach trend across ${points.length} days`}
      >
        <polyline
          fill="none"
          stroke="#9bf0c4"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={polyline}
        />
      </svg>
      <div className="mt-2 flex justify-between text-[10px] text-[#666]">
        <span>{points[0]?.day ?? ""}</span>
        <span>{points[points.length - 1]?.day ?? ""}</span>
      </div>
    </div>
  );
}

export function WorkDrilldownView({
  bundle,
  performanceRange,
  onPerformanceRangeChange,
  suggestedActions,
  refreshBusyId,
  refreshMessage,
  onRefreshInstance
}: WorkDrilldownViewProps) {
  const topVariant = useMemo(
    () => [...bundle.variants].sort((a, b) => b.total_reach - a.total_reach)[0] ?? null,
    [bundle.variants]
  );

  return (
    <div
      className="mx-auto flex w-full max-w-[980px] flex-col gap-4 px-4 py-6 sm:px-6"
      data-testid="work-drilldown-view"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/studio/analytics"
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#9bf0c4] hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Back to analytics
          </Link>
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#888]">
            Work / bundle drilldown
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#F0F0F0]">{bundle.title}</h1>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[#888]">
            {bundle.analytics_campaign_label ? (
              <span className="rounded-full border border-[#2a2a2a] px-2 py-0.5">
                Campaign · {bundle.analytics_campaign_label}
              </span>
            ) : null}
            {bundle.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-[#2a2a2a] px-2 py-0.5">
                {tag}
              </span>
            ))}
            {bundle.is_default_bundle ? (
              <span className="rounded-full border border-[#2a2a2a] px-2 py-0.5">Default bundle</span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2" data-testid="work-drilldown-range">
          {RANGE_OPTIONS.map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => onPerformanceRangeChange(range)}
              className={
                performanceRange === range
                  ? "rounded-full border border-[#9bf0c4]/60 bg-[#0f1a14] px-3 py-1.5 text-[11px] font-semibold text-[#9bf0c4]"
                  : "rounded-full border border-[#2a2a2a] bg-[#0A0A0A] px-3 py-1.5 text-[11px] text-[#aaa] hover:border-[#444]"
              }
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {bundle.freshness.stale ? (
        <p
          className="rounded-2xl border border-[#6a5a2a]/70 bg-[#1a1808] px-3 py-2 text-[11px] leading-relaxed text-[#e8d9a8]"
          data-testid="work-drilldown-stale-warning"
        >
          Work performance may be outdated. Last rollup{" "}
          {bundle.freshness.rollup_computed_at
            ? new Date(bundle.freshness.rollup_computed_at).toLocaleString()
            : "unknown"}
          .
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-[#2a7a4a]/45 bg-[#101010] px-4 py-3 text-center">
          <p className="text-[10px] uppercase tracking-[0.14em] text-[#666]">Reach</p>
          <p className="font-mono text-2xl font-bold text-[#9bf0c4]">{formatNumber(bundle.total_reach)}</p>
        </div>
        <div className="rounded-2xl border border-[#2a7a4a]/45 bg-[#101010] px-4 py-3 text-center">
          <p className="text-[10px] uppercase tracking-[0.14em] text-[#666]">Likes</p>
          <p className="font-mono text-2xl font-bold text-[#F5F5F5]">{formatNumber(bundle.totals.likes)}</p>
        </div>
        <div className="rounded-2xl border border-[#2a7a4a]/45 bg-[#101010] px-4 py-3 text-center">
          <p className="text-[10px] uppercase tracking-[0.14em] text-[#666]">Comments</p>
          <p className="font-mono text-2xl font-bold text-[#F5F5F5]">
            {formatNumber(bundle.totals.comments)}
          </p>
        </div>
        <div className="rounded-2xl border border-[#2a7a4a]/45 bg-[#101010] px-4 py-3 text-center">
          <p className="text-[10px] uppercase tracking-[0.14em] text-[#666]">Variants</p>
          <p className="font-mono text-2xl font-bold text-[#F5F5F5]">{bundle.variants.length}</p>
        </div>
      </div>

      {topVariant ? (
        <div
          className="rounded-2xl border border-[#2a7a4a]/45 bg-[#0f1a14] px-4 py-3"
          data-testid="work-drilldown-best-performer"
        >
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#d7fbe8]">
            <TrendingUp className="h-4 w-4 text-[#9bf0c4]" aria-hidden />
            <span className="font-semibold">Top performer</span>
            <span className="text-[#9bf0c4]">
              {topVariant.title?.trim() || topVariant.post_id} · {formatNumber(topVariant.total_reach)} reach
            </span>
          </div>
        </div>
      ) : null}

      {bundle.source_summary.length ? (
        <div className="flex flex-wrap gap-2" data-testid="work-drilldown-source-summary">
          {bundle.source_summary.map((entry) => (
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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-[#1F1F1F] bg-[#101010] p-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[#888]">
            Platform breakdown
          </h2>
          <div className="mt-3 space-y-2" data-testid="work-drilldown-platform-breakdown">
            {bundle.by_destination.length ? (
              bundle.by_destination.map((entry) => (
                <div
                  key={entry.destination}
                  className="rounded-xl border border-[#2a2a2a] bg-[#0A0A0A] px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-[#E8E8E8]">
                      {formatDestinationLabel(entry.destination)}
                    </span>
                    <span className="font-mono text-[11px] text-[#9bf0c4]">
                      {formatNumber(reachFromDay(entry))} reach
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-[#888]">
                    <span>{formatNumber(entry.likes)} likes</span>
                    <span>{formatNumber(entry.comments)} comments</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[11px] text-[#666]">No platform metrics in this window.</p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-[#1F1F1F] bg-[#101010] p-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[#888]">Trend history</h2>
          <div className="mt-3">
            <WorkTrendHistory bundle={bundle} />
          </div>
        </section>
      </div>

      {suggestedActions.length ? (
        <section className="rounded-2xl border border-[#1F1F1F] bg-[#101010] p-4" data-testid="work-drilldown-actions">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#9bf0c4]" aria-hidden />
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[#888]">
              Suggested next moves
            </h2>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {suggestedActions.map((action) => (
              <div
                key={action.id}
                className={`rounded-xl border px-3 py-2.5 ${actionToneClasses(action.tone)}`}
              >
                <p className="text-xs font-semibold">{action.title}</p>
                <p className="mt-1 text-[11px] leading-relaxed opacity-90">{action.body}</p>
                {action.href ? (
                  <Link href={action.href} className="mt-2 inline-flex text-[11px] font-semibold hover:underline">
                    Open in Relay
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-[#1F1F1F] bg-[#101010] p-4">
        <div className="mb-3 flex items-center gap-2">
          <Target className="h-4 w-4 text-[#888]" aria-hidden />
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[#888]">
            Variants & platform instances
          </h2>
        </div>

        {refreshMessage ? (
          <p className="mb-3 rounded-xl border border-[#2a3a5a]/55 bg-[#0d1018] px-3 py-2 text-[11px] text-[#c8d4f0]">
            {refreshMessage}
          </p>
        ) : null}

        <div className="space-y-3" data-testid="work-drilldown-variants">
          {bundle.variants.map((variant) => (
            <div
              key={variant.post_id}
              className="overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#0A0A0A]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#E8E8E8]">
                    {variant.title?.trim() || variant.post_id}
                  </p>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-[#666]">
                    {variant.variant_role.replace(/_/g, " ")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-[#9bf0c4]">
                    {formatNumber(variant.total_reach)} reach
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
                <div className="space-y-1 border-t border-[#222] px-3 py-2">
                  {variant.platform_instances.map((instance) => (
                    <div
                      key={instance.platform_instance_id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#1f1f1f] bg-[#050706] px-2 py-1.5"
                      data-testid={`work-drilldown-instance-${instance.platform_instance_id}`}
                    >
                      <div className="min-w-0 text-[10px] text-[#bbb]">
                        <span>{formatDestinationLabel(instance.destination)}</span>
                        <span className="text-[#666]"> · {instance.link_source}</span>
                        <span className="text-[#666]"> · {instance.status}</span>
                      </div>
                      <button
                        type="button"
                        disabled={refreshBusyId === instance.platform_instance_id}
                        onClick={() => onRefreshInstance(instance.platform_instance_id)}
                        className="inline-flex items-center gap-1 rounded-full border border-[#2a2a2a] px-2 py-1 text-[10px] font-semibold text-[#9bf0c4] hover:border-[#444] disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`h-3 w-3 ${refreshBusyId === instance.platform_instance_id ? "animate-spin" : ""}`}
                          aria-hidden
                        />
                        Refresh
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="border-t border-[#222] px-3 py-2 text-[10px] text-[#666]">
                  No linked platform instances yet.
                </p>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
