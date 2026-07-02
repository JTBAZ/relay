"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, ExternalLink, MousePointerClick, RefreshCw, Sparkles } from "lucide-react";
import {
  fetchPostDistributionSummary,
  fetchPostExternalMetrics,
  type DistributionSummaryWire,
  type ExternalPostDestinationMetricsWire,
  type PostExternalMetricsWire
} from "@/lib/relay-api";
import { subscribeRelayExternalMetricsRefresh } from "@/lib/relay-external-metrics-refresh";
import {
  describeRelayExternalMetricsRefreshFailure,
  sendRelayExternalMetricsRefreshToExtension
} from "@/lib/relay-extension-messaging";

const DESTINATION_LABEL: Record<string, string> = {
  patreon: "Patreon",
  x: "X",
  deviantart: "DeviantArt"
};

function formatMetricValue(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString();
}

function formatRelativeUpdatedAt(iso: string | null | undefined): string {
  if (!iso) return "Not refreshed yet";
  const captured = new Date(iso);
  if (Number.isNaN(captured.getTime())) return "Updated recently";
  const deltaMs = Date.now() - captured.getTime();
  const minutes = Math.max(1, Math.round(deltaMs / 60_000));
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `Updated ${hours}h ago`;
  return `Updated ${captured.toLocaleDateString()}`;
}

function metricValue(
  destinationMetrics: ExternalPostDestinationMetricsWire | undefined,
  metricType: string
): number | null {
  const row = destinationMetrics?.metrics.find((metric) => metric.metric_type === metricType);
  return row?.value ?? null;
}

function latestCapturedAt(destinationMetrics: ExternalPostDestinationMetricsWire | undefined): string | null {
  const timestamps = (destinationMetrics?.metrics ?? [])
    .map((metric) => metric.captured_at)
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a));
  return timestamps[0] ?? null;
}

function MetricTile({
  icon: Icon,
  label,
  value,
  subvalue
}: {
  icon: typeof BarChart3;
  label: string;
  value: string;
  subvalue?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--lib-border)] bg-[var(--lib-muted)]/45 p-2">
      <Icon className="h-3.5 w-3.5 text-[var(--lib-primary)]" aria-hidden />
      <p className="mt-2 text-sm font-semibold tabular-nums text-[var(--lib-fg)]">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-[var(--lib-fg-muted)]">{label}</p>
      {subvalue ? <p className="mt-1 text-[9px] leading-3 text-[var(--lib-primary)]">{subvalue}</p> : null}
    </div>
  );
}

export function PostReachPanel({ postId }: { postId: string }) {
  const [summary, setSummary] = useState<DistributionSummaryWire | null>(null);
  const [metrics, setMetrics] = useState<PostExternalMetricsWire | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const loadReachData = useCallback(async () => {
    setError(null);
    try {
      const [summaryRes, metricsRes] = await Promise.all([
        fetchPostDistributionSummary(postId),
        fetchPostExternalMetrics(postId)
      ]);
      setSummary(summaryRes.summary);
      setMetrics(metricsRes.metrics);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load post reach.");
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    setLoading(true);
    void loadReachData();
  }, [loadReachData]);

  useEffect(() => subscribeRelayExternalMetricsRefresh(() => void loadReachData()), [loadReachData]);

  const patreonLink = useMemo(
    () =>
      summary?.destinations.find(
        (entry) =>
          entry.destination === "patreon" &&
          entry.attempt_status === "posted" &&
          Boolean(entry.external_url?.trim())
      ) ?? null,
    [summary]
  );

  const patreonMetrics = useMemo(
    () => metrics?.destinations.find((entry) => entry.destination === "patreon") ?? null,
    [metrics]
  );

  const onRefreshPatreon = useCallback(async () => {
    if (!patreonLink?.attempt_id || !patreonLink.external_url) return;
    setRefreshing(true);
    setRefreshError(null);
    const result = await sendRelayExternalMetricsRefreshToExtension({
      postId,
      attemptId: patreonLink.attempt_id,
      destination: "patreon",
      externalUrl: patreonLink.external_url
    });
    setRefreshing(false);
    if (!result.ok) {
      setRefreshError(describeRelayExternalMetricsRefreshFailure(result));
      return;
    }
    await loadReachData();
  }, [loadReachData, patreonLink, postId]);

  const patreonUpdatedAt = formatRelativeUpdatedAt(latestCapturedAt(patreonMetrics ?? undefined));

  return (
    <div className="space-y-4 border-b border-[var(--lib-border)] px-4 py-4">
      <section>
        <div className="mb-2 flex items-center gap-2">
          <BarChart3 className="h-3.5 w-3.5 text-[var(--lib-primary)]" aria-hidden />
          <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">
            Post reach
          </p>
        </div>

        {loading ? (
          <p className="text-xs text-[var(--lib-fg-muted)]">Loading reach data…</p>
        ) : error ? (
          <p className="text-xs text-red-300">{error}</p>
        ) : (
          <>
            <div className="mb-3">
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-[var(--lib-fg-muted)]">
                Relay
              </p>
              <div className="grid grid-cols-3 gap-2">
                <MetricTile icon={BarChart3} label="Total Views" value="—" subvalue="Coming soon" />
                <MetricTile icon={Sparkles} label="Discovery Tips" value="—" subvalue="Coming soon" />
                <MetricTile icon={MousePointerClick} label="Conversions" value="—" subvalue="Coming soon" />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--lib-fg-muted)]">
                Linked platforms
              </p>

              {patreonLink ? (
                <div className="rounded-xl border border-[var(--lib-border)] bg-[var(--lib-muted)]/25 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[var(--lib-fg)]">
                        {DESTINATION_LABEL.patreon}
                      </p>
                      <p className="mt-0.5 text-[10px] text-[var(--lib-fg-muted)]">{patreonUpdatedAt}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <a
                        href={patreonLink.external_url ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-full border border-[var(--lib-border)] px-2 py-1 text-[10px] font-medium text-[var(--lib-fg)] hover:border-[var(--lib-primary)]/45"
                      >
                        Posted
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                      <button
                        type="button"
                        disabled={refreshing}
                        onClick={() => void onRefreshPatreon()}
                        className="inline-flex items-center gap-1 rounded-full border border-[var(--lib-primary)]/45 bg-[color-mix(in_srgb,var(--lib-primary)_12%,var(--lib-card))] px-2 py-1 text-[10px] font-medium text-[var(--lib-fg)] hover:border-[var(--lib-primary)] disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
                        {refreshing ? "Refreshing…" : "Refresh stats"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <MetricTile
                      icon={BarChart3}
                      label="Impressions"
                      value={formatMetricValue(metricValue(patreonMetrics ?? undefined, "impressions"))}
                    />
                    <MetricTile
                      icon={Sparkles}
                      label="Seen"
                      value={formatMetricValue(metricValue(patreonMetrics ?? undefined, "seen"))}
                    />
                    <MetricTile
                      icon={Sparkles}
                      label="Likes"
                      value={formatMetricValue(metricValue(patreonMetrics ?? undefined, "likes"))}
                    />
                    <MetricTile
                      icon={MousePointerClick}
                      label="Comments"
                      value={formatMetricValue(metricValue(patreonMetrics ?? undefined, "comments"))}
                    />
                  </div>

                  {refreshError ? (
                    <p className="mt-2 text-[10px] leading-4 text-red-300">{refreshError}</p>
                  ) : null}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-[var(--lib-border)] px-3 py-2 text-[10px] leading-4 text-[var(--lib-fg-muted)]">
                  Link a Patreon post to see external stats here. Cross-post and confirm the published URL first.
                </p>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
