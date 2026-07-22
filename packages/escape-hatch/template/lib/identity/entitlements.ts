/**
 * Fail-closed entitlement read models (EH-030).
 * Never trust client persona tier_ids for authorization.
 */

import type {
  EntitlementReadResult,
  EntitlementSnapshot,
  EntitlementSource
} from "./types";

const ENTITLEMENT_SOURCES = new Set<EntitlementSource>([
  "patreon",
  "billing",
  "manual",
  "bootstrap"
]);

export function isEntitlementSource(value: unknown): value is EntitlementSource {
  return typeof value === "string" && ENTITLEMENT_SOURCES.has(value as EntitlementSource);
}

/**
 * Parse a row-shaped entitlement snapshot. Invalid input fails closed.
 */
export function parseEntitlementSnapshot(
  input: unknown
): EntitlementReadResult {
  if (!input || typeof input !== "object") {
    return {
      ok: false,
      reason: "Entitlement snapshot missing.",
      tierIds: []
    };
  }
  const row = input as Record<string, unknown>;
  const siteId = typeof row.site_id === "string" ? row.site_id : row.siteId;
  const authUserId =
    typeof row.auth_user_id === "string" ? row.auth_user_id : row.authUserId;
  const sourceRaw = row.source;
  const observedAt =
    typeof row.observed_at === "string"
      ? row.observed_at
      : typeof row.observedAt === "string"
        ? row.observedAt
        : null;

  if (typeof siteId !== "string" || siteId.length === 0) {
    return { ok: false, reason: "Entitlement site_id missing.", tierIds: [] };
  }
  if (typeof authUserId !== "string" || authUserId.length === 0) {
    return {
      ok: false,
      reason: "Entitlement auth_user_id missing.",
      tierIds: []
    };
  }
  if (!isEntitlementSource(sourceRaw)) {
    return {
      ok: false,
      reason: "Entitlement source invalid.",
      tierIds: []
    };
  }
  if (!observedAt) {
    return {
      ok: false,
      reason: "Entitlement observed_at missing.",
      tierIds: []
    };
  }

  const tierRaw = row.tier_ids ?? row.tierIds;
  const tierIds: string[] = [];
  if (Array.isArray(tierRaw)) {
    for (const t of tierRaw) {
      if (typeof t === "string" && t.trim().length > 0) {
        tierIds.push(t.trim());
      }
    }
  }

  const staleAfterRaw = row.stale_after ?? row.staleAfter;
  const staleAfter =
    typeof staleAfterRaw === "string" && staleAfterRaw.length > 0
      ? staleAfterRaw
      : null;
  const reasonRaw = row.reason;
  const reason =
    typeof reasonRaw === "string" && reasonRaw.length > 0 ? reasonRaw : null;

  const snapshot: EntitlementSnapshot = {
    siteId,
    authUserId,
    tierIds,
    source: sourceRaw,
    reason,
    observedAt,
    staleAfter
  };

  const stale = isEntitlementStale(snapshot, Date.now());
  return { ok: true, snapshot, stale };
}

export function isEntitlementStale(
  snapshot: EntitlementSnapshot,
  nowMs: number = Date.now()
): boolean {
  if (!snapshot.staleAfter) return false;
  const ts = Date.parse(snapshot.staleAfter);
  if (!Number.isFinite(ts)) return true;
  return nowMs >= ts;
}

/**
 * Effective tier ids for authorization. Fail-closed on missing/invalid/stale
 * when `failClosedOnStale` is true (default for premium paths).
 */
export function effectiveTierIds(
  result: EntitlementReadResult,
  opts?: { failClosedOnStale?: boolean }
): readonly string[] {
  if (!result.ok) return [];
  const failClosedOnStale = opts?.failClosedOnStale !== false;
  if (failClosedOnStale && result.stale) return [];
  return result.snapshot.tierIds;
}

/**
 * Soft persona tier_ids must never be used as server authorization input.
 * This helper documents the fail-closed rejection for tests and call sites.
 */
export function rejectClientPersonaTiers(_tierIds: unknown): readonly [] {
  return [];
}
