/**
 * PMD-001 — Platform metric status taxonomy for operator dashboard cards.
 * @see docs/platform-metrics-dashboard-build-plan.md
 * @see docs/platform-metric-status-taxonomy.md
 */

export const PLATFORM_METRIC_STATUSES = [
  "not_wired",
  "pending_instrumentation",
  "collecting",
  "live",
  "estimated",
  "manual_import",
  "deferred"
] as const;

export type PlatformMetricStatus = (typeof PLATFORM_METRIC_STATUSES)[number];

export const PLATFORM_METRIC_FRESHNESS_STATES = [
  "unknown",
  "fresh",
  "stale",
  "broken"
] as const;

export type PlatformMetricFreshnessState =
  (typeof PLATFORM_METRIC_FRESHNESS_STATES)[number];

export type MetricStatusBadgeTone =
  | "neutral"
  | "warning"
  | "info"
  | "success"
  | "muted";

export type MetricStatusUiSpec = {
  badgeLabel: string;
  badgeTone: MetricStatusBadgeTone;
  /** Shown when there is no numeric value to render yet. */
  emptyDisplayValue: string;
  /** Default helper copy under the card value. */
  helperText: string;
  /** Whether a numeric `value` should be formatted when present. */
  showsNumericValue: boolean;
  countsAsLive: boolean;
  countsAsCollecting: boolean;
  countsAsMissing: boolean;
  countsAsManualImport: boolean;
  countsAsDeferred: boolean;
};

export const METRIC_STATUS_UI: Record<PlatformMetricStatus, MetricStatusUiSpec> = {
  not_wired: {
    badgeLabel: "Not wired",
    badgeTone: "muted",
    emptyDisplayValue: "No data yet",
    helperText: "Instrumentation has not been connected for this metric.",
    showsNumericValue: false,
    countsAsLive: false,
    countsAsCollecting: false,
    countsAsMissing: true,
    countsAsManualImport: false,
    countsAsDeferred: false
  },
  pending_instrumentation: {
    badgeLabel: "Pending",
    badgeTone: "warning",
    emptyDisplayValue: "Pending instrumentation",
    helperText: "Source is defined; events or rollups are not emitting yet.",
    showsNumericValue: false,
    countsAsLive: false,
    countsAsCollecting: false,
    countsAsMissing: true,
    countsAsManualImport: false,
    countsAsDeferred: false
  },
  collecting: {
    badgeLabel: "Collecting",
    badgeTone: "info",
    emptyDisplayValue: "Collecting…",
    helperText: "Raw events are landing; rollup or display rules may still be incomplete.",
    showsNumericValue: true,
    countsAsLive: false,
    countsAsCollecting: true,
    countsAsMissing: false,
    countsAsManualImport: false,
    countsAsDeferred: false
  },
  live: {
    badgeLabel: "Live",
    badgeTone: "success",
    emptyDisplayValue: "0",
    helperText: "Backed by a trusted source or rollup.",
    showsNumericValue: true,
    countsAsLive: true,
    countsAsCollecting: false,
    countsAsMissing: false,
    countsAsManualImport: false,
    countsAsDeferred: false
  },
  estimated: {
    badgeLabel: "Estimated",
    badgeTone: "warning",
    emptyDisplayValue: "Estimate unavailable",
    helperText: "Proxy or partial data — not a full first-party count.",
    showsNumericValue: true,
    countsAsLive: false,
    countsAsCollecting: false,
    countsAsMissing: false,
    countsAsManualImport: false,
    countsAsDeferred: false
  },
  manual_import: {
    badgeLabel: "Manual import",
    badgeTone: "info",
    emptyDisplayValue: "Upload required",
    helperText: "Depends on CSV or manual upload (e.g. Patreon Insights).",
    showsNumericValue: true,
    countsAsLive: false,
    countsAsCollecting: false,
    countsAsMissing: false,
    countsAsManualImport: true,
    countsAsDeferred: false
  },
  deferred: {
    badgeLabel: "Deferred",
    badgeTone: "muted",
    emptyDisplayValue: "Not in scope",
    helperText: "Intentionally deferred for a later phase.",
    showsNumericValue: false,
    countsAsLive: false,
    countsAsCollecting: false,
    countsAsMissing: false,
    countsAsManualImport: false,
    countsAsDeferred: true
  }
};

export type ResolvedMetricDisplay = {
  displayValue: string;
  helperText: string;
  badgeLabel: string;
  badgeTone: MetricStatusBadgeTone;
  /** True when the metric lacks instrumentation (not the same as zero activity). */
  isMissingInstrumentation: boolean;
  /** True when live/estimated and numeric value is exactly zero. */
  isZeroActivity: boolean;
  freshnessState: PlatformMetricFreshnessState;
};

function isNumericZero(value: number | string | null | undefined): boolean {
  if (value == null) return false;
  if (typeof value === "number") return value === 0;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "nan") return false;
  const n = Number(trimmed);
  return Number.isFinite(n) && n === 0;
}

function hasPresentValue(value: number | string | null | undefined): boolean {
  if (value == null) return false;
  if (typeof value === "number") return Number.isFinite(value);
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.toLowerCase() !== "nan";
}

function formatNumericValue(value: number | string): string {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toLocaleString("en-US") : String(value);
  }
  const n = Number(value);
  if (Number.isFinite(n)) return n.toLocaleString("en-US");
  return value;
}

/** Type guard for registry/API payloads. */
export function isPlatformMetricStatus(raw: string): raw is PlatformMetricStatus {
  return (PLATFORM_METRIC_STATUSES as readonly string[]).includes(raw);
}

/**
 * Maps registry status + value + freshness into card display copy.
 * Distinguishes missing instrumentation from legitimate zero activity.
 */
export function resolveMetricDisplay(input: {
  status: PlatformMetricStatus;
  value?: number | string | null;
  freshnessState?: PlatformMetricFreshnessState;
}): ResolvedMetricDisplay {
  const spec = METRIC_STATUS_UI[input.status];
  const freshnessState = input.freshnessState ?? "unknown";
  const value = input.value ?? null;

  const isMissingInstrumentation =
    input.status === "not_wired" || input.status === "pending_instrumentation";

  let displayValue = spec.emptyDisplayValue;
  let helperText = spec.helperText;

  if (spec.showsNumericValue && hasPresentValue(value)) {
    displayValue = formatNumericValue(value as number | string);
    if (
      (input.status === "live" || input.status === "estimated") &&
      isNumericZero(value)
    ) {
      helperText = "No activity in this period.";
    }
  } else if (input.status === "collecting" && !hasPresentValue(value)) {
    displayValue = spec.emptyDisplayValue;
  } else if (input.status === "manual_import" && !hasPresentValue(value)) {
    displayValue = spec.emptyDisplayValue;
  } else if (input.status === "deferred") {
    displayValue = spec.emptyDisplayValue;
  } else if (
    (input.status === "live" || input.status === "estimated") &&
    isNumericZero(value)
  ) {
    displayValue = "0";
    helperText = "No activity in this period.";
  }

  const isZeroActivity =
    (input.status === "live" || input.status === "estimated") && isNumericZero(value);

  if (freshnessState === "stale" && input.status === "live") {
    helperText = "Data may be stale — check source freshness.";
  } else if (freshnessState === "broken") {
    helperText = "Source or rollup failed — metric may be inaccurate.";
  }

  return {
    displayValue,
    helperText,
    badgeLabel: spec.badgeLabel,
    badgeTone: spec.badgeTone,
    isMissingInstrumentation,
    isZeroActivity,
    freshnessState
  };
}

/** Coverage rollups for Data Coverage section (PMD-012). */
export function summarizeMetricStatuses(
  statuses: PlatformMetricStatus[]
): {
  total: number;
  live: number;
  collecting: number;
  not_wired: number;
  estimated: number;
  manual_import: number;
  deferred: number;
} {
  let live = 0;
  let collecting = 0;
  let not_wired = 0;
  let estimated = 0;
  let manual_import = 0;
  let deferred = 0;

  for (const status of statuses) {
    const spec = METRIC_STATUS_UI[status];
    if (spec.countsAsLive) live += 1;
    if (spec.countsAsCollecting) collecting += 1;
    if (spec.countsAsMissing) not_wired += 1;
    if (status === "estimated") estimated += 1;
    if (spec.countsAsManualImport) manual_import += 1;
    if (spec.countsAsDeferred) deferred += 1;
  }

  return {
    total: statuses.length,
    live,
    collecting,
    not_wired,
    estimated,
    manual_import,
    deferred
  };
}
