import type { Prisma, PrismaClient } from "@prisma/client";
import {
  formatRollupDayUtc,
  normalizeRollupDayUtc,
  normalizeRollupScopeId,
  type PlatformMetricDailyRollupInput,
  type PlatformMetricDailyRollupRow,
  type PlatformMetricRollupSourceFreshness
} from "./platform-metric-daily-rollup-types.js";

function parseJsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function parseSourceFreshness(value: Prisma.JsonValue): PlatformMetricRollupSourceFreshness {
  const obj = parseJsonObject(value);
  return {
    source_updated_at:
      typeof obj.source_updated_at === "string" ? obj.source_updated_at : null,
    raw_row_count:
      typeof obj.raw_row_count === "number" && Number.isFinite(obj.raw_row_count)
        ? obj.raw_row_count
        : null,
    writer: typeof obj.writer === "string" ? obj.writer : null
  };
}

function mapRow(row: {
  id: string;
  metricKey: string;
  dayUtc: Date;
  scope: string;
  scopeId: string;
  value: Prisma.Decimal;
  dimensions: Prisma.JsonValue;
  sourceFreshness: Prisma.JsonValue;
  generatedAt: Date;
}): PlatformMetricDailyRollupRow {
  return {
    id: row.id,
    metricKey: row.metricKey,
    dayUtc: formatRollupDayUtc(row.dayUtc),
    scope: row.scope,
    scopeId: row.scopeId,
    value: Number(row.value),
    dimensions: parseJsonObject(row.dimensions),
    sourceFreshness: parseSourceFreshness(row.sourceFreshness),
    generatedAt: row.generatedAt.toISOString()
  };
}

/**
 * Idempotent upsert for one daily rollup grain (PMD-050).
 */
export async function upsertPlatformMetricDailyRollup(
  prisma: PrismaClient,
  input: PlatformMetricDailyRollupInput
): Promise<PlatformMetricDailyRollupRow> {
  const dayUtc = normalizeRollupDayUtc(input.dayUtc);
  const scopeId = normalizeRollupScopeId(input.scopeId);
  const generatedAt = input.generatedAt ?? new Date();

  const row = await prisma.platformMetricDailyRollup.upsert({
    where: {
      metricKey_dayUtc_scope_scopeId: {
        metricKey: input.metricKey,
        dayUtc,
        scope: input.scope,
        scopeId
      }
    },
    create: {
      metricKey: input.metricKey,
      dayUtc,
      scope: input.scope,
      scopeId,
      value: input.value,
      dimensions: (input.dimensions ?? {}) as Prisma.InputJsonValue,
      sourceFreshness: (input.sourceFreshness ?? {}) as Prisma.InputJsonValue,
      generatedAt
    },
    update: {
      value: input.value,
      dimensions: (input.dimensions ?? {}) as Prisma.InputJsonValue,
      sourceFreshness: (input.sourceFreshness ?? {}) as Prisma.InputJsonValue,
      generatedAt
    }
  });

  return mapRow(row);
}

export async function getLatestPlatformMetricRollupGeneratedAt(
  prisma: PrismaClient
): Promise<Date | null> {
  const row = await prisma.platformMetricDailyRollup.findFirst({
    orderBy: { generatedAt: "desc" },
    select: { generatedAt: true }
  });
  return row?.generatedAt ?? null;
}

export async function getPlatformMetricDailyRollup(args: {
  prisma: PrismaClient;
  metricKey: string;
  dayUtc: PlatformMetricDailyRollupInput["dayUtc"];
  scope: string;
  scopeId?: string | null;
}): Promise<PlatformMetricDailyRollupRow | null> {
  const row = await args.prisma.platformMetricDailyRollup.findUnique({
    where: {
      metricKey_dayUtc_scope_scopeId: {
        metricKey: args.metricKey,
        dayUtc: normalizeRollupDayUtc(args.dayUtc),
        scope: args.scope,
        scopeId: normalizeRollupScopeId(args.scopeId)
      }
    }
  });
  return row ? mapRow(row) : null;
}

/** Latest system rollup value for a metric (PMD-051 dashboard wiring). */
export async function getLatestSystemRollupMetricValue(args: {
  prisma: PrismaClient;
  metricKey: string;
}): Promise<{
  value: number;
  dayUtc: string;
  generatedAt: string;
  sourceUpdatedAt: string | null;
} | null> {
  const row = await args.prisma.platformMetricDailyRollup.findFirst({
    where: { metricKey: args.metricKey, scope: "system", scopeId: "" },
    orderBy: [{ dayUtc: "desc" }, { generatedAt: "desc" }],
    select: { value: true, dayUtc: true, generatedAt: true, sourceFreshness: true }
  });
  if (!row) return null;
  const freshness = parseSourceFreshness(row.sourceFreshness);
  return {
    value: Number(row.value),
    dayUtc: formatRollupDayUtc(row.dayUtc),
    generatedAt: row.generatedAt.toISOString(),
    sourceUpdatedAt: freshness.source_updated_at ?? null
  };
}

/** Sum daily system rollup values (traffic totals from rolled-up days). */
export async function sumSystemRollupMetricValues(args: {
  prisma: PrismaClient;
  metricKey: string;
}): Promise<{
  value: number;
  dayCount: number;
  latestGeneratedAt: string | null;
  latestSourceUpdatedAt: string | null;
} | null> {
  const rows = await args.prisma.platformMetricDailyRollup.findMany({
    where: { metricKey: args.metricKey, scope: "system", scopeId: "" },
    select: { value: true, generatedAt: true }
  });
  if (rows.length === 0) return null;

  const latestRow = await args.prisma.platformMetricDailyRollup.findFirst({
    where: { metricKey: args.metricKey, scope: "system", scopeId: "" },
    orderBy: [{ dayUtc: "desc" }, { generatedAt: "desc" }],
    select: { generatedAt: true, sourceFreshness: true }
  });

  let total = 0;
  let latestGeneratedAt: Date | null = null;
  for (const row of rows) {
    total += Number(row.value);
    if (!latestGeneratedAt || row.generatedAt.getTime() > latestGeneratedAt.getTime()) {
      latestGeneratedAt = row.generatedAt;
    }
  }

  const latestFreshness = latestRow
    ? parseSourceFreshness(latestRow.sourceFreshness)
    : { source_updated_at: null };

  return {
    value: total,
    dayCount: rows.length,
    latestGeneratedAt: latestGeneratedAt?.toISOString() ?? null,
    latestSourceUpdatedAt: latestFreshness.source_updated_at ?? null
  };
}

/** Latest-first daily rollup series for trend math (PMD-052). */
export async function getSystemRollupDailySeries(args: {
  prisma: PrismaClient;
  metricKey: string;
  limitDays?: number;
}): Promise<
  Array<{
    dayUtc: string;
    value: number;
    generatedAt: string;
    sourceUpdatedAt: string | null;
  }>
> {
  const rows = await args.prisma.platformMetricDailyRollup.findMany({
    where: { metricKey: args.metricKey, scope: "system", scopeId: "" },
    orderBy: [{ dayUtc: "desc" }, { generatedAt: "desc" }],
    take: args.limitDays ?? 31,
    select: {
      dayUtc: true,
      value: true,
      generatedAt: true,
      sourceFreshness: true
    }
  });

  return rows.map((row) => {
    const freshness = parseSourceFreshness(row.sourceFreshness);
    return {
      dayUtc: formatRollupDayUtc(row.dayUtc),
      value: Number(row.value),
      generatedAt: row.generatedAt.toISOString(),
      sourceUpdatedAt: freshness.source_updated_at ?? null
    };
  });
}
