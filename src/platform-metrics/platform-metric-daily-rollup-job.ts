/**
 * PMD-051 — Daily rollup job for DAU and traffic metrics from raw telemetry.
 * @see docs/database/platform-metric-daily-rollups.md
 */
import type { PrismaClient } from "@prisma/client";
import { PlatformRevenueEventKind, PlatformRevenueSourceLabel, Prisma } from "@prisma/client";
import {
  formatRollupDayUtc,
  normalizeRollupDayUtc,
  type PlatformMetricRollupDay
} from "./platform-metric-daily-rollup-types.js";
import { upsertPlatformMetricDailyRollup } from "./platform-metric-daily-rollup-service.js";

const WRITER = "platform_metric_daily_rollup_job";

const ACTIVITY_EVENT_NAMES = ["feed_open", "post_view", "session_start"] as const;

export type PlatformMetricDailyRollupJobMetricKey =
  | "traffic.profile_views"
  | "traffic.gallery_views"
  | "traffic.page_views"
  | "traffic.unique_visitors"
  | "activity.dau"
  | "activity.wau"
  | "activity.mau"
  | "revenue.gross"
  | "revenue.net"
  | "revenue.checkout_started"
  | "revenue.checkout_completed"
  | "revenue.checkout_failed"
  | "revenue.upgrades"
  | "revenue.downgrades"
  | "revenue.refunds";

export type PlatformMetricDailyRollupDayMetric = {
  metricKey: PlatformMetricDailyRollupJobMetricKey;
  value: number;
  rawRowCount: number;
  sourceUpdatedAt: string | null;
  dimensions?: Record<string, unknown>;
};

export type PlatformMetricDailyRollupDayResult = {
  dayUtc: PlatformMetricRollupDay;
  metrics: PlatformMetricDailyRollupDayMetric[];
};

export type RunPlatformMetricDailyRollupOnceArgs = {
  prisma: PrismaClient;
  now?: Date;
  /** Roll up only this UTC day (YYYY-MM-DD). */
  dayUtc?: PlatformMetricRollupDay;
  /**
   * When `dayUtc` is omitted, roll up this many prior UTC days plus today (inclusive).
   * Default 1 → yesterday and today.
   */
  lookbackDays?: number;
  writer?: string;
};

export type PlatformMetricDailyRollupJobResult = {
  cycle_started_at: string;
  days_processed: number;
  metrics_upserted: number;
  days: PlatformMetricDailyRollupDayResult[];
};

function dayWindow(dayUtc: PlatformMetricRollupDay | Date): { start: Date; end: Date } {
  const start = normalizeRollupDayUtc(dayUtc);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function shiftDay(dayUtc: PlatformMetricRollupDay, deltaDays: number): PlatformMetricRollupDay {
  const start = normalizeRollupDayUtc(dayUtc);
  start.setUTCDate(start.getUTCDate() + deltaDays);
  return formatRollupDayUtc(start);
}

export function listDaysToProcess(
  args: RunPlatformMetricDailyRollupOnceArgs
): PlatformMetricRollupDay[] {
  if (args.dayUtc) return [args.dayUtc];

  const today = formatRollupDayUtc(args.now ?? new Date());
  const lookback = Math.max(0, args.lookbackDays ?? 1);
  const days: PlatformMetricRollupDay[] = [];
  for (let offset = -lookback; offset <= 0; offset += 1) {
    days.push(shiftDay(today, offset));
  }
  return days;
}

async function countDedupedEngagement(args: {
  prisma: PrismaClient;
  eventType: "profile_view" | "gallery_view";
  start: Date;
  end: Date;
}): Promise<{ value: number; rawRowCount: number; sourceUpdatedAt: Date | null }> {
  const rows = await args.prisma.$queryRaw<
    Array<{ value: number; raw_row_count: number; source_updated_at: Date | null }>
  >(
    Prisma.sql`
      SELECT
        COUNT(*)::int AS value,
        (
          SELECT COUNT(*)::int
          FROM relay_engagement_events raw
          WHERE raw.event_type = CAST(${args.eventType} AS "RelayEngagementEventType")
            AND raw.occurred_at >= ${args.start}
            AND raw.occurred_at < ${args.end}
        ) AS raw_row_count,
        (
          SELECT MAX(raw.occurred_at)
          FROM relay_engagement_events raw
          WHERE raw.event_type = CAST(${args.eventType} AS "RelayEngagementEventType")
            AND raw.occurred_at >= ${args.start}
            AND raw.occurred_at < ${args.end}
        ) AS source_updated_at
      FROM (
        SELECT DISTINCT
          creator_id,
          COALESCE(NULLIF(TRIM(session_key), ''), id) AS dedupe_key
        FROM relay_engagement_events
        WHERE event_type = CAST(${args.eventType} AS "RelayEngagementEventType")
          AND occurred_at >= ${args.start}
          AND occurred_at < ${args.end}
      ) deduped
    `
  );
  const row = rows[0];
  return {
    value: row?.value ?? 0,
    rawRowCount: row?.raw_row_count ?? 0,
    sourceUpdatedAt: row?.source_updated_at ?? null
  };
}

async function countTelemetryEvents(args: {
  prisma: PrismaClient;
  eventName: string;
  start: Date;
  end: Date;
}): Promise<{ value: number; rawRowCount: number; sourceUpdatedAt: Date | null }> {
  const agg = await args.prisma.platformTelemetryEvent.aggregate({
    where: {
      eventName: args.eventName,
      occurredAt: { gte: args.start, lt: args.end }
    },
    _count: { _all: true },
    _max: { occurredAt: true }
  });
  return {
    value: agg._count._all,
    rawRowCount: agg._count._all,
    sourceUpdatedAt: agg._max.occurredAt
  };
}

async function countUniqueVisitors(args: {
  prisma: PrismaClient;
  start: Date;
  end: Date;
}): Promise<{ value: number; rawRowCount: number; sourceUpdatedAt: Date | null }> {
  const rows = await args.prisma.$queryRaw<
    Array<{ value: number; raw_row_count: number; source_updated_at: Date | null }>
  >(
    Prisma.sql`
      WITH traffic_sessions AS (
        SELECT session_key, occurred_at
        FROM relay_engagement_events
        WHERE occurred_at >= ${args.start}
          AND occurred_at < ${args.end}
          AND session_key IS NOT NULL
          AND TRIM(session_key) <> ''
        UNION ALL
        SELECT session_key, occurred_at
        FROM platform_telemetry_events
        WHERE occurred_at >= ${args.start}
          AND occurred_at < ${args.end}
          AND session_key IS NOT NULL
          AND TRIM(session_key) <> ''
      )
      SELECT
        COUNT(DISTINCT session_key)::int AS value,
        COUNT(*)::int AS raw_row_count,
        MAX(occurred_at) AS source_updated_at
      FROM traffic_sessions
    `
  );
  const row = rows[0];
  return {
    value: row?.value ?? 0,
    rawRowCount: row?.raw_row_count ?? 0,
    sourceUpdatedAt: row?.source_updated_at ?? null
  };
}

async function countDistinctActiveKeys(args: {
  prisma: PrismaClient;
  start: Date;
  end: Date;
}): Promise<{ value: number; rawRowCount: number; sourceUpdatedAt: Date | null }> {
  const eventNames = [...ACTIVITY_EVENT_NAMES];
  const rows = await args.prisma.$queryRaw<
    Array<{ value: number; raw_row_count: number; source_updated_at: Date | null }>
  >(
    Prisma.sql`
      WITH activity_rows AS (
        SELECT
          COALESCE(NULLIF(TRIM(actor_key), ''), NULLIF(TRIM(session_key), '')) AS active_key,
          occurred_at
        FROM platform_telemetry_events
        WHERE event_name IN (${Prisma.join(eventNames)})
          AND occurred_at >= ${args.start}
          AND occurred_at < ${args.end}
      )
      SELECT
        COUNT(DISTINCT active_key)::int AS value,
        COUNT(*)::int AS raw_row_count,
        MAX(occurred_at) AS source_updated_at
      FROM activity_rows
      WHERE active_key IS NOT NULL
    `
  );
  const row = rows[0];
  return {
    value: row?.value ?? 0,
    rawRowCount: row?.raw_row_count ?? 0,
    sourceUpdatedAt: row?.source_updated_at ?? null
  };
}

async function aggregateRevenueEvents(args: {
  prisma: PrismaClient;
  eventKinds: PlatformRevenueEventKind[];
  start: Date;
  end: Date;
}): Promise<{
  count: number;
  amountCents: number;
  netAmountCents: number | null;
  sourceUpdatedAt: Date | null;
}> {
  const agg = await args.prisma.platformRevenueEvent.aggregate({
    where: {
      sourceLabel: PlatformRevenueSourceLabel.relay_native,
      eventKind: { in: args.eventKinds },
      occurredAt: { gte: args.start, lt: args.end }
    },
    _count: { _all: true },
    _sum: { amountCents: true, netAmountCents: true },
    _max: { occurredAt: true }
  });

  return {
    count: agg._count._all,
    amountCents: agg._sum.amountCents ?? 0,
    netAmountCents: agg._sum.netAmountCents,
    sourceUpdatedAt: agg._max.occurredAt
  };
}

function revenueMetric(args: {
  metricKey: PlatformMetricDailyRollupJobMetricKey;
  value: number;
  rawRowCount: number;
  sourceUpdatedAt: Date | null;
  dimensions?: Record<string, unknown>;
}): PlatformMetricDailyRollupDayMetric {
  return {
    metricKey: args.metricKey,
    value: args.value,
    rawRowCount: args.rawRowCount,
    sourceUpdatedAt: args.sourceUpdatedAt?.toISOString() ?? null,
    dimensions: {
      source_label: "relay_native",
      ...(args.dimensions ?? {})
    }
  };
}

export async function computePlatformMetricDailyRollupsForDay(args: {
  prisma: PrismaClient;
  dayUtc: PlatformMetricRollupDay;
}): Promise<PlatformMetricDailyRollupDayResult> {
  const { start, end } = dayWindow(args.dayUtc);
  const wauStart = normalizeRollupDayUtc(shiftDay(args.dayUtc, -6));
  const mauStart = normalizeRollupDayUtc(shiftDay(args.dayUtc, -29));

  const [
    profileViews,
    galleryViews,
    pageViews,
    uniqueVisitors,
    dau,
    wau,
    mau,
    checkoutStarted,
    checkoutCompleted,
    checkoutFailed,
    subscriptionUpgraded,
    subscriptionDowngraded,
    refundIssued,
    grossRevenue
  ] = await Promise.all([
    countDedupedEngagement({ prisma: args.prisma, eventType: "profile_view", start, end }),
    countDedupedEngagement({ prisma: args.prisma, eventType: "gallery_view", start, end }),
    countTelemetryEvents({ prisma: args.prisma, eventName: "page_view", start, end }),
    countUniqueVisitors({ prisma: args.prisma, start, end }),
    countDistinctActiveKeys({ prisma: args.prisma, start, end }),
    countDistinctActiveKeys({ prisma: args.prisma, start: wauStart, end }),
    countDistinctActiveKeys({ prisma: args.prisma, start: mauStart, end }),
    aggregateRevenueEvents({
      prisma: args.prisma,
      eventKinds: [PlatformRevenueEventKind.checkout_started],
      start,
      end
    }),
    aggregateRevenueEvents({
      prisma: args.prisma,
      eventKinds: [PlatformRevenueEventKind.checkout_completed],
      start,
      end
    }),
    aggregateRevenueEvents({
      prisma: args.prisma,
      eventKinds: [PlatformRevenueEventKind.checkout_failed],
      start,
      end
    }),
    aggregateRevenueEvents({
      prisma: args.prisma,
      eventKinds: [PlatformRevenueEventKind.subscription_upgraded],
      start,
      end
    }),
    aggregateRevenueEvents({
      prisma: args.prisma,
      eventKinds: [PlatformRevenueEventKind.subscription_downgraded],
      start,
      end
    }),
    aggregateRevenueEvents({
      prisma: args.prisma,
      eventKinds: [PlatformRevenueEventKind.refund_issued],
      start,
      end
    }),
    aggregateRevenueEvents({
      prisma: args.prisma,
      eventKinds: [
        PlatformRevenueEventKind.checkout_completed,
        PlatformRevenueEventKind.subscription_created
      ],
      start,
      end
    })
  ]);

  const refundCents = refundIssued.amountCents;
  const grossCents = grossRevenue.amountCents;
  const netCents = (grossRevenue.netAmountCents ?? grossCents) - refundCents;
  const latestRevenueSourceUpdatedAt = [
    checkoutStarted.sourceUpdatedAt,
    checkoutCompleted.sourceUpdatedAt,
    checkoutFailed.sourceUpdatedAt,
    subscriptionUpgraded.sourceUpdatedAt,
    subscriptionDowngraded.sourceUpdatedAt,
    refundIssued.sourceUpdatedAt,
    grossRevenue.sourceUpdatedAt
  ].filter((value): value is Date => value instanceof Date)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  const metrics: PlatformMetricDailyRollupDayMetric[] = [
    {
      metricKey: "traffic.profile_views",
      value: profileViews.value,
      rawRowCount: profileViews.rawRowCount,
      sourceUpdatedAt: profileViews.sourceUpdatedAt?.toISOString() ?? null
    },
    {
      metricKey: "traffic.gallery_views",
      value: galleryViews.value,
      rawRowCount: galleryViews.rawRowCount,
      sourceUpdatedAt: galleryViews.sourceUpdatedAt?.toISOString() ?? null
    },
    {
      metricKey: "traffic.page_views",
      value: pageViews.value,
      rawRowCount: pageViews.rawRowCount,
      sourceUpdatedAt: pageViews.sourceUpdatedAt?.toISOString() ?? null
    },
    {
      metricKey: "traffic.unique_visitors",
      value: uniqueVisitors.value,
      rawRowCount: uniqueVisitors.rawRowCount,
      sourceUpdatedAt: uniqueVisitors.sourceUpdatedAt?.toISOString() ?? null
    },
    {
      metricKey: "activity.dau",
      value: dau.value,
      rawRowCount: dau.rawRowCount,
      sourceUpdatedAt: dau.sourceUpdatedAt?.toISOString() ?? null
    },
    {
      metricKey: "activity.wau",
      value: wau.value,
      rawRowCount: wau.rawRowCount,
      sourceUpdatedAt: wau.sourceUpdatedAt?.toISOString() ?? null,
      dimensions: { window_days: 7 }
    },
    {
      metricKey: "activity.mau",
      value: mau.value,
      rawRowCount: mau.rawRowCount,
      sourceUpdatedAt: mau.sourceUpdatedAt?.toISOString() ?? null,
      dimensions: { window_days: 30 }
    },
    revenueMetric({
      metricKey: "revenue.gross",
      value: grossCents / 100,
      rawRowCount: grossRevenue.count,
      sourceUpdatedAt: grossRevenue.sourceUpdatedAt
    }),
    revenueMetric({
      metricKey: "revenue.net",
      value: netCents / 100,
      rawRowCount: grossRevenue.count + refundIssued.count,
      sourceUpdatedAt: latestRevenueSourceUpdatedAt
    }),
    revenueMetric({
      metricKey: "revenue.checkout_started",
      value: checkoutStarted.count,
      rawRowCount: checkoutStarted.count,
      sourceUpdatedAt: checkoutStarted.sourceUpdatedAt
    }),
    revenueMetric({
      metricKey: "revenue.checkout_completed",
      value: checkoutCompleted.count,
      rawRowCount: checkoutCompleted.count,
      sourceUpdatedAt: checkoutCompleted.sourceUpdatedAt
    }),
    revenueMetric({
      metricKey: "revenue.checkout_failed",
      value: checkoutFailed.count,
      rawRowCount: checkoutFailed.count,
      sourceUpdatedAt: checkoutFailed.sourceUpdatedAt
    }),
    revenueMetric({
      metricKey: "revenue.upgrades",
      value: subscriptionUpgraded.count,
      rawRowCount: subscriptionUpgraded.count,
      sourceUpdatedAt: subscriptionUpgraded.sourceUpdatedAt
    }),
    revenueMetric({
      metricKey: "revenue.downgrades",
      value: subscriptionDowngraded.count,
      rawRowCount: subscriptionDowngraded.count,
      sourceUpdatedAt: subscriptionDowngraded.sourceUpdatedAt
    }),
    revenueMetric({
      metricKey: "revenue.refunds",
      value: refundIssued.amountCents / 100,
      rawRowCount: refundIssued.count,
      sourceUpdatedAt: refundIssued.sourceUpdatedAt
    })
  ];

  return { dayUtc: args.dayUtc, metrics };
}

export async function runPlatformMetricDailyRollupOnce(
  args: RunPlatformMetricDailyRollupOnceArgs
): Promise<PlatformMetricDailyRollupJobResult> {
  const cycleStartedAt = (args.now ?? new Date()).toISOString();
  const writer = args.writer ?? WRITER;
  const days = listDaysToProcess(args);
  const dayResults: PlatformMetricDailyRollupDayResult[] = [];
  let metricsUpserted = 0;
  const generatedAt = args.now ?? new Date();

  for (const dayUtc of days) {
    const computed = await computePlatformMetricDailyRollupsForDay({
      prisma: args.prisma,
      dayUtc
    });
    dayResults.push(computed);

    for (const metric of computed.metrics) {
      await upsertPlatformMetricDailyRollup(args.prisma, {
        metricKey: metric.metricKey,
        dayUtc,
        scope: "system",
        value: metric.value,
        dimensions: metric.dimensions,
        sourceFreshness: {
          source_updated_at: metric.sourceUpdatedAt,
          raw_row_count: metric.rawRowCount,
          writer
        },
        generatedAt
      });
      metricsUpserted += 1;
    }
  }

  return {
    cycle_started_at: cycleStartedAt,
    days_processed: days.length,
    metrics_upserted: metricsUpserted,
    days: dayResults
  };
}

export function platformMetricDailyRollupIntervalFromEnv(
  env: NodeJS.ProcessEnv = process.env
): number | null {
  const raw = env.RELAY_PLATFORM_METRIC_DAILY_ROLLUP_MS?.trim();
  if (raw === undefined || raw === "") return null;
  if (raw === "0") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 60_000) return null;
  return Math.floor(n);
}

export function platformMetricDailyRollupLookbackDaysFromEnv(
  env: NodeJS.ProcessEnv = process.env
): number {
  const raw = env.RELAY_PLATFORM_METRIC_DAILY_ROLLUP_LOOKBACK_DAYS?.trim();
  if (!raw) return 1;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 1;
  return Math.min(Math.floor(n), 31);
}
