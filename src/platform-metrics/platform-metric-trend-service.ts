/**
 * PMD-052 — Trend deltas and rollup freshness evaluation.
 */
import type { PrismaClient } from "@prisma/client";
import type { PlatformMetricFreshnessState } from "./metric-status-taxonomy.js";
import { getSystemRollupDailySeries } from "./platform-metric-daily-rollup-service.js";
import {
  isRollupTrendMetricKey,
  type PlatformMetricTrendDelta,
  type PlatformMetricTrends
} from "./platform-metric-trend-types.js";

const DEFAULT_ROLLUP_STALE_AFTER_MS = 36 * 60 * 60 * 1000;
const DEFAULT_SOURCE_STALE_AFTER_MS = 48 * 60 * 60 * 1000;

export function computeTrendDelta(
  current: number | null,
  prior: number | null
): PlatformMetricTrendDelta {
  if (current == null || prior == null) {
    return {
      direction: "unknown",
      delta: null,
      deltaPercent: null,
      priorValue: prior,
      currentValue: current,
      sufficientHistory: false
    };
  }

  const delta = current - prior;
  let deltaPercent: number | null = null;
  if (prior === 0) {
    deltaPercent = current === 0 ? 0 : null;
  } else {
    deltaPercent = Math.round((delta / prior) * 1000) / 10;
  }

  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return {
    direction,
    delta,
    deltaPercent,
    priorValue: prior,
    currentValue: current,
    sufficientHistory: true
  };
}

export function computeTrendsFromDailySeries(
  series: Array<{ dayUtc: string; value: number }>
): PlatformMetricTrends {
  const current = series[0]?.value ?? null;
  const dodPrior = series[1]?.value ?? null;
  const wowPrior = series[7]?.value ?? null;
  const momPrior = series[30]?.value ?? null;

  return {
    dod: computeTrendDelta(current, dodPrior),
    wow: computeTrendDelta(current, wowPrior),
    mom: computeTrendDelta(current, momPrior)
  };
}

export function evaluateRollupFreshness(args: {
  generatedAt: string | null | undefined;
  sourceUpdatedAt?: string | null | undefined;
  now?: Date;
  rollupStaleAfterMs?: number;
  sourceStaleAfterMs?: number;
}): PlatformMetricFreshnessState {
  const now = args.now ?? new Date();
  const rollupStaleAfterMs = args.rollupStaleAfterMs ?? DEFAULT_ROLLUP_STALE_AFTER_MS;
  const sourceStaleAfterMs = args.sourceStaleAfterMs ?? DEFAULT_SOURCE_STALE_AFTER_MS;

  if (!args.generatedAt) return "unknown";

  const generatedMs = Date.parse(args.generatedAt);
  if (!Number.isFinite(generatedMs)) return "unknown";

  if (now.getTime() - generatedMs > rollupStaleAfterMs) {
    return "stale";
  }

  if (args.sourceUpdatedAt) {
    const sourceMs = Date.parse(args.sourceUpdatedAt);
    if (Number.isFinite(sourceMs) && now.getTime() - sourceMs > sourceStaleAfterMs) {
      return "stale";
    }
  }

  return "fresh";
}

export async function buildRollupTrendsForMetric(args: {
  prisma: PrismaClient;
  metricKey: string;
}): Promise<PlatformMetricTrends | null> {
  if (!isRollupTrendMetricKey(args.metricKey)) return null;
  const series = await getSystemRollupDailySeries({
    prisma: args.prisma,
    metricKey: args.metricKey,
    limitDays: 31
  });
  if (series.length === 0) return null;
  return computeTrendsFromDailySeries(series);
}
