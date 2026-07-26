"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Eye,
  MessageCircle,
  Star
} from "lucide-react";
import type { CreatorPostPerformanceData } from "@/lib/relay-api";
import {
  actionSignalForPost,
  badgeStyles,
  buildRadarPostMetrics,
  engagementSaturationShare,
  formatRadarNumber,
  formatRadarPercent,
  postPerformanceBadge,
  summarizeRadarCohort,
  type RadarPerformanceBadge,
  type RadarPostMetric
} from "./analytics-radar-signals";

type TimeScale = "7d" | "30d" | "90d";
type PerformanceViewMode = "graph" | "table";

type SignalLayer = "reach" | "views" | "engage";

const SCALE_DAYS: Record<TimeScale, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90
};

function timeScaleLabel(scale: TimeScale): string {
  return scale === "7d" ? "Week" : scale === "30d" ? "Month" : "Quarter";
}

function compactReach(value: number): string {
  if (value >= 1000) return `${Math.round(value / 100) / 10}k`;
  return formatRadarNumber(value);
}

function SignalLayersLegend({
  layers,
  onToggle
}: {
  layers: Record<SignalLayer, boolean>;
  onToggle: (layer: SignalLayer) => void;
}) {
  const items: Array<{ id: SignalLayer; label: string; hint: string; color: string }> = [
    { id: "reach", label: "Reach", hint: "Outer exposure", color: "#34d399" },
    { id: "views", label: "Views", hint: "Opened / consumed", color: "#2dd4bf" },
    { id: "engage", label: "Engage", hint: "Response inside views", color: "#f0fdf4" }
  ];

  return (
    <div className="rounded-2xl border border-[rgba(52,211,153,0.12)] bg-[rgba(0,0,0,0.38)] p-2.5 shadow-[0_18px_40px_rgba(0,0,0,0.28)] backdrop-blur-sm">
      <p className="px-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-[rgba(240,253,244,0.5)]">
        Exposure
      </p>
      <div className="mt-2 flex flex-col items-start gap-1.5">
        {items.map((item) => {
          const active = layers[item.id];
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(item.id)}
              className="flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-left transition-colors hover:bg-[rgba(255,255,255,0.035)]"
              style={{
                background: active ? "rgba(0,0,0,0.34)" : "rgba(0,0,0,0.14)",
                borderColor: active ? `${item.color}55` : "rgba(255,255,255,0.055)",
                color: active ? item.color : "rgba(240,253,244,0.42)"
              }}
              title={item.hint}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{
                  background: item.color,
                  opacity: active ? 1 : 0.35,
                  boxShadow: active ? `0 0 8px ${item.color}88` : undefined
                }}
              />
              <span className="text-[10px] font-semibold">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RadarRadialChart({
  metrics,
  cohort,
  activeIndex,
  lockedIndex,
  layers,
  onHover,
  onLock,
  size = 580
}: {
  metrics: RadarPostMetric[];
  cohort: ReturnType<typeof summarizeRadarCohort>;
  activeIndex: number | null;
  lockedIndex: number | null;
  layers: Record<SignalLayer, boolean>;
  onHover: (index: number | null) => void;
  onLock: (index: number | null) => void;
  size?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const centerRadius = size * 0.135;
  const minSpoke = size * 0.052;
  const maxSpoke = size * 0.25;
  const guideRadius = size * 0.435;
  const activeMetric = activeIndex == null ? null : metrics[activeIndex] ?? null;

  if (metrics.length === 0) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-3xl border border-dashed border-[#1F1F1F] bg-[#050505]">
        <p className="max-w-[220px] text-center text-xs leading-relaxed text-[#777]">
          Waiting for post performance data. The signal map will populate as posts collect impressions.
        </p>
      </div>
    );
  }

  const scaleRings = [
    { scale: 0.38, label: "Avg", value: cohort.scaleAvgReach },
    { scale: 0.68, label: "", value: null },
    { scale: 1, label: "High", value: cohort.scaleHighReach }
  ];

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Experimental post signal map with ${metrics.length} posts. Reach is the outer green spoke, Views is the teal bar inside it, and Engagement is the bright fill within Views.`}
        className="overflow-visible"
      >
        <defs>
          <radialGradient id="radar-preview-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#052e16" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
          <filter id="radar-preview-glow" x="0" y="0" width={size} height={size} filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="radar-preview-active-glow" x="0" y="0" width={size} height={size} filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="5.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle cx={cx} cy={cy} r={guideRadius + 2} fill="url(#radar-preview-bg)" />
        {Array.from({ length: 24 }).map((_, index) => {
          const angle = -Math.PI / 2 + (index * 2 * Math.PI) / 24;
          return (
            <line
              key={`guide-${index}`}
              x1={cx}
              y1={cy}
              x2={cx + Math.cos(angle) * guideRadius}
              y2={cy + Math.sin(angle) * guideRadius}
              stroke="rgba(52,211,153,0.045)"
              strokeWidth={0.55}
            />
          );
        })}
        {scaleRings.map(({ scale, label, value }) => {
          const ringR = centerRadius + maxSpoke * scale;
          return (
            <g key={scale}>
              <circle
                cx={cx}
                cy={cy}
                r={ringR}
                fill="none"
                stroke="rgba(52,211,153,0.07)"
                strokeWidth={0.75}
              />
              {label ? (
                <>
                  <text
                    x={cx + 5}
                    y={cy - ringR - 6}
                    fontSize={10}
                    fill="rgba(240,253,244,0.34)"
                    letterSpacing="0.08em"
                  >
                    {label}
                  </text>
                  {value != null ? (
                    <text x={cx + 38} y={cy - ringR - 6} fontSize={10} fill="rgba(52,211,153,0.48)">
                      {compactReach(value)}
                    </text>
                  ) : null}
                </>
              ) : null}
            </g>
          );
        })}

        {metrics.map((metric, index) => {
          const isActive = activeIndex === index;
          const isDimmed = activeIndex != null && !isActive;
          const length = minSpoke + metric.normalizedReach * (maxSpoke - minSpoke);
          const viewsShare = metric.impressions > 0 ? Math.min(metric.seen / metric.impressions, 1) : 0;
          const viewsLength = metric.seen > 0 ? Math.max(10, length * viewsShare) : 0;
          const startR = centerRadius + 8;
          const endR = startR + length;
          const viewsEndR = layers.views ? startR + viewsLength : startR;
          const unitX = Math.cos(metric.angle);
          const unitY = Math.sin(metric.angle);
          const x1 = cx + unitX * startR;
          const y1 = cy + unitY * startR;
          const x2 = cx + unitX * endR;
          const y2 = cy + unitY * endR;
          const vx2 = cx + unitX * viewsEndR;
          const vy2 = cy + unitY * viewsEndR;
          const saturation = engagementSaturationShare(metric.seen, metric.likes, metric.comments);
          const engagementFillLength =
            layers.engage && layers.views && viewsLength > 0 && saturation > 0 ? viewsLength * saturation : 0;
          const engagementEndR = startR + engagementFillLength;
          const ex2 = cx + unitX * engagementEndR;
          const ey2 = cy + unitY * engagementEndR;
          const badge = postPerformanceBadge(metric, metrics);
          const hitLen = length + 28;
          const hitX = cx + unitX * (startR - 12);
          const hitY = cy + unitY * (startR - 12);
          const hitAngle = (metric.angle * 180) / Math.PI;
          const labelR = Math.min(guideRadius - 10, endR + 18);
          const labelX = cx + unitX * labelR;
          const labelY = cy + unitY * labelR;

          return (
            <g
              key={metric.id}
              role="button"
              tabIndex={0}
              aria-label={`${metric.title}, ${formatRadarNumber(metric.impressions)} reach, ${formatRadarPercent(metric.viewRate)} view rate, ${formatRadarPercent(metric.engagementRate)} engagement rate`}
              aria-pressed={lockedIndex === index}
              onMouseEnter={() => onHover(index)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onLock(lockedIndex === index ? null : index)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onLock(lockedIndex === index ? null : index);
                }
              }}
              className="outline-none"
              style={{ cursor: "pointer" }}
            >
              {isActive ? (
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#34d399"
                  strokeWidth={layers.reach ? 15 : 0}
                  strokeLinecap="round"
                  opacity={layers.reach ? 0.14 : 0}
                  filter="url(#radar-preview-active-glow)"
                />
              ) : null}

              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={isActive ? "#6ee7b7" : "#34d399"}
                strokeWidth={layers.reach ? (isActive ? 2.8 : 2.2) : 0}
                strokeLinecap="round"
                opacity={layers.reach ? (isActive ? 1 : isDimmed ? 0.18 : 0.62) : 0}
                filter={isActive && layers.reach ? "url(#radar-preview-glow)" : undefined}
              />

              <line
                x1={x1}
                y1={y1}
                x2={vx2}
                y2={vy2}
                stroke="#115e59"
                strokeWidth={layers.views ? (isActive ? 14 : 11) : 0}
                strokeLinecap="round"
                opacity={layers.views ? (isDimmed ? 0.35 : 0.82) : 0}
              />
              <line
                x1={x1}
                y1={y1}
                x2={vx2}
                y2={vy2}
                stroke="#2dd4bf"
                strokeWidth={layers.views ? (isActive ? 11 : 8.5) : 0}
                strokeLinecap="round"
                opacity={layers.views ? (isDimmed ? 0.35 : 0.92) : 0}
                filter={isActive && layers.views ? "url(#radar-preview-glow)" : undefined}
              />

              {layers.engage && engagementFillLength > 0 ? (
                <g pointerEvents="none">
                  <line
                    x1={x1}
                    y1={y1}
                    x2={ex2}
                    y2={ey2}
                    stroke="#ffffff"
                    strokeWidth={isActive ? 4 : 3}
                    strokeLinecap="round"
                    opacity={isActive ? 1 : isDimmed ? 0.24 : 0.78}
                    filter={isActive ? "url(#radar-preview-glow)" : undefined}
                  />
                  <circle
                    cx={ex2}
                    cy={ey2}
                    r={isActive ? 4 : 3.1}
                    fill="#f0fdf4"
                    opacity={isActive ? 0.98 : isDimmed ? 0.2 : 0.72}
                    filter={isActive ? "url(#radar-preview-glow)" : undefined}
                  />
                </g>
              ) : null}

              {isActive && badge ? (
                <text
                  x={vx2 + unitX * 18}
                  y={vy2 + unitY * 18}
                  fontSize={10}
                  fontWeight={700}
                  fill="#f0fdf4"
                  opacity={0.92}
                >
                  {badge.label}
                </text>
              ) : null}

              <g pointerEvents="none" opacity={isActive ? 1 : isDimmed ? 0.22 : 0.5}>
                <circle
                  cx={labelX}
                  cy={labelY}
                  r={isActive ? 10 : 8.5}
                  fill={isActive ? "rgba(52,211,153,0.18)" : "rgba(0,0,0,0.28)"}
                  stroke={isActive ? "rgba(52,211,153,0.5)" : "rgba(240,253,244,0.16)"}
                  strokeWidth={0.8}
                />
                <text
                  x={labelX}
                  y={labelY + 0.5}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={isActive ? 8.5 : 7.5}
                  fontWeight={700}
                  fill={isActive ? "#9bf0c4" : "rgba(240,253,244,0.62)"}
                  letterSpacing="0.02em"
                >
                  {String(index + 1).padStart(2, "0")}
                </text>
              </g>

              <rect
                x={0}
                y={-16}
                width={hitLen}
                height={32}
                fill="transparent"
                transform={`translate(${hitX},${hitY}) rotate(${hitAngle})`}
              />
            </g>
          );
        })}

        <circle cx={cx} cy={cy} r={centerRadius} fill="rgba(5,10,8,0.92)" stroke="rgba(52,211,153,0.18)" />
        {activeMetric ? (
          <>
            <text x={cx} y={cy - 24} textAnchor="middle" fontSize={12} fill="rgba(240,253,244,0.56)" letterSpacing="0.08em">
              SELECTED
            </text>
            <foreignObject x={cx - 72} y={cy - 10} width={144} height={42} style={{ overflow: "visible", pointerEvents: "none" }}>
              <div className="line-clamp-2 text-center text-xs font-semibold leading-tight text-[#f0fdf4]">
                {activeMetric.title}
              </div>
            </foreignObject>
            <text x={cx} y={cy + 36} textAnchor="middle" fontSize={24} fontWeight={700} fill="#34d399">
              {formatRadarNumber(activeMetric.impressions)}
            </text>
            <text x={cx} y={cy + 56} textAnchor="middle" fontSize={11} fill="rgba(52,211,153,0.58)" letterSpacing="0.12em">
              REACH
            </text>
          </>
        ) : (
          <>
            <text x={cx} y={cy - 26} textAnchor="middle" fontSize={40} fontWeight={700} fill="#f0fdf4">
              {metrics.length}
            </text>
            <text x={cx} y={cy - 4} textAnchor="middle" fontSize={14} fill="rgba(240,253,244,0.52)" letterSpacing="0.12em">
              POSTS
            </text>
            <text x={cx} y={cy + 30} textAnchor="middle" fontSize={24} fontWeight={700} fill="#34d399">
              {formatRadarNumber(cohort.totalReach)}
            </text>
            <text x={cx} y={cy + 52} textAnchor="middle" fontSize={11} fill="rgba(52,211,153,0.58)" letterSpacing="0.12em">
              TOTAL REACH
            </text>
            <text x={cx} y={cy + 70} textAnchor="middle" fontSize={10} fill="rgba(191,219,254,0.72)">
              {formatRadarPercent(cohort.avgViewRate)} avg view rate
            </text>
          </>
        )}
      </svg>
    </div>
  );
}

function BadgePill({ badge }: { badge: RadarPerformanceBadge }) {
  const styles = badgeStyles(badge.tone);
  return (
    <span
      className="rounded-full border px-2 py-1 text-[10px] font-semibold backdrop-blur"
      style={styles}
      title={badge.detail}
    >
      {badge.label}
    </span>
  );
}

function RadarDetailPanel({
  metrics,
  cohort,
  activeIndex,
  locked,
  onUnlock
}: {
  metrics: RadarPostMetric[];
  cohort: ReturnType<typeof summarizeRadarCohort>;
  activeIndex: number | null;
  locked: boolean;
  onUnlock: () => void;
}) {
  const active = activeIndex == null ? null : metrics[activeIndex] ?? null;
  const topPost = [...metrics].sort((a, b) => b.impressions - a.impressions)[0] ?? null;

  if (!active) {
    if (!topPost) {
      return (
        <div className="flex h-[680px] items-center justify-center overflow-hidden rounded-2xl border border-[rgba(52,211,153,0.1)] bg-[rgba(5,10,8,0.7)] p-6">
          <p className="max-w-[240px] text-center text-xs leading-relaxed text-[#777]">
            Hover a spoke to inspect reach, views, and engagement rate. Click to lock a post in place.
          </p>
        </div>
      );
    }

    const badge = postPerformanceBadge(topPost, metrics);
    const published = topPost.publishedAt
      ? new Date(topPost.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "Date unknown";

    return (
      <div className="flex h-[680px] flex-col gap-4 overflow-hidden rounded-2xl border border-[rgba(52,211,153,0.1)] bg-[rgba(5,10,8,0.7)] p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[rgba(240,253,244,0.42)]">
            Cohort snapshot
          </p>
          <span className="text-[10px] text-[rgba(240,253,244,0.34)]">
            {cohort.aboveAvgReachCount} posts at or above median reach
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-[rgba(52,211,153,0.12)] bg-[rgba(10,21,16,0.72)] p-3">
            <p className="text-[9px] uppercase tracking-[0.12em] text-[#777]">Avg view rate</p>
            <p className="mt-1 font-mono text-2xl font-bold text-[#2dd4bf]">{formatRadarPercent(cohort.avgViewRate)}</p>
          </div>
          <div className="rounded-2xl border border-[rgba(52,211,153,0.12)] bg-[rgba(10,21,16,0.72)] p-3">
            <p className="text-[9px] uppercase tracking-[0.12em] text-[#777]">Avg engage</p>
            <p className="mt-1 font-mono text-2xl font-bold text-[#f0fdf4]">{formatRadarPercent(cohort.avgEngagementRate)}</p>
          </div>
          <div className="rounded-2xl border border-[rgba(52,211,153,0.12)] bg-[rgba(10,21,16,0.72)] p-3">
            <p className="text-[9px] uppercase tracking-[0.12em] text-[#777]">Top reach</p>
            <p className="mt-1 font-mono text-2xl font-bold text-[#34d399]">{formatRadarNumber(cohort.scaleHighReach)}</p>
          </div>
        </div>
        <Link
          href={topPost.href}
          className="group relative min-h-0 flex-1 overflow-hidden rounded-3xl border border-[#2a7a4a]/25 bg-[#07100c]"
        >
          {topPost.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={topPost.thumbnailUrl} alt="" aria-hidden="true" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[rgba(52,211,153,0.06)]">
              <BarChart3 className="h-10 w-10 text-[#4a8c6e]" aria-hidden />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#020806] via-[#020806]/35 to-transparent" aria-hidden />
          {badge ? (
            <span className="absolute left-3 top-3">
              <BadgePill badge={badge} />
            </span>
          ) : null}
          <div className="absolute inset-x-0 bottom-0 p-5">
            <p className="line-clamp-2 text-xl font-semibold leading-tight text-[#f0fdf4]">{topPost.title}</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[rgba(240,253,244,0.5)]">
              {published} · {formatRadarNumber(topPost.impressions)} reach
            </p>
          </div>
        </Link>
        <p className="text-[10px] leading-relaxed text-[#666]">
          Outer green = reach. Teal bar = views. Bright fill = engagement inside those views.
        </p>
      </div>
    );
  }

  const badge = postPerformanceBadge(active, metrics);
  const published = active.publishedAt
    ? new Date(active.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "Date unknown";

  return (
    <div className="flex h-[680px] flex-col gap-4 overflow-hidden rounded-2xl border border-[rgba(52,211,153,0.14)] bg-[rgba(5,10,8,0.78)] p-4 shadow-[0_0_24px_rgba(52,211,153,0.06)]">
      <div className="relative h-[180px] overflow-hidden rounded-3xl border border-[#2a7a4a]/25 bg-[#07100c]">
        {active.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={active.thumbnailUrl} alt="" aria-hidden="true" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[rgba(52,211,153,0.06)]">
            <BarChart3 className="h-8 w-8 text-[#4a8c6e]" aria-hidden />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#020806] via-[#020806]/35 to-transparent" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 p-3">
          <p className="line-clamp-1 text-lg font-semibold text-[#f0fdf4]">{active.title}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[rgba(240,253,244,0.5)]">
            {published} · {active.source === "live" ? "Insights CSV" : active.source === "derived" ? "Relay post data" : "Mock preview"}
          </p>
        </div>
        {badge ? (
          <span className="absolute left-2 top-2">
            <BadgePill badge={badge} />
          </span>
        ) : null}
        {locked ? (
          <button
            type="button"
            onClick={onUnlock}
            className="absolute right-2 top-2 rounded-xl border border-[#2a7a4a]/40 bg-[#020806]/80 px-2 py-1 text-[10px] font-semibold text-[#9bf0c4] backdrop-blur"
          >
            Unlock
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-[#2a7a4a]/15 bg-[#0a1510]/70 p-3">
        <div>
          <p className="flex items-center gap-1 text-[10px] text-[#777]"><Eye className="h-3 w-3" /> Reach</p>
          <p className="mt-0.5 font-mono text-xl font-bold text-[#34d399]">{formatRadarNumber(active.impressions)}</p>
        </div>
        <div>
          <p className="flex items-center gap-1 text-[10px] text-[#777]"><Eye className="h-3 w-3" /> Views</p>
          <p className="mt-0.5 font-mono text-xl font-bold text-[#2dd4bf]">{formatRadarNumber(active.seen)}</p>
        </div>
        <div>
          <p className="flex items-center gap-1 text-[10px] text-[#777]"><Star className="h-3 w-3" /> View rate</p>
          <p className="mt-0.5 font-mono text-xl font-bold text-[#f0fdf4]">{formatRadarPercent(active.viewRate)}</p>
        </div>
        <div>
          <p className="flex items-center gap-1 text-[10px] text-[#777]"><MessageCircle className="h-3 w-3" /> Engage rate</p>
          <p className="mt-0.5 font-mono text-xl font-bold text-[#bfdbfe]">{formatRadarPercent(active.engagementRate)}</p>
        </div>
        <div>
          <p className="text-[10px] text-[#777]">Signals</p>
          <p className="mt-0.5 font-mono text-xl font-bold text-[#f0fdf4]">{formatRadarNumber(active.signals)}</p>
        </div>
        <div>
          <p className="text-[10px] text-[#777]">Vs cohort avg</p>
          <p className="mt-0.5 font-mono text-xl font-bold text-[#9bf0c4]">
            {active.viewRate >= cohort.avgViewRate ? "+" : ""}
            {formatRadarPercent(active.viewRate - cohort.avgViewRate)}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-[#6a5a2a]/50 bg-[#1a1808] p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#d4af37]">Action signal</p>
        <p className="mt-1 text-[11px] leading-snug text-[#C8BFA6]">{actionSignalForPost(active, metrics)}</p>
        {badge ? <p className="mt-1 text-[10px] text-[rgba(240,253,244,0.42)]">{badge.detail}</p> : null}
      </div>

      <Link
        href={active.href}
        className="mt-auto flex h-8 items-center justify-center gap-2 rounded-xl border border-[#2a7a4a]/60 bg-[#0D3D2C] text-xs font-semibold text-[#9bf0c4] hover:bg-[#124a36]"
      >
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        Open post preview
      </Link>
    </div>
  );
}

function RadarPerformanceTable({
  metrics,
  activeIndex,
  lockedIndex,
  onHover,
  onLock
}: {
  metrics: RadarPostMetric[];
  activeIndex: number | null;
  lockedIndex: number | null;
  onHover: (index: number | null) => void;
  onLock: (index: number | null) => void;
}) {
  return (
    <div className="flex h-[680px] w-[680px] shrink-0 flex-col overflow-hidden rounded-3xl border border-[rgba(52,211,153,0.1)] bg-[rgba(5,10,8,0.62)] p-4">
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[rgba(240,253,244,0.42)]">
          Ranked posts
        </p>
        <p className="text-[10px] text-[rgba(240,253,244,0.28)]">Reach · Views · Engage rate</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="grid gap-1.5">
          {metrics.map((metric, index) => {
            const isActive = activeIndex === index;
            const badge = postPerformanceBadge(metric, metrics);
            const published = metric.publishedAt
              ? new Date(metric.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
              : "Date unknown";

            return (
              <button
                key={metric.id}
                type="button"
                aria-pressed={lockedIndex === index}
                onMouseEnter={() => onHover(index)}
                onMouseLeave={() => onHover(null)}
                onClick={() => onLock(lockedIndex === index ? null : index)}
                className="grid grid-cols-[minmax(0,1fr)_72px_72px_64px] items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all duration-150"
                style={{
                  background: isActive ? "rgba(13,61,44,0.48)" : "rgba(255,255,255,0.025)",
                  borderColor: isActive ? "rgba(52,211,153,0.34)" : "rgba(255,255,255,0.055)",
                  boxShadow: isActive ? "0 0 18px rgba(52,211,153,0.1)" : "none"
                }}
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="font-mono text-[10px] text-[rgba(52,211,153,0.62)]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <p className="truncate text-xs font-semibold text-[#f0fdf4]">{metric.title}</p>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[10px] text-[rgba(240,253,244,0.34)]">{published}</span>
                    {badge ? (
                      <span
                        className="rounded-full border px-1.5 py-0.5 text-[9px] font-semibold"
                        style={badgeStyles(badge.tone)}
                      >
                        {badge.label}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-[rgba(240,253,244,0.3)]">Reach</p>
                  <p className="font-mono text-xs font-bold text-[#34d399]">{formatRadarNumber(metric.impressions)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-[rgba(240,253,244,0.3)]">Views</p>
                  <p className="font-mono text-xs font-bold text-[#2dd4bf]">{formatRadarNumber(metric.seen)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-[rgba(240,253,244,0.3)]">Eng.</p>
                  <p className="font-mono text-xs font-bold text-[#bfdbfe]">{formatRadarPercent(metric.engagementRate)}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RankedPostStrip({
  metrics,
  activeIndex,
  lockedIndex,
  onHover,
  onLock
}: {
  metrics: RadarPostMetric[];
  activeIndex: number | null;
  lockedIndex: number | null;
  onHover: (index: number | null) => void;
  onLock: (index: number | null) => void;
}) {
  return (
    <div className="absolute inset-x-4 bottom-4 z-20 rounded-2xl border border-[rgba(52,211,153,0.12)] bg-[rgba(0,0,0,0.42)] p-2 shadow-[0_18px_40px_rgba(0,0,0,0.28)] backdrop-blur-sm">
      <div className="mb-1.5 flex items-center justify-between gap-3 px-1">
        <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[rgba(240,253,244,0.46)]">
          Ranked posts
        </p>
        <p className="text-[9px] text-[rgba(240,253,244,0.3)]">Numbers match spokes</p>
      </div>
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${Math.max(metrics.length, 1)}, minmax(0, 1fr))` }}
      >
        {metrics.map((metric, index) => {
          const active = activeIndex === index;
          const locked = lockedIndex === index;
          const badge = postPerformanceBadge(metric, metrics);
          return (
            <button
              key={metric.id}
              type="button"
              aria-pressed={locked}
              onMouseEnter={() => onHover(index)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onLock(locked ? null : index)}
              className="min-w-0 rounded-xl border p-2 text-left transition-all duration-150"
              style={{
                background: active ? "rgba(13,61,44,0.58)" : "rgba(255,255,255,0.025)",
                borderColor: active ? "rgba(52,211,153,0.42)" : "rgba(255,255,255,0.06)",
                boxShadow: active ? "0 0 18px rgba(52,211,153,0.13)" : "none"
              }}
              title={metric.title}
            >
              <div className="flex min-w-0 gap-2">
                <div
                  className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-[rgba(52,211,153,0.14)] bg-[rgba(52,211,153,0.06)]"
                  style={
                    metric.thumbnailUrl
                      ? {
                          backgroundImage: `linear-gradient(to top, rgba(2,8,6,0.58), transparent), url(${metric.thumbnailUrl})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center"
                        }
                      : undefined
                  }
                  aria-hidden="true"
                >
                  <span className="absolute left-1 top-1 rounded-full bg-[#020806]/80 px-1 font-mono text-[8px] font-bold text-[#9bf0c4]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <p className="truncate text-[10px] font-semibold leading-tight text-[#f0fdf4]">{metric.title}</p>
                    {badge ? (
                      <span
                        className="hidden max-w-[64px] shrink-0 truncate rounded-full border px-1.5 py-0.5 text-[8px] font-semibold min-[1280px]:inline"
                        style={badgeStyles(badge.tone)}
                      >
                        {badge.label}
                      </span>
                    ) : null}
                  </div>
                  <p
                    className="mt-1 flex items-center gap-1 truncate font-mono text-[9px] text-[rgba(240,253,244,0.42)]"
                    title={`${formatRadarNumber(metric.impressions)} reach`}
                  >
                    <BarChart3 className="h-2.5 w-2.5 shrink-0 text-[#34d399]" aria-hidden />
                    <span className="truncate text-[#34d399]">{formatRadarNumber(metric.impressions)}</span>
                  </p>
                  <p className="flex items-center gap-1.5 truncate font-mono text-[9px] text-[rgba(240,253,244,0.34)]">
                    <span
                      className="inline-flex min-w-0 items-center gap-1"
                      title={`${formatRadarPercent(metric.viewRate)} view rate`}
                    >
                      <Eye className="h-2.5 w-2.5 shrink-0 text-[#2dd4bf]" aria-hidden />
                      <span className="truncate text-[#2dd4bf]">{formatRadarPercent(metric.viewRate)}</span>
                    </span>
                    <span
                      className="inline-flex min-w-0 items-center gap-1"
                      title={`${formatRadarPercent(metric.engagementRate)} engagement rate`}
                    >
                      <MessageCircle className="h-2.5 w-2.5 shrink-0 text-[#bfdbfe]" aria-hidden />
                      <span className="truncate text-[#bfdbfe]">{formatRadarPercent(metric.engagementRate)}</span>
                    </span>
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AnalyticsRadarPreview({
  performance
}: {
  performance: CreatorPostPerformanceData | null;
}) {
  const [scale, setScale] = useState<TimeScale>("30d");
  const [viewMode, setViewMode] = useState<PerformanceViewMode>("graph");
  const [layers, setLayers] = useState<Record<SignalLayer, boolean>>({
    reach: true,
    views: true,
    engage: true
  });
  const [chartSize, setChartSize] = useState(520);
  const [hoveredPostIndex, setHoveredPostIndex] = useState<number | null>(null);
  const [lockedPostIndex, setLockedPostIndex] = useState<number | null>(null);

  const days = SCALE_DAYS[scale];
  const metrics = useMemo(() => buildRadarPostMetrics(performance, days), [performance, days]);
  const cohort = useMemo(() => summarizeRadarCohort(metrics), [metrics]);
  const activePostIndex = lockedPostIndex ?? hoveredPostIndex;

  useEffect(() => {
    setHoveredPostIndex(null);
    setLockedPostIndex(null);
  }, [scale]);

  useEffect(() => {
    function updateChartSize() {
      const width = window.innerWidth;
      if (width < 1050) {
        setChartSize(430);
      } else if (width < 1320) {
        setChartSize(540);
      } else if (width < 1640) {
        setChartSize(620);
      } else {
        setChartSize(680);
      }
    }

    updateChartSize();
    window.addEventListener("resize", updateChartSize);
    return () => window.removeEventListener("resize", updateChartSize);
  }, []);

  const toggleLayer = (layer: SignalLayer) => {
    setLayers((current) => ({ ...current, [layer]: !current[layer] }));
  };

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-[#245c45]/35 bg-[#020806] shadow-[0_18px_60px_-46px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.025)]"
      data-testid="analytics-radar-preview"
      aria-labelledby="analytics-radar-preview-heading"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_45%,rgba(45,106,79,0.12),transparent_50%)]" aria-hidden />
      <div className="relative z-10 flex min-h-[calc(100vh-160px)] flex-col gap-6 p-4 sm:p-5 xl:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9bf0c4]">
              Experimental preview
            </p>
            <h2
              id="analytics-radar-preview-heading"
              className="mt-1 text-base font-semibold leading-tight text-[#f0fdf4]"
            >
              Radar signal map
            </h2>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-[rgba(240,253,244,0.42)]">
              Non-destructive test surface for clearer Reach, Views, and Engagement layering. Production analytics at{" "}
              <Link href="/studio/analytics" className="text-[#9bf0c4] hover:underline">
                /studio/analytics
              </Link>{" "}
              remains unchanged.
            </p>
          </div>
        </div>

        <div className="grid flex-1 items-center gap-5 [grid-template-columns:minmax(390px,1fr)_minmax(300px,0.85fr)] xl:gap-8 2xl:gap-10">
          <div className="relative flex h-[680px] min-w-0 items-center justify-center overflow-hidden rounded-[2rem] border border-[rgba(52,211,153,0.06)] bg-[rgba(0,0,0,0.1)] p-4">
            <div className="absolute left-4 top-4 z-20">
              <SignalLayersLegend layers={layers} onToggle={toggleLayer} />
            </div>
            {viewMode === "graph" ? (
              <RankedPostStrip
                metrics={metrics}
                activeIndex={activePostIndex}
                lockedIndex={lockedPostIndex}
                onHover={setHoveredPostIndex}
                onLock={setLockedPostIndex}
              />
            ) : null}
            {viewMode === "graph" ? (
              <div className="-translate-y-8">
                <RadarRadialChart
                  metrics={metrics}
                  cohort={cohort}
                  activeIndex={activePostIndex}
                  lockedIndex={lockedPostIndex}
                  layers={layers}
                  onHover={setHoveredPostIndex}
                  onLock={setLockedPostIndex}
                  size={chartSize}
                />
              </div>
            ) : (
              <RadarPerformanceTable
                metrics={metrics}
                activeIndex={activePostIndex}
                lockedIndex={lockedPostIndex}
                onHover={setHoveredPostIndex}
                onLock={setLockedPostIndex}
              />
            )}
          </div>

          <div className="min-w-0">
            <RadarDetailPanel
              metrics={metrics}
              cohort={cohort}
              activeIndex={activePostIndex}
              locked={lockedPostIndex != null}
              onUnlock={() => setLockedPostIndex(null)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-1 flex items-center rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.035)] p-0.5">
              {(["graph", "table"] as PerformanceViewMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={viewMode === mode}
                  onClick={() => {
                    setViewMode(mode);
                    setHoveredPostIndex(null);
                    setLockedPostIndex(null);
                  }}
                  className="rounded-md px-2.5 py-0.5 text-xs font-medium capitalize transition-all duration-150"
                  style={{
                    background: viewMode === mode ? "rgba(52,211,153,0.15)" : "transparent",
                    color: viewMode === mode ? "#34d399" : "rgba(240,253,244,0.42)"
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
            {(["7d", "30d", "90d"] as TimeScale[]).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={scale === item}
                onClick={() => setScale(item)}
                className="rounded-lg px-3 py-1 text-xs font-medium transition-all duration-150"
                style={{
                  background: scale === item ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.04)",
                  border: scale === item ? "1px solid rgba(52,211,153,0.35)" : "1px solid rgba(255,255,255,0.08)",
                  color: scale === item ? "#34d399" : "rgba(240,253,244,0.45)"
                }}
              >
                {timeScaleLabel(item)}
              </button>
            ))}
          </div>
          <span className="text-xs text-[rgba(240,253,244,0.3)]">Metrics are estimates · preview only</span>
        </div>
      </div>
    </section>
  );
}
