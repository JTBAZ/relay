"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import AnalyticsPulseStrip from "./AnalyticsPulseStrip";
import {
  fetchCreatorMembershipCohorts,
  fetchCreatorMembershipSummary,
  fetchCreatorPostPerformance,
  fetchCreatorTierStickiness,
  fetchCreatorUsagePreview,
  RelayApiError,
  uploadPatreonInsightsCsv,
  type CreatorMembershipCohortsData,
  type CreatorMembershipSummaryData,
  type CreatorPostPerformanceData,
  type CreatorTierStickinessData,
  type CreatorUsagePreviewData
} from "@/lib/relay-api";
import { insightsStaleDaysLimit, isInsightsCsvStale } from "@/lib/analytics-data-freshness";

function fmtPct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function formatUsageDisplay(kind: "bytes" | "count", quantityStr: string): string {
  if (kind === "count") {
    const n = Number(quantityStr);
    return Number.isFinite(n) ? Math.trunc(n).toLocaleString() : quantityStr;
  }
  const n = BigInt(quantityStr);
  const abs = n < BigInt(0) ? -n : n;
  const num = Number(abs);
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = num;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const rounded =
    i === 0 ? Math.round(v) : v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${rounded} ${units[i]}`;
}

function UsageBarRow({
  label,
  kind,
  quantityStr,
  denomMax
}: {
  label: string;
  kind: "bytes" | "count";
  quantityStr: string;
  denomMax: number;
}) {
  const raw = Number(quantityStr);
  const safe = Number.isFinite(raw) ? raw : 0;
  const pct = denomMax > 0 ? Math.min(100, Math.round((safe / denomMax) * 1000) / 10) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between gap-2 text-xs text-[#B8B8B8]">
        <span>{label}</span>
        <span className="tabular-nums text-[#E8E8E8]">{formatUsageDisplay(kind, quantityStr)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#1a1a1a]">
        <div className="h-full rounded-full bg-[#4a8c6e]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SectionCard({
  title,
  children,
  error,
  description
}: {
  title: string;
  children: ReactNode;
  error?: string | null;
  description?: string;
}) {
  return (
    <section
      className="rounded-xl border border-[#1F1F1F] bg-[#0D0D0D] p-4 shadow-sm sm:p-5"
      aria-labelledby={`${title.replace(/\s+/g, "-").toLowerCase()}-heading`}
    >
      <h2
        id={`${title.replace(/\s+/g, "-").toLowerCase()}-heading`}
        className="font-[family-name:var(--font-display)] text-base font-semibold tracking-tight text-[#E8E8E8]"
      >
        {title}
      </h2>
      {description ? (
        <p className="mt-1 text-xs leading-relaxed text-[#888]">{description}</p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-md border border-[#5c2a2a] bg-[#1a1010] px-3 py-2 text-sm text-[#f0a8a8]">
          {error}
        </p>
      ) : null}
      <div className={error ? "mt-4" : "mt-4"}>{children}</div>
    </section>
  );
}

export default function AnalyticsOverviewClient() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<CreatorMembershipSummaryData | null>(null);
  const [summary7d, setSummary7d] = useState<CreatorMembershipSummaryData | null>(null);
  const [cohorts, setCohorts] = useState<CreatorMembershipCohortsData | null>(null);
  const [stickiness, setStickiness] = useState<CreatorTierStickinessData | null>(null);
  const [performance, setPerformance] = useState<CreatorPostPerformanceData | null>(null);
  const [usagePreview, setUsagePreview] = useState<CreatorUsagePreviewData | null>(null);

  const [errSummary, setErrSummary] = useState<string | null>(null);
  const [errSummary7d, setErrSummary7d] = useState<string | null>(null);
  const [errCohorts, setErrCohorts] = useState<string | null>(null);
  const [errStickiness, setErrStickiness] = useState<string | null>(null);
  const [errPerformance, setErrPerformance] = useState<string | null>(null);
  const [errUsagePreview, setErrUsagePreview] = useState<string | null>(null);

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvMsg, setCsvMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrSummary(null);
    setErrSummary7d(null);
    setErrCohorts(null);
    setErrStickiness(null);
    setErrPerformance(null);
    setErrUsagePreview(null);

    const [r1, r1_7, r2, r3, r4, r5] = await Promise.allSettled([
      fetchCreatorMembershipSummary({ days: 30 }),
      fetchCreatorMembershipSummary({ days: 7 }),
      fetchCreatorMembershipCohorts({ cohortMonths: 12, maxOffset: 12 }),
      fetchCreatorTierStickiness({ days: 30 }),
      fetchCreatorPostPerformance({
        includeRelayOnly: true,
        relayOnlyLimit: 8,
        metricsLimit: 50
      }),
      fetchCreatorUsagePreview({ days: 30 })
    ]);

    if (r1.status === "fulfilled") {
      setSummary(r1.value);
    } else {
      setSummary(null);
      setErrSummary(r1.reason instanceof Error ? r1.reason.message : String(r1.reason));
    }

    if (r1_7.status === "fulfilled") {
      setSummary7d(r1_7.value);
    } else {
      setSummary7d(null);
      setErrSummary7d(r1_7.reason instanceof Error ? r1_7.reason.message : String(r1_7.reason));
    }

    if (r2.status === "fulfilled") {
      setCohorts(r2.value);
    } else {
      setCohorts(null);
      setErrCohorts(r2.reason instanceof Error ? r2.reason.message : String(r2.reason));
    }

    if (r3.status === "fulfilled") {
      setStickiness(r3.value);
    } else {
      setStickiness(null);
      setErrStickiness(r3.reason instanceof Error ? r3.reason.message : String(r3.reason));
    }

    if (r4.status === "fulfilled") {
      setPerformance(r4.value);
    } else {
      setPerformance(null);
      setErrPerformance(r4.reason instanceof Error ? r4.reason.message : String(r4.reason));
    }

    if (r5.status === "fulfilled") {
      setUsagePreview(r5.value);
    } else {
      setUsagePreview(null);
      setErrUsagePreview(r5.reason instanceof Error ? r5.reason.message : String(r5.reason));
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cohortOffsets = useMemo(() => {
    if (!cohorts?.cohorts?.length) {
      return [];
    }
    const s = new Set<number>();
    for (const c of cohorts.cohorts) {
      for (const r of c.retention) {
        s.add(r.months_since_join);
      }
    }
    return Array.from(s).sort((a, b) => a - b);
  }, [cohorts]);

  const onUploadCsv = async () => {
    if (!csvFile) {
      setCsvMsg("Choose a CSV file first.");
      return;
    }
    setCsvBusy(true);
    setCsvMsg(null);
    try {
      const r = await uploadPatreonInsightsCsv(csvFile);
      setCsvMsg(
        r.already_imported
          ? `This file was already imported (${r.rows_written} rows on file).`
          : `Imported ${r.rows_written} rows.`
      );
      setCsvFile(null);
      await load();
    } catch (e) {
      setCsvMsg(e instanceof RelayApiError ? e.message : String(e));
    } finally {
      setCsvBusy(false);
    }
  };

  const topInsightRows = performance?.rows?.filter((r) => r.insights) ?? [];
  const displayInsightRows = topInsightRows.slice(0, 8);

  const insightsImportStale = useMemo(
    () => isInsightsCsvStale(performance?.import_uploaded_at ?? null),
    [performance?.import_uploaded_at]
  );
  const insightsStaleDays = insightsStaleDaysLimit();

  const { usageByteBars, usageCountBars, usageMaxByte, usageMaxCount } = useMemo(() => {
    if (!usagePreview?.bars?.length) {
      return {
        usageByteBars: [] as CreatorUsagePreviewData["bars"],
        usageCountBars: [] as CreatorUsagePreviewData["bars"],
        usageMaxByte: 1,
        usageMaxCount: 1
      };
    }
    const bytes = usagePreview.bars.filter((b) => b.kind === "bytes");
    const counts = usagePreview.bars.filter((b) => b.kind === "count");
    const usageMaxByte = Math.max(1, ...bytes.map((b) => Number(b.quantity)));
    const usageMaxCount = Math.max(1, ...counts.map((b) => Number(b.quantity)));
    return {
      usageByteBars: bytes,
      usageCountBars: counts,
      usageMaxByte,
      usageMaxCount
    };
  }, [usagePreview]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 bg-[#0A0A0A] px-3 py-6 text-[#E0E0E0] sm:px-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-[#F5F5F5]">
            Analytics
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[#9A9A9A]">
            Patreon&apos;s API does not give Relay post-level <strong className="font-medium text-[#B0B0B0]">impressions</strong> or{" "}
            <strong className="font-medium text-[#B0B0B0]">seen</strong> counts — upload a Patreon{" "}
            <strong className="font-medium text-[#B0B0B0]">Insights</strong> CSV for that. Membership, cohorts, and
            tiers use <strong className="font-medium text-[#B0B0B0]">Patreon sync</strong> into Relay (timing follows
            your sync schedule, not Patreon&apos;s live dashboard).
          </p>
        </div>
        <Link
          href="/action-center"
          className="shrink-0 text-sm font-medium text-[#9bf0c4] underline-offset-4 hover:text-[#b8f5d9] hover:underline"
        >
          Open Action Center
        </Link>
      </header>

      <AnalyticsPulseStrip
        performance={performance}
        summary7d={summary7d}
        errPerformance={errPerformance}
        errSummary7d={errSummary7d}
        loading={loading}
      />

      {loading ? (
        <div
          className="flex min-h-[120px] items-center justify-center text-sm text-[#888]"
          data-testid="analytics-loading"
        >
          Loading analytics…
        </div>
      ) : null}

      {!loading ? (
        <>
          {insightsImportStale ? (
            <div
              role="status"
              data-testid="analytics-insights-stale-warning"
              className="rounded-lg border border-[#6a5a2a] bg-[#1a1808] px-3 py-2.5 text-sm leading-snug text-[#e8d9a8]"
            >
              Your latest Patreon Insights CSV is older than{" "}
              <span className="font-semibold tabular-nums">{insightsStaleDays}</span> days. Post stats may be out
              of date — export a fresh CSV from Patreon and upload it in{" "}
              <strong className="font-medium text-[#f5ecd0]">Post performance</strong> below.
            </div>
          ) : null}

          <SectionCard
            title="Usage preview (beta)"
            error={errUsagePreview}
            description="Relay counts how much media you export and how often traffic hits rate limits. These are rough studio totals for the window below — not a bill or final usage."
          >
            {usagePreview ? (
              <div className="space-y-6" data-testid="analytics-usage-preview">
                <p className="text-[11px] leading-relaxed text-[#707070]">{usagePreview.disclaimer}</p>
                <p className="text-[11px] text-[#5c5c5c]">
                  Window:{" "}
                  <span className="tabular-nums text-[#888]">{usagePreview.window.days} days</span>
                  {" · "}
                  <span className="tabular-nums text-[#888]">
                    {new Date(usagePreview.window.start).toLocaleDateString()} –{" "}
                    {new Date(usagePreview.window.end).toLocaleDateString()}
                  </span>
                </p>
                <div className="space-y-3">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                    Data transfer
                  </h3>
                  <div className="space-y-3">
                    {usageByteBars.map((b) => (
                      <UsageBarRow
                        key={b.metric}
                        label={b.label}
                        kind={b.kind}
                        quantityStr={b.quantity}
                        denomMax={usageMaxByte}
                      />
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                    Activity counts
                  </h3>
                  <div className="space-y-3">
                    {usageCountBars.map((b) => (
                      <UsageBarRow
                        key={b.metric}
                        label={b.label}
                        kind={b.kind}
                        quantityStr={b.quantity}
                        denomMax={usageMaxCount}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[#888]">No usage preview yet.</p>
            )}
          </SectionCard>

          <SectionCard
            title="Membership (last 30 days)"
            error={errSummary}
            description={summary?.note}
          >
            {summary ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-[#2a2a2a] bg-[#111] p-3">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-[#888]">
                      Paying members
                    </div>
                    <div
                      className="mt-1 text-2xl font-semibold text-[#F0F0F0]"
                      data-testid="analytics-kpi-paying"
                    >
                      {summary.active_paying_members}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#2a2a2a] bg-[#111] p-3">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-[#888]">
                      Total in roster
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-[#F0F0F0]">
                      {summary.total_patrons}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#2a2a2a] bg-[#111] p-3">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-[#888]">
                      Net growth (events)
                    </div>
                    <div
                      className="mt-1 text-2xl font-semibold text-[#9bf0c4]"
                      data-testid="analytics-kpi-net-growth"
                    >
                      {summary.net_growth_events >= 0 ? "+" : ""}
                      {summary.net_growth_events}
                    </div>
                    <div className="mt-1 text-xs text-[#777]">
                      +{summary.adds_in_window} joins / rejoins · −{summary.cancels_in_window} cancels
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#2a2a2a] bg-[#111] p-3">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-[#888]">
                      Tier mix (paid)
                    </div>
                    <ul className="mt-2 max-h-24 space-y-1 overflow-y-auto text-xs text-[#C8C8C8]">
                      {summary.tier_breakdown.map((t) => (
                        <li key={t.tier_id} className="flex justify-between gap-2">
                          <span className="truncate">{t.title}</span>
                          <span className="shrink-0 text-[#9A9A9A]">{t.patron_count}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-[#5c5c5c]">
                  Source: membership ledger written when Patreon{" "}
                  <strong className="font-medium text-[#707070]">member sync</strong> runs — not a live mirror of
                  every Patreon dashboard tile.
                </p>
              </>
            ) : (
              <p className="text-sm text-[#888]">No summary data.</p>
            )}
          </SectionCard>

          <SectionCard title="Cohort retention" error={errCohorts} description={cohorts?.note}>
            {cohorts && cohorts.cohorts.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#2a2a2a] text-[#888]">
                      <th className="py-2 pr-3 font-medium">Join month</th>
                      <th className="py-2 pr-3 font-medium">Size</th>
                      {cohortOffsets.map((o) => (
                        <th key={o} className="py-2 px-1 text-center font-medium">
                          M+{o}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cohorts.cohorts.map((c) => (
                      <tr key={c.cohort_month} className="border-b border-[#1a1a1a]">
                        <td className="py-2 pr-3 font-mono text-[#CCC]">{c.cohort_month}</td>
                        <td className="py-2 pr-3 text-[#AAA]">{c.cohort_size}</td>
                        {cohortOffsets.map((o) => {
                          const cell = c.retention.find((r) => r.months_since_join === o);
                          const p = cell?.retained_pct;
                          const bg =
                            p == null
                              ? undefined
                              : `rgba(34, 197, 94, ${0.15 + p * 0.55})`;
                          return (
                            <td
                              key={o}
                              className="px-1 py-2 text-center text-[#DDD] tabular-nums"
                              style={{ backgroundColor: bg }}
                            >
                              {p == null ? "—" : fmtPct(p)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-[#888]">No cohort data yet (needs membership history from sync).</p>
            )}
          </SectionCard>

          <SectionCard title="Tier stickiness" error={errStickiness} description={stickiness?.note}>
            {stickiness && stickiness.tiers.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#2a2a2a] text-[#888]">
                      <th className="py-2 pr-3 font-medium">Tier</th>
                      <th className="py-2 pr-3 font-medium">Members</th>
                      <th className="py-2 pr-3 font-medium">Median tenure (d)</th>
                      <th className="py-2 pr-3 font-medium">Churn proxy</th>
                      <th className="py-2 font-medium">Cancels (window)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stickiness.tiers.map((t) => (
                      <tr key={t.tier_id} className="border-b border-[#1a1a1a]">
                        <td className="py-2 pr-3 text-[#DDD]">{t.title}</td>
                        <td className="py-2 pr-3 tabular-nums text-[#AAA]">{t.member_count}</td>
                        <td className="py-2 pr-3 tabular-nums text-[#AAA]">
                          {t.median_tenure_days ?? "—"}
                        </td>
                        <td className="py-2 pr-3 tabular-nums text-[#AAA]">{t.churn_proxy}</td>
                        <td className="py-2 tabular-nums text-[#AAA]">{t.cancel_events_in_window}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-[#888]">No tier stickiness rows yet.</p>
            )}
          </SectionCard>

          <SectionCard
            title="Post performance (Patreon Insights CSV)"
            error={errPerformance}
            description={performance?.note}
          >
            <div className="mb-4 flex flex-col gap-3 rounded-lg border border-dashed border-[#333] bg-[#0A0A0A] p-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label htmlFor="insights-csv" className="text-xs font-medium text-[#AAA]">
                  Upload CSV export
                </label>
                <input
                  id="insights-csv"
                  type="file"
                  accept=".csv,text/csv"
                  data-testid="insights-csv-input"
                  className="mt-1 block w-full text-xs text-[#CCC] file:mr-3 file:rounded-md file:border file:border-[#333] file:bg-[#1a1a1a] file:px-3 file:py-1.5 file:text-xs file:text-[#E0E0E0]"
                  onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <button
                type="button"
                data-testid="insights-csv-upload"
                disabled={csvBusy || !csvFile}
                className="rounded-md bg-[#0D3D2C] px-4 py-2 text-sm font-semibold text-[#9bf0c4] disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void onUploadCsv()}
              >
                {csvBusy ? "Uploading…" : "Upload"}
              </button>
            </div>
            {csvMsg ? (
              <p className="mb-4 text-sm text-[#CCC]" data-testid="insights-csv-message">
                {csvMsg}
              </p>
            ) : null}

            {performance?.import_id ? (
              <>
                <p className="mb-2 text-xs text-[#888]">
                  Latest import:{" "}
                  <span className="font-mono text-[#AAA]">{performance.import_uploaded_at}</span>
                  {performance.import_label ? ` · ${performance.import_label}` : null}
                </p>
                <p className="mb-3 text-[11px] leading-relaxed text-[#5c5c5c]">
                  Impressions and &quot;seen&quot; come from Patreon&apos;s CSV export only; Patreon&apos;s API does not
                  give Relay those per-post fields today.
                </p>
              </>
            ) : (
              <p className="mb-3 text-sm text-[#A88]" data-testid="analytics-csv-empty">
                No Insights import yet — upload a CSV to unlock post-level impressions and “seen” counts.
              </p>
            )}

            {displayInsightRows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#2a2a2a] text-[#888]">
                      <th className="py-2 pr-3 font-medium">Post</th>
                      <th className="py-2 pr-3 font-medium">Seen</th>
                      <th className="py-2 pr-3 font-medium">Impr.</th>
                      <th className="py-2 pr-3 font-medium">Likes</th>
                      <th className="py-2 pr-3 font-medium">Comments</th>
                      <th className="py-2 font-medium">Gap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayInsightRows.map((r) => (
                      <tr key={r.patreon_post_id} className="border-b border-[#1a1a1a]">
                        <td className="max-w-[200px] py-2 pr-3 truncate text-[#DDD]">
                          {r.relay?.title ?? r.patreon_post_id}
                        </td>
                        <td className="py-2 pr-3 tabular-nums text-[#AAA]">
                          {r.insights?.seen ?? "—"}
                        </td>
                        <td className="py-2 pr-3 tabular-nums text-[#AAA]">
                          {r.insights?.impressions ?? "—"}
                        </td>
                        <td className="py-2 pr-3 tabular-nums text-[#AAA]">
                          {r.insights?.likes ?? "—"}
                        </td>
                        <td className="py-2 pr-3 tabular-nums text-[#AAA]">
                          {r.insights?.comments ?? "—"}
                        </td>
                        <td className="py-2 text-[#888]">{r.gap}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : performance?.import_id ? (
              <p className="text-sm text-[#888]">Import has no metric rows with numbers yet.</p>
            ) : null}
          </SectionCard>

          <footer className="rounded-lg border border-[#1F1F1F] bg-[#080808] p-4 text-xs leading-relaxed text-[#666]">
            <strong className="text-[#888]">Where the numbers come from</strong>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong className="text-[#707070]">Membership, cohorts, tier churn:</strong> Relay membership ledger,
                filled by <strong className="font-medium text-[#808080]">Patreon sync</strong> (join / change / cancel
                events). Refreshes when sync runs — not real-time with Patreon&apos;s site.
              </li>
              <li>
                <strong className="text-[#707070]">Post impressions &amp; &quot;seen&quot;:</strong> only from an{" "}
                <strong className="font-medium text-[#808080]">imported Patreon Insights CSV</strong>. Patreon API v2 does
                not expose these per-post metrics to Relay; the CSV closes that gap.
              </li>
              <li>
                <strong className="text-[#707070]">Pulse &quot;What&apos;s hot&quot;:</strong> ranks posts using CSV
                metrics plus <strong className="font-medium text-[#808080]">Library publish time</strong> from Relay.
              </li>
              <li>
                Rows marked <code className="text-[#9A9A9A]">metrics_without_relay</code> are in the CSV but not
                matched to a Library post; <code className="text-[#9A9A9A]">relay_without_metrics</code> are posts not
                listed in that CSV snapshot.
              </li>
            </ul>
          </footer>
        </>
      ) : null}
    </div>
  );
}
