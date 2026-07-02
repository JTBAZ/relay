/**
 * @fileoverview Append-only external post metric snapshots (Slice 2).
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import {
  touchPlatformInstanceLastRefreshed,
  upsertPlatformInstanceFromAttempt
} from "../analytics/platform-instance-service.js";
import { PostDistributionNotFoundError } from "./post-distribution-service.js";

export const EXTERNAL_METRIC_SOURCES = [
  "extension_dom",
  "public_scrape",
  "platform_api",
  "manual",
  "third_party"
] as const;

export type ExternalMetricSource = (typeof EXTERNAL_METRIC_SOURCES)[number];

export type ExternalMetricInput = {
  metric_type: string;
  value?: number | null;
  raw?: Record<string, unknown> | null;
};

export type RecordExternalMetricsInput = {
  source: ExternalMetricSource;
  metrics: ExternalMetricInput[];
};

export type ExternalPostMetricSnapshotWire = {
  snapshot_id: string;
  attempt_id: string;
  post_id: string;
  creator_id: string;
  destination: string;
  external_url: string;
  external_id: string | null;
  metric_type: string;
  value: number | null;
  raw: Record<string, unknown>;
  source: ExternalMetricSource;
  captured_at: string;
};

export type ExternalPostMetricLatestWire = {
  snapshot_id: string;
  metric_type: string;
  value: number | null;
  source: ExternalMetricSource;
  captured_at: string;
};

export type ExternalPostDestinationMetricsWire = {
  destination: string;
  attempt_id: string;
  external_url: string;
  external_id: string | null;
  metrics: ExternalPostMetricLatestWire[];
};

export type PostExternalMetricsWire = {
  post_id: string;
  destinations: ExternalPostDestinationMetricsWire[];
};

export class ExternalPostMetricsValidationError extends Error {
  public override readonly name = "ExternalPostMetricsValidationError";

  public constructor(
    message: string,
    public readonly details: Array<{ field: string; issue: string }>
  ) {
    super(message);
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function normalizeMetricType(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function parseMetricValue(
  value: unknown,
  index: number
): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ExternalPostMetricsValidationError("Invalid metric value.", [
      { field: `metrics[${index}].value`, issue: "must be a finite number or null" }
    ]);
  }
  return Math.trunc(value);
}

function parseRawPayload(
  raw: unknown,
  index: number
): Record<string, unknown> {
  if (raw === null || raw === undefined) return {};
  if (!isPlainObject(raw)) {
    throw new ExternalPostMetricsValidationError("Invalid metric raw payload.", [
      { field: `metrics[${index}].raw`, issue: "must be an object" }
    ]);
  }
  return raw;
}

function parseSource(source: unknown): ExternalMetricSource {
  const normalized = typeof source === "string" ? source.trim() : "";
  if (!EXTERNAL_METRIC_SOURCES.includes(normalized as ExternalMetricSource)) {
    throw new ExternalPostMetricsValidationError("Invalid metrics source.", [
      {
        field: "source",
        issue: `must be one of: ${EXTERNAL_METRIC_SOURCES.join(", ")}`
      }
    ]);
  }
  return normalized as ExternalMetricSource;
}

function parseMetrics(metrics: unknown): ExternalMetricInput[] {
  if (!Array.isArray(metrics) || metrics.length === 0) {
    throw new ExternalPostMetricsValidationError("Metrics payload is required.", [
      { field: "metrics", issue: "must be a non-empty array" }
    ]);
  }

  return metrics.map((entry, index) => {
    if (!isPlainObject(entry)) {
      throw new ExternalPostMetricsValidationError("Invalid metric entry.", [
        { field: `metrics[${index}]`, issue: "must be an object" }
      ]);
    }
    const metricTypeRaw =
      typeof entry.metric_type === "string"
        ? entry.metric_type
        : typeof entry.metricType === "string"
          ? entry.metricType
          : "";
    const metricType = normalizeMetricType(metricTypeRaw);
    if (!metricType) {
      throw new ExternalPostMetricsValidationError("Invalid metric type.", [
        { field: `metrics[${index}].metric_type`, issue: "must be a non-empty string" }
      ]);
    }

    return {
      metric_type: metricType,
      value: parseMetricValue(entry.value, index),
      raw: parseRawPayload(entry.raw, index)
    };
  });
}

function mapSnapshot(row: {
  id: string;
  attemptId: string;
  postId: string;
  creatorId: string;
  destination: string;
  externalUrl: string;
  externalId: string | null;
  metricType: string;
  value: number | null;
  raw: unknown;
  source: string;
  capturedAt: Date;
}): ExternalPostMetricSnapshotWire {
  return {
    snapshot_id: row.id,
    attempt_id: row.attemptId,
    post_id: row.postId,
    creator_id: row.creatorId,
    destination: row.destination,
    external_url: row.externalUrl,
    external_id: row.externalId,
    metric_type: row.metricType,
    value: row.value,
    raw:
      row.raw && typeof row.raw === "object" && !Array.isArray(row.raw)
        ? (row.raw as Record<string, unknown>)
        : {},
    source: row.source as ExternalMetricSource,
    captured_at: row.capturedAt.toISOString()
  };
}

export async function recordExternalPostMetricSnapshots(
  prisma: PrismaClient,
  creatorId: string,
  attemptId: string,
  input: RecordExternalMetricsInput
): Promise<ExternalPostMetricSnapshotWire[]> {
  const cid = creatorId.trim();
  const aid = attemptId.trim();
  if (!cid || !aid) {
    throw new ExternalPostMetricsValidationError("Missing attempt context.", [
      { field: "attempt_id", issue: "creator and attempt id are required" }
    ]);
  }

  const source = parseSource(input.source);
  const metrics = parseMetrics(input.metrics);

  const attempt = await prisma.postDistributionAttempt.findFirst({
    where: { id: aid, creatorId: cid }
  });
  if (!attempt) {
    throw new PostDistributionNotFoundError("Attempt not found.");
  }
  if (attempt.status !== "posted") {
    throw new ExternalPostMetricsValidationError("Attempt is not posted.", [
      { field: "attempt_id", issue: "metrics can only be recorded for posted attempts" }
    ]);
  }
  const externalUrl = attempt.externalUrl?.trim() ?? "";
  if (!externalUrl) {
    throw new ExternalPostMetricsValidationError("Attempt has no external URL.", [
      { field: "attempt_id", issue: "external_url must be saved before metrics ingest" }
    ]);
  }

  const rows = await prisma.$transaction(async (tx) => {
    const instanceResult = await upsertPlatformInstanceFromAttempt(tx, {
      attemptId: attempt.id,
      creatorId: attempt.creatorId,
      postId: attempt.postId,
      destination: attempt.destination,
      externalUrl: attempt.externalUrl,
      externalId: attempt.externalId
    });
    const platformInstanceId = instanceResult?.platformInstanceId ?? null;

    const created = await Promise.all(
      metrics.map((metric) =>
        tx.externalPostMetricSnapshot.create({
          data: {
            attemptId: attempt.id,
            platformInstanceId,
            postId: attempt.postId,
            creatorId: attempt.creatorId,
            destination: attempt.destination,
            externalUrl,
            externalId: attempt.externalId?.trim() || null,
            metricType: metric.metric_type,
            value: metric.value,
            raw: (metric.raw ?? {}) as Prisma.InputJsonValue,
            source
          }
        })
      )
    );

    if (platformInstanceId) {
      await touchPlatformInstanceLastRefreshed(tx, platformInstanceId);
    }

    return created;
  });

  return rows.map(mapSnapshot);
}

type LinkedDistributionAttempt = {
  destination: string;
  attempt_id: string;
  external_url: string;
  external_id: string | null;
};

function latestMetricsByType(
  rows: Array<{
    id: string;
    metricType: string;
    value: number | null;
    source: string;
    capturedAt: Date;
  }>
): ExternalPostMetricLatestWire[] {
  const byType = new Map<string, ExternalPostMetricLatestWire>();
  for (const row of rows) {
    if (byType.has(row.metricType)) continue;
    byType.set(row.metricType, {
      snapshot_id: row.id,
      metric_type: row.metricType,
      value: row.value,
      source: row.source as ExternalMetricSource,
      captured_at: row.capturedAt.toISOString()
    });
  }
  return [...byType.values()].sort((a, b) => a.metric_type.localeCompare(b.metric_type));
}

type PatreonInsightsOverlayRow = {
  id: string;
  impressions: number | null;
  seen: number | null;
  likes: number | null;
  comments: number | null;
  asOf: Date | null;
  import: { uploadedAt: Date };
};

function overlayPatreonInsightsCsvMetrics(
  metrics: ExternalPostMetricLatestWire[],
  insight: PatreonInsightsOverlayRow | null
): ExternalPostMetricLatestWire[] {
  if (!insight) return metrics;

  const byType = new Map(metrics.map((metric) => [metric.metric_type, metric]));
  const capturedAt = (insight.asOf ?? insight.import.uploadedAt).toISOString();
  const overlayEntries: Array<[string, number | null]> = [
    ["impressions", insight.impressions],
    ["seen", insight.seen],
    ["likes", insight.likes],
    ["comments", insight.comments]
  ];

  for (const [metricType, value] of overlayEntries) {
    if (value === null || value === undefined) continue;
    if (byType.has(metricType)) continue;
    byType.set(metricType, {
      snapshot_id: `patreon_insights_csv:${insight.id}:${metricType}`,
      metric_type: metricType,
      value,
      source: "third_party",
      captured_at: capturedAt
    });
  }

  return [...byType.values()].sort((a, b) => a.metric_type.localeCompare(b.metric_type));
}

export async function getPostExternalMetrics(
  prisma: PrismaClient,
  creatorId: string,
  postId: string
): Promise<PostExternalMetricsWire> {
  const cid = creatorId.trim();
  const pid = postId.trim();
  if (!cid || !pid) {
    return { post_id: pid, destinations: [] };
  }

  const variants = await prisma.postDistributionVariant.findMany({
    where: { postId: pid, creatorId: cid },
    include: {
      attempts: { orderBy: { createdAt: "desc" }, take: 1 }
    }
  });

  const linkedAttempts: LinkedDistributionAttempt[] = [];
  for (const variant of variants) {
    const attempt = variant.attempts[0];
    const externalUrl = attempt?.externalUrl?.trim() ?? "";
    if (!attempt || attempt.status !== "posted" || !externalUrl) continue;
    linkedAttempts.push({
      destination: variant.destination,
      attempt_id: attempt.id,
      external_url: externalUrl,
      external_id: attempt.externalId?.trim() || null
    });
  }

  if (linkedAttempts.length === 0) {
    return { post_id: pid, destinations: [] };
  }

  const attemptIds = linkedAttempts.map((entry) => entry.attempt_id);
  const snapshots = await prisma.externalPostMetricSnapshot.findMany({
    where: {
      postId: pid,
      creatorId: cid,
      attemptId: { in: attemptIds }
    },
    orderBy: { capturedAt: "desc" },
    select: {
      id: true,
      attemptId: true,
      metricType: true,
      value: true,
      source: true,
      capturedAt: true
    }
  });

  const snapshotsByAttempt = new Map<string, typeof snapshots>();
  for (const row of snapshots) {
    const list = snapshotsByAttempt.get(row.attemptId) ?? [];
    list.push(row);
    snapshotsByAttempt.set(row.attemptId, list);
  }

  const patreonExternalIds = [
    ...new Set(
      linkedAttempts
        .filter((entry) => entry.destination === "patreon" && entry.external_id)
        .map((entry) => entry.external_id as string)
    )
  ];

  const insightsByPatreonPostId = new Map<string, PatreonInsightsOverlayRow>();
  if (patreonExternalIds.length > 0) {
    const insightRows = await prisma.patreonInsightsPostMetric.findMany({
      where: {
        creatorId: cid,
        patreonPostId: { in: patreonExternalIds }
      },
      orderBy: [{ asOf: "desc" }, { id: "desc" }],
      select: {
        id: true,
        patreonPostId: true,
        impressions: true,
        seen: true,
        likes: true,
        comments: true,
        asOf: true,
        import: { select: { uploadedAt: true } }
      }
    });
    for (const row of insightRows) {
      if (!insightsByPatreonPostId.has(row.patreonPostId)) {
        insightsByPatreonPostId.set(row.patreonPostId, row);
      }
    }
  }

  const destinations = linkedAttempts
    .sort((a, b) => a.destination.localeCompare(b.destination))
    .map((linked) => {
      const baseMetrics = latestMetricsByType(snapshotsByAttempt.get(linked.attempt_id) ?? []);
      const metrics =
        linked.destination === "patreon" && linked.external_id
          ? overlayPatreonInsightsCsvMetrics(
              baseMetrics,
              insightsByPatreonPostId.get(linked.external_id) ?? null
            )
          : baseMetrics;

      return {
        destination: linked.destination,
        attempt_id: linked.attempt_id,
        external_url: linked.external_url,
        external_id: linked.external_id,
        metrics
      };
    });

  return { post_id: pid, destinations };
}
