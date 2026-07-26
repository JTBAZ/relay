/**
 * Slice 2d — daily rollups of external post metrics for creator-level analytics.
 * @see docs/distribution/EXTERNAL_POST_METRICS_SLICE2.md Phase 2d
 */

import type { PrismaClient, RelayEngagementEventType } from "@prisma/client";

/** UTC calendar day (YYYY-MM-DD). */
export type MetricRollupDay = `${number}-${number}-${number}`;

/**
 * Source precedence for deduplication within a day (highest first).
 * Snapshot rows beat CSV overlay when both exist for the same grain.
 */
export const EXTERNAL_METRIC_SOURCE_PRECEDENCE = [
  "platform_api",
  "extension_dom",
  "third_party",
  "public_scrape",
  "manual"
] as const;

const DEFAULT_LOOKBACK_DAYS = 90;
const RELAY_DESTINATION = "relay";
const PATREON_DESTINATION = "patreon";
const CSV_METRIC_SOURCE = "third_party";
const RELAY_FIRST_PARTY_SOURCE = "manual";

/** Live snapshot sources that beat Patreon CSV for the same (post, day, metric). */
const SNAPSHOT_SOURCES_BEATING_CSV = new Set(["platform_api", "extension_dom"]);

/** Post-scoped RelayEngagementEvent → rollup metric type. */
export const RELAY_ENGAGEMENT_EVENT_TO_METRIC: Partial<
  Record<RelayEngagementEventType, string>
> = {
  gallery_view: "views",
  reveal_interaction: "reveal_interactions",
  profile_view: "views"
};

/** Post-scoped platform telemetry → rollup metric type for destination `relay`. */
export const RELAY_TELEMETRY_EVENT_TO_METRIC: Record<string, string> = {
  post_view: "views",
  post_liked: "likes",
  comment_created: "comments"
};

export type DailyRollupGrain = {
  postId: string;
  destination: string;
  metricType: string;
  day: MetricRollupDay;
};

export type DailyRollupCandidate = DailyRollupGrain & {
  creatorId: string;
  value: number;
  source: string;
};

export type ComputeDailyRollupsOptions = {
  since?: Date;
  until?: Date;
  computedAt?: Date;
};

export type ComputeDailyRollupsResult = {
  creator_id: string;
  since: string;
  until: string;
  upserted: number;
};

type SnapshotRow = {
  postId: string;
  destination: string;
  metricType: string;
  value: number | null;
  source: string;
  capturedAt: Date;
};

type CsvMetricRow = {
  postId: string | null;
  impressions: number | null;
  seen: number | null;
  likes: number | null;
  comments: number | null;
  asOf: Date | null;
  import: { uploadedAt: Date };
};

type RelayEventRow = {
  postId: string | null;
  eventType: RelayEngagementEventType;
  occurredAt: Date;
};

type TelemetryEventRow = {
  eventName: string;
  occurredAt: Date;
  creatorId: string | null;
  payload: unknown;
};

export function mapRelayEngagementEventToMetric(
  eventType: RelayEngagementEventType
): string | null {
  return RELAY_ENGAGEMENT_EVENT_TO_METRIC[eventType] ?? null;
}

export function mapRelayTelemetryEventToMetric(eventName: string): string | null {
  return RELAY_TELEMETRY_EVENT_TO_METRIC[eventName.trim()] ?? null;
}

function readPayloadPostId(payload: unknown): string | null {
  if (payload == null || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const postId = (payload as Record<string, unknown>).post_id;
  if (typeof postId !== "string") return null;
  const trimmed = postId.trim();
  return trimmed === "" ? null : trimmed;
}

function incrementDailyCount(
  counts: Map<string, number>,
  grain: DailyRollupGrain,
  amount = 1
): void {
  counts.set(grainKey(grain), (counts.get(grainKey(grain)) ?? 0) + amount);
}

function countsToDailyCandidates(
  creatorId: string,
  counts: Map<string, number>
): DailyRollupCandidate[] {
  return [...counts.entries()].map(([key, value]) => {
    const [postId, destination, metricType, day] = key.split("|") as [
      string,
      string,
      string,
      MetricRollupDay
    ];
    return {
      creatorId,
      postId,
      destination,
      metricType,
      day,
      value,
      source: RELAY_FIRST_PARTY_SOURCE
    };
  });
}

export function mergeDailyRollupCandidates(
  lists: DailyRollupCandidate[][]
): DailyRollupCandidate[] {
  const byGrain = new Map<string, DailyRollupCandidate>();

  for (const list of lists) {
    for (const row of list) {
      const key = grainKey(row);
      const existing = byGrain.get(key);
      if (!existing) {
        byGrain.set(key, row);
        continue;
      }

      byGrain.set(key, {
        ...existing,
        value: Math.max(existing.value, row.value),
        source:
          compareMetricSourcePrecedence(row.source, existing.source) <= 0
            ? row.source
            : existing.source
      });
    }
  }

  return [...byGrain.values()];
}

export function normalizeMetricRollupDay(day: MetricRollupDay | Date): Date {
  if (day instanceof Date) {
    return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) {
    throw new Error(`invalid metric rollup day: ${day}`);
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

export function formatMetricRollupDay(day: Date): MetricRollupDay {
  const y = day.getUTCFullYear();
  const m = String(day.getUTCMonth() + 1).padStart(2, "0");
  const d = String(day.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}` as MetricRollupDay;
}

export function compareMetricSourcePrecedence(a: string, b: string): number {
  const rank = (source: string): number => {
    const index = EXTERNAL_METRIC_SOURCE_PRECEDENCE.indexOf(
      source as (typeof EXTERNAL_METRIC_SOURCE_PRECEDENCE)[number]
    );
    return index === -1 ? EXTERNAL_METRIC_SOURCE_PRECEDENCE.length : index;
  };
  return rank(a) - rank(b);
}

function grainKey(grain: DailyRollupGrain): string {
  return `${grain.postId}|${grain.destination}|${grain.metricType}|${grain.day}`;
}

function addDaysUtc(day: MetricRollupDay, delta: number): MetricRollupDay {
  const date = normalizeMetricRollupDay(day);
  date.setUTCDate(date.getUTCDate() + delta);
  return formatMetricRollupDay(date);
}

function defaultSince(until: Date): Date {
  const since = new Date(until.getTime());
  since.setUTCDate(since.getUTCDate() - DEFAULT_LOOKBACK_DAYS);
  since.setUTCHours(0, 0, 0, 0);
  return since;
}

function resolveWindow(options?: ComputeDailyRollupsOptions): { since: Date; until: Date } {
  const until = options?.until ?? new Date();
  const since = options?.since ?? defaultSince(until);
  return { since, until };
}

function pickBestSnapshot(rows: SnapshotRow[]): SnapshotRow | null {
  const candidates = rows.filter((row) => row.value !== null && row.value !== undefined);
  if (candidates.length === 0) return null;

  return [...candidates].sort((a, b) => {
    const sourceCmp = compareMetricSourcePrecedence(a.source, b.source);
    if (sourceCmp !== 0) return sourceCmp;
    return b.capturedAt.getTime() - a.capturedAt.getTime();
  })[0] ?? null;
}

export function buildDailyCandidatesFromSnapshots(
  creatorId: string,
  snapshots: SnapshotRow[]
): DailyRollupCandidate[] {
  const grouped = new Map<string, SnapshotRow[]>();

  for (const snapshot of snapshots) {
    const day = formatMetricRollupDay(snapshot.capturedAt);
    const key = `${snapshot.postId}|${snapshot.destination}|${snapshot.metricType}|${day}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push(snapshot);
    grouped.set(key, bucket);
  }

  const candidates: DailyRollupCandidate[] = [];
  for (const rows of grouped.values()) {
    const winner = pickBestSnapshot(rows);
    if (!winner || winner.value === null) continue;
    candidates.push({
      creatorId,
      postId: winner.postId,
      destination: winner.destination,
      metricType: winner.metricType,
      day: formatMetricRollupDay(winner.capturedAt),
      value: winner.value,
      source: winner.source
    });
  }

  return candidates;
}

export function overlayCsvDailyCandidates(
  creatorId: string,
  existing: DailyRollupCandidate[],
  csvRows: CsvMetricRow[]
): DailyRollupCandidate[] {
  const byGrain = new Map(existing.map((row) => [grainKey(row), row]));
  const merged = [...existing];

  for (const row of csvRows) {
    const postId = row.postId?.trim() ?? "";
    if (!postId) continue;

    const day = formatMetricRollupDay(row.asOf ?? row.import.uploadedAt);
    const metrics: Array<[string, number | null]> = [
      ["impressions", row.impressions],
      ["seen", row.seen],
      ["likes", row.likes],
      ["comments", row.comments]
    ];

    for (const [metricType, value] of metrics) {
      if (value === null || value === undefined) continue;
      const grain: DailyRollupGrain = {
        postId,
        destination: PATREON_DESTINATION,
        metricType,
        day
      };
      const key = grainKey(grain);
      const existingRow = byGrain.get(key);

      if (!existingRow) {
        const candidate: DailyRollupCandidate = {
          creatorId,
          postId,
          destination: PATREON_DESTINATION,
          metricType,
          day,
          value,
          source: CSV_METRIC_SOURCE
        };
        byGrain.set(key, candidate);
        merged.push(candidate);
        continue;
      }

      if (SNAPSHOT_SOURCES_BEATING_CSV.has(existingRow.source)) {
        continue;
      }

      existingRow.value = value;
      existingRow.source = CSV_METRIC_SOURCE;
    }
  }

  return merged;
}

export function buildRelayEngagementDailyCandidates(
  creatorId: string,
  events: RelayEventRow[]
): DailyRollupCandidate[] {
  const counts = new Map<string, number>();

  for (const event of events) {
    const postId = event.postId?.trim() ?? "";
    if (!postId) continue;

    const metricType = mapRelayEngagementEventToMetric(event.eventType);
    if (!metricType) continue;

    incrementDailyCount(counts, {
      postId,
      destination: RELAY_DESTINATION,
      metricType,
      day: formatMetricRollupDay(event.occurredAt)
    });
  }

  return countsToDailyCandidates(creatorId, counts);
}

export function buildRelayTelemetryDailyCandidates(
  creatorId: string,
  events: TelemetryEventRow[]
): DailyRollupCandidate[] {
  const counts = new Map<string, number>();

  for (const event of events) {
    if (event.creatorId?.trim() !== creatorId) continue;

    const metricType = mapRelayTelemetryEventToMetric(event.eventName);
    if (!metricType) continue;

    const postId = readPayloadPostId(event.payload);
    if (!postId) continue;

    incrementDailyCount(counts, {
      postId,
      destination: RELAY_DESTINATION,
      metricType,
      day: formatMetricRollupDay(event.occurredAt)
    });
  }

  return countsToDailyCandidates(creatorId, counts);
}

export function computeDeltaFromPrior(
  value: number,
  priorValue: number | null | undefined
): number | null {
  if (priorValue === null || priorValue === undefined) return null;
  return value - priorValue;
}

function priorDayLookupKey(
  candidate: DailyRollupCandidate
): string {
  return grainKey({
    postId: candidate.postId,
    destination: candidate.destination,
    metricType: candidate.metricType,
    day: addDaysUtc(candidate.day, -1)
  });
}

export function attachDeltaFromPrior(
  candidates: DailyRollupCandidate[],
  priorValues: Map<string, number>
): Array<DailyRollupCandidate & { deltaFromPrior: number | null }> {
  const sameBatchPrior = new Map<string, number>();
  for (const candidate of candidates) {
    sameBatchPrior.set(grainKey(candidate), candidate.value);
  }

  return candidates.map((candidate) => {
    const prior =
      sameBatchPrior.get(priorDayLookupKey(candidate)) ??
      priorValues.get(priorDayLookupKey(candidate));
    return {
      ...candidate,
      deltaFromPrior: computeDeltaFromPrior(candidate.value, prior)
    };
  });
}

async function loadPriorDailyValues(
  prisma: PrismaClient,
  creatorId: string,
  since: Date
): Promise<Map<string, number>> {
  const priorSince = new Date(since.getTime());
  priorSince.setUTCDate(priorSince.getUTCDate() - 1);

  const rows = await prisma.externalPostMetricDaily.findMany({
    where: {
      creatorId,
      day: { gte: priorSince }
    },
    select: {
      postId: true,
      destination: true,
      metricType: true,
      day: true,
      value: true
    }
  });

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(
      grainKey({
        postId: row.postId,
        destination: row.destination,
        metricType: row.metricType,
        day: formatMetricRollupDay(row.day)
      }),
      row.value
    );
  }
  return map;
}

async function upsertDailyRollup(
  prisma: PrismaClient,
  row: DailyRollupCandidate & { deltaFromPrior: number | null },
  computedAt: Date
): Promise<void> {
  const day = normalizeMetricRollupDay(row.day);
  await prisma.externalPostMetricDaily.upsert({
    where: {
      creatorId_postId_destination_metricType_day: {
        creatorId: row.creatorId,
        postId: row.postId,
        destination: row.destination,
        metricType: row.metricType,
        day
      }
    },
    create: {
      creatorId: row.creatorId,
      postId: row.postId,
      destination: row.destination,
      metricType: row.metricType,
      day,
      value: row.value,
      deltaFromPrior: row.deltaFromPrior,
      source: row.source,
      computedAt
    },
    update: {
      value: row.value,
      deltaFromPrior: row.deltaFromPrior,
      source: row.source,
      computedAt
    }
  });
}

/**
 * Recompute daily rollup rows for one creator from snapshots, CSV overlay, and Relay engagement.
 */
export async function computeDailyRollups(
  prisma: PrismaClient,
  creatorId: string,
  options?: ComputeDailyRollupsOptions
): Promise<ComputeDailyRollupsResult> {
  /**
   * Deduplication policy (Slice 2d-7):
   * 1. Within a UTC day, pick the best snapshot per (post, destination, metric) using
   *    EXTERNAL_METRIC_SOURCE_PRECEDENCE (platform_api > extension_dom > third_party > …).
   * 2. Overlay Patreon CSV metrics for grains with no snapshot, or where the snapshot
   *    source is not platform_api/extension_dom (CSV replaces lower-fidelity snapshots).
   * 3. Merge Relay first-party counts (RelayEngagementEvent + post telemetry) as
   *    destination=relay; duplicate grains take max(value) to avoid double-counting.
   */
  const cid = creatorId.trim();
  if (!cid) {
    return {
      creator_id: creatorId,
      since: new Date(0).toISOString(),
      until: new Date(0).toISOString(),
      upserted: 0
    };
  }

  const { since, until } = resolveWindow(options);
  const computedAt = options?.computedAt ?? new Date();

  const snapshots = await prisma.externalPostMetricSnapshot.findMany({
    where: {
      creatorId: cid,
      capturedAt: { gte: since, lte: until }
    },
    select: {
      postId: true,
      destination: true,
      metricType: true,
      value: true,
      source: true,
      capturedAt: true
    },
    orderBy: { capturedAt: "asc" }
  });

  let candidates = buildDailyCandidatesFromSnapshots(cid, snapshots);

  const latestImport = await prisma.patreonInsightsImport.findFirst({
    where: { creatorId: cid },
    orderBy: { uploadedAt: "desc" },
    select: { id: true }
  });

  if (latestImport) {
    const csvRows = await prisma.patreonInsightsPostMetric.findMany({
      where: { importId: latestImport.id, creatorId: cid },
      select: {
        postId: true,
        impressions: true,
        seen: true,
        likes: true,
        comments: true,
        asOf: true,
        import: { select: { uploadedAt: true } }
      }
    });
    candidates = overlayCsvDailyCandidates(cid, candidates, csvRows);
  }

  const relayEvents = await prisma.relayEngagementEvent.findMany({
    where: {
      creatorId: cid,
      occurredAt: { gte: since, lte: until },
      postId: { not: null }
    },
    select: {
      postId: true,
      eventType: true,
      occurredAt: true
    }
  });

  const telemetryEvents = await prisma.platformTelemetryEvent.findMany({
    where: {
      creatorId: cid,
      eventName: { in: Object.keys(RELAY_TELEMETRY_EVENT_TO_METRIC) },
      occurredAt: { gte: since, lte: until }
    },
    select: {
      eventName: true,
      occurredAt: true,
      creatorId: true,
      payload: true
    }
  });

  const relayCandidates = mergeDailyRollupCandidates([
    buildRelayEngagementDailyCandidates(cid, relayEvents),
    buildRelayTelemetryDailyCandidates(cid, telemetryEvents)
  ]);
  candidates = candidates.concat(relayCandidates);

  const priorValues = await loadPriorDailyValues(prisma, cid, since);
  const rowsWithDelta = attachDeltaFromPrior(candidates, priorValues);

  for (const row of rowsWithDelta) {
    await upsertDailyRollup(prisma, row, computedAt);
  }

  return {
    creator_id: cid,
    since: since.toISOString(),
    until: until.toISOString(),
    upserted: rowsWithDelta.length
  };
}
