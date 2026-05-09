"use client";

import { useMemo, type ReactNode } from "react";
import { pickHottestFromPostPerformance } from "@/lib/analytics-pulse";
import type { CreatorMembershipSummaryData, CreatorPostPerformanceData } from "@/lib/relay-api";

function fmtPerHour(n: number): string {
  if (n >= 100) {
    return `${Math.round(n)}`;
  }
  if (n >= 10) {
    return n.toFixed(1);
  }
  return n.toFixed(2);
}

export type AnalyticsPulseStripProps = {
  performance: CreatorPostPerformanceData | null;
  summary7d: CreatorMembershipSummaryData | null;
  errPerformance?: string | null;
  errSummary7d?: string | null;
  loading: boolean;
};

export default function AnalyticsPulseStrip({
  performance,
  summary7d,
  errPerformance,
  errSummary7d,
  loading
}: AnalyticsPulseStripProps) {
  const hot = useMemo(() => pickHottestFromPostPerformance(performance), [performance]);

  const momentumLine = useMemo(() => {
    if (!summary7d) {
      return null;
    }
    const { net_growth_events, adds_in_window, cancels_in_window } = summary7d;
    const net =
      net_growth_events >= 0 ? `+${net_growth_events}` : String(net_growth_events);
    return { net, adds_in_window, cancels_in_window };
  }, [summary7d]);

  let body: ReactNode;
  if (loading) {
    body = (
      <p className="text-sm text-[#888]" data-testid="pulse-loading">
        Loading pulse…
      </p>
    );
  } else {
    body = (
      <div className="grid gap-4 sm:grid-cols-2">
        <div
          className="rounded-lg border border-[#2a2a2a] bg-[#111] p-3"
          data-testid="pulse-whats-hot"
        >
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
            What&apos;s hot
          </h3>
          {errPerformance ? (
            <p className="mt-2 text-sm text-[#c98]">{errPerformance}</p>
          ) : hot ? (
            <div className="mt-2 space-y-1 text-sm">
              <p className="font-medium leading-snug text-[#E8E8E8]">{hot.title}</p>
              <p className="text-xs text-[#9A9A9A]">
                {hot.score_label === "seen_per_hour" ? (
                  <>
                    ~{fmtPerHour(hot.score_per_hour)} seen/hour since publish
                    <span className="text-[#666]"> · </span>
                    {Math.round(hot.hours_since_publish)}h since publish
                  </>
                ) : (
                  <>
                    ~{fmtPerHour(hot.score_per_hour)} (likes+comments)/hour
                    <span className="text-[#666]"> · </span>
                    {Math.round(hot.hours_since_publish)}h since publish
                  </>
                )}
              </p>
              <p className="text-[11px] text-[#666]">
                From Patreon Insights CSV + Library publish time only — Patreon&apos;s API does not provide these
                post stats to Relay.
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-[#888]">
              {performance?.import_id
                ? "No post has both Insights numbers and a publish date yet."
                : "Upload a Patreon Insights CSV and keep posts synced to see what’s hot."}
            </p>
          )}
        </div>

        <div
          className="rounded-lg border border-[#2a2a2a] bg-[#111] p-3"
          data-testid="pulse-momentum"
        >
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
            Recent momentum (7 days)
          </h3>
          {errSummary7d ? (
            <p className="mt-2 text-sm text-[#c98]">{errSummary7d}</p>
          ) : momentumLine ? (
            <div className="mt-2 space-y-1 text-sm">
              <p className="text-lg font-semibold text-[#9bf0c4]">{momentumLine.net} net</p>
              <p className="mt-2 text-xs text-[#9A9A9A]">
                {momentumLine.adds_in_window} adds / rejoins · {momentumLine.cancels_in_window}{" "}
                cancels
                <span className="text-[#666]"> · </span>
                <strong className="font-medium text-[#888]">membership ledger</strong> (Patreon sync — not live
                dashboard)
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-[#888]">No membership summary yet.</p>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-[#555]">
            Subshop / supporter activity: not wired in this pilot — we only show data the API
            returns.
          </p>
        </div>
      </div>
    );
  }

  return (
    <details
      className="group rounded-xl border border-[#2a7a4a] border-opacity-40 bg-[#0a1510] px-4 py-3 open:shadow-md open:shadow-black/20"
      data-testid="analytics-pulse-details"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[#9bf0c4] [&::-webkit-details-marker]:hidden">
        <span className="font-[family-name:var(--font-display)] text-sm font-semibold tracking-tight">
          Pulse
        </span>
        <span
          className="text-[#6a8] transition-transform group-open:rotate-180"
          aria-hidden
        >
          ▾
        </span>
      </summary>
      <div className="mt-3 border-t border-[#1a2a22] pt-3">{body}</div>
    </details>
  );
}
