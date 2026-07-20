/**
 * Trend evidence run persistence and cache (VS3-T03).
 * Raw provider excerpts are stripped before storage (default off).
 */

import { createHash } from "node:crypto";
import type { GoalCycleTrendRun, Prisma, PrismaClient } from "@prisma/client";
import type { TrendEvidence, TrendResearchRequest } from "./provider-types.js";
import { TREND_PROVIDER_CONTRACT_VERSION } from "./provider-types.js";

export type TrendDb = PrismaClient | Prisma.TransactionClient;

export const TREND_RUN_STATUSES = ["pending", "complete", "failed"] as const;
export type TrendRunStatus = (typeof TREND_RUN_STATUSES)[number];

export const DEFAULT_TREND_CACHE_TTL_SECONDS = 3600;

export type TrendCacheParts = {
  topic: string;
  locale: string | null;
  geography: string | null;
  window: string;
  mode: string;
  interest_provider_id: string | null;
  interest_provider_version: string | null;
  web_provider_id: string | null;
  web_provider_version: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function buildTrendQueryHash(parts: {
  topic: string;
  locale: string | null;
  geography: string | null;
  window: string;
}): string {
  const material = [
    parts.topic.trim().toLowerCase(),
    parts.locale?.trim().toLowerCase() ?? "",
    parts.geography?.trim().toLowerCase() ?? "",
    parts.window.trim().toLowerCase()
  ].join("|");
  return createHash("sha256").update(material).digest("hex");
}

export function buildTrendCacheKey(parts: TrendCacheParts): string {
  const material = [
    TREND_PROVIDER_CONTRACT_VERSION,
    parts.mode,
    parts.topic.trim().toLowerCase(),
    parts.locale?.trim().toLowerCase() ?? "",
    parts.geography?.trim().toLowerCase() ?? "",
    parts.window.trim().toLowerCase(),
    parts.interest_provider_id ?? "none",
    parts.interest_provider_version ?? "none",
    parts.web_provider_id ?? "none",
    parts.web_provider_version ?? "none"
  ].join("|");
  return createHash("sha256").update(material).digest("hex");
}

/** Strip raw excerpts before persist — planner never needs them from cache. */
export function stripRawFromEvidence(evidence: TrendEvidence): TrendEvidence {
  return {
    ...evidence,
    interest_series: evidence.interest_series
      ? { ...evidence.interest_series, raw_provider_excerpt: null }
      : null,
    web_discovery: evidence.web_discovery
      ? { ...evidence.web_discovery, raw_provider_excerpt: null }
      : null
  };
}

export function evidenceFromStoredJson(value: unknown): TrendEvidence | null {
  if (!isRecord(value)) return null;
  if (typeof value.run_id !== "string" || typeof value.creator_id !== "string") return null;
  if (typeof value.prompt_safe_summary !== "string") return null;
  if (typeof value.composite_strength !== "string") return null;
  return value as unknown as TrendEvidence;
}

export function resolveTrendCacheTtlSeconds(input: {
  evidence: TrendEvidence;
  defaultTtlSeconds?: number;
}): number {
  const fallback = Math.max(60, input.defaultTtlSeconds ?? DEFAULT_TREND_CACHE_TTL_SECONDS);
  const candidates = [
    input.evidence.interest_series?.freshness_seconds,
    input.evidence.web_discovery?.freshness_seconds,
    input.evidence.creator_history.freshness_seconds
  ].filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0);
  if (candidates.length === 0) return fallback;
  return Math.min(fallback, Math.max(60, Math.floor(Math.min(...candidates))));
}

export function isTrendCacheFresh(row: Pick<GoalCycleTrendRun, "status" | "expiresAt">, now: Date): boolean {
  if (row.status !== "complete") return false;
  if (!row.expiresAt) return false;
  return row.expiresAt.getTime() > now.getTime();
}

export async function findTrendRunByRequestId(
  db: TrendDb,
  creatorId: string,
  requestId: string
): Promise<GoalCycleTrendRun | null> {
  return db.goalCycleTrendRun.findUnique({
    where: { creatorId_requestId: { creatorId, requestId } }
  });
}

export async function findFreshTrendCacheHit(
  db: TrendDb,
  creatorId: string,
  cacheKey: string,
  now: Date
): Promise<GoalCycleTrendRun | null> {
  const row = await db.goalCycleTrendRun.findFirst({
    where: {
      creatorId,
      cacheKey,
      status: "complete",
      expiresAt: { gt: now }
    },
    orderBy: { completedAt: "desc" }
  });
  return row;
}

export async function createPendingTrendRun(
  db: TrendDb,
  data: {
    id: string;
    creatorId: string;
    cycleId?: string | null;
    requestId: string;
    queryHash: string;
    cacheKey: string;
    mode: string;
    providerIds: string[];
    providerVersions: Record<string, string>;
    startedAt?: Date;
  }
): Promise<GoalCycleTrendRun> {
  return db.goalCycleTrendRun.create({
    data: {
      id: data.id,
      creatorId: data.creatorId,
      cycleId: data.cycleId ?? null,
      requestId: data.requestId,
      queryHash: data.queryHash,
      cacheKey: data.cacheKey,
      mode: data.mode,
      providerIdsJson: data.providerIds,
      providerVersionsJson: data.providerVersions,
      status: "pending",
      startedAt: data.startedAt ?? new Date()
    }
  });
}

export async function completeTrendRun(
  db: TrendDb,
  runId: string,
  data: {
    evidence: TrendEvidence;
    expiresAt: Date;
    completedAt?: Date;
  }
): Promise<GoalCycleTrendRun> {
  const stored = stripRawFromEvidence(data.evidence);
  return db.goalCycleTrendRun.update({
    where: { id: runId },
    data: {
      status: "complete",
      evidenceJson: stored as unknown as Prisma.InputJsonValue,
      strength: stored.composite_strength,
      confidence: stored.confidence,
      completedAt: data.completedAt ?? new Date(),
      expiresAt: data.expiresAt,
      errorCode: null
    }
  });
}

/**
 * Ensure this request_id has a complete TrendRun row (e.g. after query-cache hit).
 * Polling clients look up by request_id; returning evidence alone leaves status "not_started".
 */
export async function materializeCompleteTrendRunForRequest(
  db: TrendDb,
  data: {
    id: string;
    creatorId: string;
    cycleId?: string | null;
    requestId: string;
    queryHash: string;
    cacheKey: string;
    mode: string;
    providerIds: string[];
    providerVersions: Record<string, string>;
    evidence: TrendEvidence;
    expiresAt: Date;
    startedAt?: Date;
    completedAt?: Date;
  }
): Promise<GoalCycleTrendRun> {
  const existing = await findTrendRunByRequestId(db, data.creatorId, data.requestId);
  if (existing?.status === "complete") {
    return existing;
  }
  if (existing) {
    return completeTrendRun(db, existing.id, {
      evidence: data.evidence,
      expiresAt: data.expiresAt,
      completedAt: data.completedAt
    });
  }
  await createPendingTrendRun(db, {
    id: data.id,
    creatorId: data.creatorId,
    cycleId: data.cycleId,
    requestId: data.requestId,
    queryHash: data.queryHash,
    cacheKey: data.cacheKey,
    mode: data.mode,
    providerIds: data.providerIds,
    providerVersions: data.providerVersions,
    startedAt: data.startedAt
  });
  return completeTrendRun(db, data.id, {
    evidence: data.evidence,
    expiresAt: data.expiresAt,
    completedAt: data.completedAt
  });
}

export async function failTrendRun(
  db: TrendDb,
  runId: string,
  errorCode: string,
  completedAt?: Date
): Promise<GoalCycleTrendRun> {
  return db.goalCycleTrendRun.update({
    where: { id: runId },
    data: {
      status: "failed",
      errorCode: errorCode.slice(0, 64),
      completedAt: completedAt ?? new Date()
    }
  });
}

/** Build cache parts from a sanitized request + resolved provider ids. */
export function cachePartsFromRequest(
  request: TrendResearchRequest,
  mode: string,
  providers: {
    interest_provider_id: string | null;
    interest_provider_version: string | null;
    web_provider_id: string | null;
    web_provider_version: string | null;
  }
): TrendCacheParts {
  return {
    topic: request.topic,
    locale: request.locale,
    geography: request.geography,
    window: request.window,
    mode,
    ...providers
  };
}
