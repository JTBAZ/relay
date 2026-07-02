import {
  METRIC_STATUS_UI,
  resolveMetricDisplay,
  type MetricStatusBadgeTone,
  type PlatformMetricFreshnessState,
  type PlatformMetricStatus
} from "@/lib/platform-metric-status";
import {
  formatTrendDeltaLabel,
  trendToneClass,
  type PlatformMetricTrends
} from "@/lib/platform-metric-trends";

export type PlatformMetricCardModel = {
  key: string;
  label: string;
  definition: string;
  formula: string;
  source: string;
  status: PlatformMetricStatus;
  phase: string;
  value: number | string | null;
  displayValue?: string;
  freshnessState?: PlatformMetricFreshnessState;
  trends?: PlatformMetricTrends;
};

const badgeToneClass: Record<MetricStatusBadgeTone, string> = {
  neutral: "border-[#3a3a3a] bg-[#1a1a1a] text-[#d6d6d6]",
  warning: "border-[#6a5420] bg-[#211a08] text-[#f0ce7a]",
  info: "border-[#24506a] bg-[#081a22] text-[#8bc9e8]",
  success: "border-[#236346] bg-[#061c13] text-[#7bd6a2]",
  muted: "border-[#2b2b2b] bg-[#141414] text-[#8f8f8f]"
};

const freshnessLabel: Record<PlatformMetricFreshnessState, string> = {
  unknown: "Freshness unknown",
  fresh: "Fresh",
  stale: "Stale",
  broken: "Broken"
};

function StatusBadge({ status }: { status: PlatformMetricStatus }) {
  const spec = METRIC_STATUS_UI[status];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${badgeToneClass[spec.badgeTone]}`}
    >
      {spec.badgeLabel}
    </span>
  );
}

function FreshnessBadge({ state }: { state: PlatformMetricFreshnessState }) {
  const tone =
    state === "fresh"
      ? "border-[#24506a] bg-[#081a22] text-[#8bc9e8]"
      : state === "stale"
        ? "border-[#6a5420] bg-[#211a08] text-[#f0ce7a]"
        : state === "broken"
          ? "border-[#6a2a2a] bg-[#220808] text-[#f0a8a8]"
          : "border-[#2b2b2b] bg-[#141414] text-[#8f8f8f]";

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${tone}`}>
      {freshnessLabel[state]}
    </span>
  );
}

function TrendRow({ trends }: { trends: PlatformMetricTrends }) {
  const rows = [
    { label: "DoD", delta: trends.dod },
    { label: "WoW", delta: trends.wow },
    { label: "MoM", delta: trends.mom }
  ].filter((row) => row.delta.sufficientHistory && formatTrendDeltaLabel(row.delta));

  if (rows.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {rows.map((row) => {
        const text = formatTrendDeltaLabel(row.delta);
        if (!text) return null;
        return (
          <span
            key={row.label}
            className={`inline-flex items-center gap-1 rounded-md border border-[#2a2a2a] bg-[#121212] px-2 py-1 text-[11px] ${trendToneClass(row.delta.direction)}`}
          >
            <span className="text-[#777]">{row.label}</span>
            <span className="font-medium">{text}</span>
          </span>
        );
      })}
    </div>
  );
}

export default function PlatformMetricCard({
  metric,
  onSelect
}: {
  metric: PlatformMetricCardModel;
  onSelect?: (metricKey: string) => void;
}) {
  const freshnessState = metric.freshnessState ?? "unknown";
  const display = resolveMetricDisplay({
    status: metric.status,
    value: metric.value,
    freshnessState
  });
  const isInteractive = Boolean(onSelect);

  return (
    <article
      id={`metric-${metric.key}`}
      className={`flex min-h-[12rem] flex-col rounded-2xl border border-[#1F1F1F] bg-[#0D0D0D] p-4 shadow-sm scroll-mt-24 ${
        isInteractive
          ? "cursor-pointer transition hover:border-[#264c38] hover:bg-[#101010] focus-within:border-[#264c38]"
          : ""
      }`}
      {...(isInteractive
        ? {
            role: "button",
            tabIndex: 0,
            onClick: () => onSelect?.(metric.key),
            onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect?.(metric.key);
              }
            }
          }
        : {})}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#F2F2F2]">{metric.label}</p>
          <p className="mt-1 truncate font-mono text-[11px] text-[#7A7A7A]">{metric.key}</p>
        </div>
        <StatusBadge status={metric.status} />
      </div>

      <div className="mt-5">
        <p className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-[#F5F5F5]">
          {metric.displayValue ?? display.displayValue}
        </p>
        <p className="mt-2 min-h-10 text-xs leading-relaxed text-[#9A9A9A]">{display.helperText}</p>
      </div>

      {metric.trends ? <TrendRow trends={metric.trends} /> : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-[#2a2a2a] bg-[#121212] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#9a9a9a]">
          Source
        </span>
        <span className="truncate text-xs text-[#bdbdbd]">{metric.source}</span>
        {freshnessState !== "unknown" ? <FreshnessBadge state={freshnessState} /> : null}
      </div>

      {isInteractive ? (
        <p className="mt-auto border-t border-[#1F1F1F] pt-4 text-xs text-[#7bd6a2]">
          View definition, formula, wiring, and source docs
        </p>
      ) : null}
    </article>
  );
}
