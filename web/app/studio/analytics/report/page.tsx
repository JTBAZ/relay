"use client";

import { Suspense, useEffect, useState, type ElementType, type ReactNode } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  FileEdit,
  Clock,
  BarChart2,
  Layers,
  Hash,
  Wifi,
  WifiOff
} from "lucide-react";
import { IAH, IAH_ROOT_STYLE } from "../action-hub/action-hub-tokens";
import {
  emptyMountedReport,
  formatReach,
  reportFromDistributionPlan
} from "../action-hub/action-hub-report";
import type { LatestReport } from "../action-hub/action-hub-types";
import { fetchPostDistributionPlan } from "@/lib/relay-api";
import { StudioRouteGuard } from "@/app/components/studio/StudioRouteGuard";

const DEST_LABELS: Record<string, string> = {
  patreon: "Patreon",
  x: "X / Twitter",
  bluesky: "Bluesky",
  deviantart: "DeviantArt",
  relay: "Relay"
};

const sectionVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] as const }
  })
};

function Section({
  index,
  icon: Icon,
  title,
  children
}: {
  index: number;
  icon: ElementType;
  title: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      custom={index}
      initial="hidden"
      animate="visible"
      variants={sectionVariants}
      className="rounded-2xl border p-6"
      style={{ borderColor: IAH.border, background: IAH.surface }}
    >
      <div className="mb-5 flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
          style={{
            background: "rgba(0,170,111,0.1)",
            border: "1px solid rgba(0,170,111,0.18)"
          }}
          aria-hidden="true"
        >
          <Icon size={15} style={{ color: IAH.accent }} strokeWidth={1.8} />
        </span>
        <h3 className="text-sm font-semibold tracking-wide" style={{ color: IAH.fg }}>
          {title}
        </h3>
      </div>
      {children}
    </motion.div>
  );
}

function ReportContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const postId = searchParams.get("postId")?.trim() ?? "";

  const [report, setReport] = useState<LatestReport>(() => emptyMountedReport(postId || null));
  const [loading, setLoading] = useState(Boolean(postId));
  const [postTitle, setPostTitle] = useState("Focused post");
  const [reachLabel, setReachLabel] = useState("—");

  useEffect(() => {
    if (!postId) {
      setReport(emptyMountedReport(null));
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { plan } = await fetchPostDistributionPlan(postId);
        if (cancelled) return;
        const mounted = reportFromDistributionPlan(postId, plan);
        setReport(mounted ?? emptyMountedReport(postId));
        const proposal = plan?.assistant_plan?.proposal as
          | { fact_pack?: { this_post?: { reach?: number } } }
          | undefined;
        if (proposal?.fact_pack?.this_post?.reach != null) {
          setReachLabel(formatReach(proposal.fact_pack.this_post.reach));
        }
        setPostTitle("Coach analysis");
      } catch {
        if (!cancelled) setReport(emptyMountedReport(postId));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [postId]);

  const { fact_pack, findings } = report;

  const topInsights = [
    ...findings.chips
      .filter((c) => c.highlight)
      .slice(0, 2)
      .map((c) => ({
        label: c.highlight!.value,
        sublabel: c.label.replace(c.highlight!.text, "").replace(/\s+/g, " ").trim(),
        color: IAH.accent
      })),
    {
      label: fact_pack.cadence.historical_hour_of_day,
      sublabel: "peak timing window",
      color: IAH.fgMuted
    },
    ...(fact_pack.destination_mix[0]
      ? [
          {
            label: `${fact_pack.destination_mix[0].share}%`,
            sublabel: `reach from ${DEST_LABELS[fact_pack.destination_mix[0].dest] ?? fact_pack.destination_mix[0].dest}`,
            color: IAH.fgMuted
          }
        ]
      : [])
  ].slice(0, 4);

  const takeaways = findings.chips.map((chip) =>
    chip.highlight
      ? chip.label.replace(chip.highlight.text, chip.highlight.value)
      : chip.label
  );

  if (!postId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8" style={IAH_ROOT_STYLE}>
        <p style={{ color: IAH.fgMuted }}>Select a post from Insights to open its report.</p>
        <button
          type="button"
          onClick={() => router.push("/studio/analytics")}
          className="text-sm"
          style={{ color: IAH.accent }}
        >
          Back to Coach
        </button>
      </div>
    );
  }

  return (
    <div
      className="insights-action-hub flex min-h-0 flex-1 flex-col overflow-x-hidden"
      style={IAH_ROOT_STYLE}
      data-testid="insights-full-report"
    >
      <motion.div
        className="pointer-events-none fixed inset-0 z-0"
        animate={{ opacity: [0.4, 0.9, 0.4] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background:
            "radial-gradient(ellipse 50% 35% at 80% 5%, rgba(0,170,111,0.05) 0%, transparent 70%)"
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-[1000px] flex-col gap-8 px-5 py-8 md:px-8">
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col gap-4"
          aria-label="Report header"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => router.push("/studio/analytics")}
              className="flex items-center gap-1.5 text-xs transition-colors"
              style={{ color: IAH.fgMuted }}
              aria-label="Back to Coach"
            >
              <ArrowLeft size={13} aria-hidden="true" />
              Back to Coach
            </button>
            <span className="text-xs" style={{ color: IAH.fgMuted }}>
              {loading ? "Loading…" : `Generated ${report.generated_at}`}
            </span>
          </div>

          <div
            className="flex items-center gap-4 rounded-2xl border p-4"
            style={{ borderColor: IAH.border, background: IAH.surface }}
          >
            <div className="min-w-0 flex-1">
              <p className="mb-0.5 text-xs" style={{ color: IAH.fgMuted }}>
                AI analysis
              </p>
              <h1
                className="text-balance font-[family-name:var(--font-display)] text-xl font-bold leading-tight"
                style={{ color: IAH.fg }}
              >
                {postTitle}
              </h1>
              <p className="mt-0.5 font-mono text-xs" style={{ color: IAH.fgSubtle }}>
                {postId}
              </p>
            </div>
            <div className="flex-shrink-0 text-right">
              <p className="text-xs" style={{ color: IAH.fgMuted }}>
                Reach
              </p>
              <p className="font-mono text-xl font-semibold" style={{ color: IAH.accent }}>
                {reachLabel}
              </p>
            </div>
          </div>
        </motion.header>

        {!loading && takeaways.length === 0 ? (
          <p className="text-sm" style={{ color: IAH.fgMuted }}>
            No mounted Coach report for this post. Run <strong>Review &amp; goals</strong> from Insights
            to gather a grounded fact pack.
          </p>
        ) : null}

        {topInsights.length > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.08 }}
            className="grid grid-cols-2 gap-3 sm:grid-cols-4"
            aria-label="Key metrics at a glance"
          >
            {topInsights.map((item, i) => (
              <div
                key={i}
                className="flex flex-col gap-1 rounded-xl border px-4 py-3.5"
                style={{ borderColor: IAH.border, background: IAH.bg }}
              >
                <span
                  className="font-mono text-2xl font-bold tabular-nums leading-none"
                  style={{ color: item.color }}
                >
                  {item.label}
                </span>
                <span className="text-xs leading-snug" style={{ color: IAH.fgMuted }}>
                  {item.sublabel}
                </span>
              </div>
            ))}
          </motion.div>
        ) : null}

        {takeaways.length > 0 ? (
          <Section index={0} icon={BarChart2} title="Takeaways">
            <ol className="flex flex-col gap-3" aria-label="AI takeaways">
              {takeaways.map((t, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + i * 0.07, duration: 0.3 }}
                  className="flex items-start gap-3"
                >
                  <span
                    className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold"
                    style={{ background: IAH.accentSoft, color: IAH.accent }}
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <p className="text-sm leading-relaxed" style={{ color: IAH.fgMuted }}>
                    {t}
                  </p>
                </motion.li>
              ))}
            </ol>
          </Section>
        ) : null}

        {(fact_pack.coverage.with_metrics.length > 0 ||
          fact_pack.coverage.without_metrics.length > 0) && (
          <Section index={1} icon={Wifi} title="Coverage & data confidence">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {fact_pack.coverage.with_metrics.map((p) => (
                  <span
                    key={p}
                    className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs"
                    style={{
                      background: "rgba(0,170,111,0.08)",
                      borderColor: "rgba(0,170,111,0.25)",
                      color: IAH.fgMuted
                    }}
                  >
                    <Wifi size={11} aria-hidden="true" style={{ color: IAH.accent }} />
                    {DEST_LABELS[p] ?? p}
                  </span>
                ))}
                {fact_pack.coverage.without_metrics.map((p) => (
                  <span
                    key={p}
                    className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      borderColor: IAH.border,
                      color: IAH.fgSubtle
                    }}
                  >
                    <WifiOff size={11} aria-hidden="true" />
                    {DEST_LABELS[p] ?? p}
                    <span className="opacity-60">— no metrics</span>
                  </span>
                ))}
              </div>
              <p className="text-xs" style={{ color: IAH.fgMuted }}>
                {fact_pack.coverage.stale
                  ? "Data may be stale — run a review to refresh."
                  : "All available metrics are current."}
              </p>
            </div>
          </Section>
        )}

        {fact_pack.cadence.monthly_post_target > 0 || fact_pack.cadence.posts_this_month > 0 ? (
          <Section index={2} icon={Clock} title="Cadence & timing">
            <div className="flex flex-col gap-4">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs" style={{ color: IAH.fgMuted }}>
                    Posts this month
                  </span>
                  <span className="font-mono text-xs" style={{ color: IAH.accent }}>
                    {fact_pack.cadence.posts_this_month} / {fact_pack.cadence.monthly_post_target}
                  </span>
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: IAH.accent }}
                    initial={{ width: 0 }}
                    animate={{
                      width: `${
                        (fact_pack.cadence.posts_this_month /
                          Math.max(fact_pack.cadence.monthly_post_target, 1)) *
                        100
                      }%`
                    }}
                    transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-4">
                <div>
                  <p className="mb-0.5 text-xs" style={{ color: IAH.fgMuted }}>
                    Best window
                  </p>
                  <p className="text-sm font-medium" style={{ color: IAH.fg }}>
                    {fact_pack.cadence.historical_hour_of_day}
                  </p>
                </div>
                <div>
                  <p className="mb-0.5 text-xs" style={{ color: IAH.fgMuted }}>
                    Timing confidence
                  </p>
                  <p
                    className="text-sm font-medium capitalize"
                    style={{
                      color:
                        fact_pack.cadence.timing_confidence === "high"
                          ? IAH.accent
                          : IAH.fgMuted
                    }}
                  >
                    {fact_pack.cadence.timing_confidence}
                  </p>
                </div>
              </div>
            </div>
          </Section>
        ) : null}

        {findings.chips.length > 0 ? (
          <Section index={3} icon={BarChart2} title="What's working">
            <div className="flex flex-col gap-3">
              {findings.chips.map((chip) => (
                <div key={chip.id} className="flex items-start gap-3">
                  <span
                    className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full"
                    style={{ background: IAH.accent, marginTop: 7 }}
                    aria-hidden="true"
                  />
                  <p className="text-sm leading-relaxed" style={{ color: IAH.fgMuted }}>
                    {chip.highlight
                      ? chip.label.replace(chip.highlight.text, chip.highlight.value)
                      : chip.label}
                  </p>
                </div>
              ))}
            </div>
          </Section>
        ) : null}

        {fact_pack.destination_mix.length > 0 ? (
          <Section index={4} icon={Layers} title="Destination mix">
            <div className="flex flex-col gap-3">
              {fact_pack.destination_mix.map((d, i) => (
                <div key={d.dest} className="flex items-center gap-3">
                  <span className="w-24 flex-shrink-0 text-xs" style={{ color: IAH.fgMuted }}>
                    {DEST_LABELS[d.dest] ?? d.dest}
                  </span>
                  <div
                    className="h-1.5 flex-1 overflow-hidden rounded-full"
                    style={{ background: "rgba(255,255,255,0.06)" }}
                  >
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background: i === 0 ? IAH.accent : i === 1 ? "#00856e" : "#005c52"
                      }}
                      initial={{ width: 0 }}
                      animate={{ width: `${d.share}%` }}
                      transition={{ duration: 0.7, delay: 0.5 + i * 0.1, ease: "easeOut" }}
                    />
                  </div>
                  <span
                    className="w-8 text-right font-mono text-xs tabular-nums"
                    style={{ color: IAH.fgMuted }}
                  >
                    {d.share}%
                  </span>
                </div>
              ))}
            </div>
          </Section>
        ) : null}

        {fact_pack.tags.length > 0 ? (
          <Section index={5} icon={Hash} title="Tags & themes">
            <div className="flex flex-wrap gap-2">
              {fact_pack.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border px-3 py-1.5 text-xs"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    borderColor: "rgba(255,255,255,0.09)",
                    color: IAH.fgMuted
                  }}
                >
                  #{tag}
                </span>
              ))}
            </div>
          </Section>
        ) : null}

        {(fact_pack.insight_codes.length > 0 || fact_pack.reason_codes.length > 0) && (
          <motion.div
            custom={6}
            initial="hidden"
            animate="visible"
            variants={sectionVariants}
            className="flex flex-wrap gap-2"
            aria-label="Insight codes"
          >
            {fact_pack.insight_codes.map((code) => (
              <span
                key={code}
                className="rounded border px-2 py-0.5 font-mono text-[10px] tracking-wide"
                style={{
                  background: "rgba(0,170,111,0.05)",
                  borderColor: "rgba(0,170,111,0.15)",
                  color: "rgba(0,170,111,0.6)"
                }}
              >
                {code}
              </span>
            ))}
            {fact_pack.reason_codes.map((code) => (
              <span
                key={code}
                className="rounded border px-2 py-0.5 font-mono text-[10px] tracking-wide"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  borderColor: IAH.border,
                  color: "rgba(156,163,175,0.5)"
                }}
              >
                {code}
              </span>
            ))}
          </motion.div>
        )}

        <motion.div
          custom={7}
          initial="hidden"
          animate="visible"
          variants={sectionVariants}
          className="flex flex-col gap-3 pb-12 sm:flex-row"
        >
          <button
            type="button"
            onClick={() => router.push("/studio/analytics")}
            className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold transition-all hover:opacity-90"
            style={{ background: IAH.accent, color: IAH.onAccent }}
            aria-label="Frame next posts from this report"
          >
            <ArrowRight size={15} aria-hidden="true" />
            Frame next posts from this report
          </button>
          <button
            type="button"
            onClick={() => router.push("/studio/analytics")}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-6 py-3.5 text-sm font-medium transition-all"
            style={{ borderColor: IAH.border, color: IAH.fgMuted }}
            aria-label="Edit brief"
          >
            <FileEdit size={14} aria-hidden="true" />
            Edit brief
          </button>
        </motion.div>
      </div>
    </div>
  );
}

function Fallback() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--relay-bg,#0a0a0a)] text-sm text-[var(--relay-fg-muted,#9ca3af)]">
      Loading report…
    </div>
  );
}

export default function AnalyticsReportPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--relay-bg,#0a0a0a)]">
      <Suspense fallback={<Fallback />}>
        <StudioRouteGuard>
          <ReportContent />
        </StudioRouteGuard>
      </Suspense>
    </div>
  );
}
