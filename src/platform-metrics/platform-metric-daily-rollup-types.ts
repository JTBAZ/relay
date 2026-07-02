import type { PlatformMetricScope } from "./metric-registry-types.js";

/** UTC calendar day for rollup grain (YYYY-MM-DD). */
export type PlatformMetricRollupDay = `${number}-${number}-${number}`;

export type PlatformMetricRollupSourceFreshness = {
  /** Latest raw source timestamp included in this rollup (ISO-8601). */
  source_updated_at?: string | null;
  /** Optional row/event count used to compute the rollup. */
  raw_row_count?: number | null;
  /** Job or writer label (e.g. manual_seed, nightly_job). */
  writer?: string | null;
};

export type PlatformMetricDailyRollupInput = {
  metricKey: string;
  dayUtc: PlatformMetricRollupDay | Date;
  scope: PlatformMetricScope | string;
  scopeId?: string | null;
  value: number;
  dimensions?: Record<string, unknown>;
  sourceFreshness?: PlatformMetricRollupSourceFreshness;
  generatedAt?: Date;
};

export type PlatformMetricDailyRollupRow = {
  id: string;
  metricKey: string;
  dayUtc: string;
  scope: string;
  scopeId: string;
  value: number;
  dimensions: Record<string, unknown>;
  sourceFreshness: PlatformMetricRollupSourceFreshness;
  generatedAt: string;
};

export function normalizeRollupScopeId(scopeId: string | null | undefined): string {
  return scopeId?.trim() ?? "";
}

export function normalizeRollupDayUtc(dayUtc: PlatformMetricRollupDay | Date): Date {
  if (dayUtc instanceof Date) {
    return new Date(Date.UTC(dayUtc.getUTCFullYear(), dayUtc.getUTCMonth(), dayUtc.getUTCDate()));
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayUtc);
  if (!match) {
    throw new Error(`invalid rollup day: ${dayUtc}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatRollupDayUtc(dayUtc: Date): PlatformMetricRollupDay {
  const y = dayUtc.getUTCFullYear();
  const m = String(dayUtc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dayUtc.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}` as PlatformMetricRollupDay;
}
