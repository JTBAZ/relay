/**
 * Entitlement freshness / staleness policy (EH-032).
 *
 * Rules:
 * - `stale_after` past → grant is stale.
 * - Missing/invalid `stale_after` → not auto-stale (manual grants may use expires_at only).
 * - Premium content (member_only / tier_gated / media / tier_minimum): fail-closed on stale.
 * - Public content: always allow; stale flag unused.
 * - Soft UI may warn when observed_at is older than warnAfterMs even if not hard-stale.
 */

import type { EntitlementSource } from "../identity/types";
import type { EntitlementGrant, FreshnessPolicy } from "./types";

/** Default policy — honest for Patreon polling vs billing webhooks vs manual. */
export const DEFAULT_FRESHNESS_POLICY: FreshnessPolicy = {
  warnAfterMs: 12 * 60 * 60 * 1000, // 12h
  hardDenyWhenStale: true,
  defaultStaleAfterBySource: {
    patreon: 24 * 60 * 60 * 1000, // 24h
    billing: 6 * 60 * 60 * 1000, // 6h
    manual: null, // use expires_at only
    bootstrap: 7 * 24 * 60 * 60 * 1000 // 7d
  }
};

export function isTimestampPast(
  iso: string | null | undefined,
  nowMs: number
): boolean {
  if (!iso) return false;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return true; // invalid → treat as past (fail closed)
  return nowMs >= ts;
}

export function isGrantStale(
  grant: Pick<EntitlementGrant, "staleAfter">,
  nowMs: number = Date.now()
): boolean {
  return isTimestampPast(grant.staleAfter, nowMs);
}

export function isGrantExpired(
  grant: Pick<EntitlementGrant, "expiresAt">,
  nowMs: number = Date.now()
): boolean {
  return isTimestampPast(grant.expiresAt, nowMs);
}

export function isGrantRevoked(
  grant: Pick<EntitlementGrant, "revokedAt" | "status">
): boolean {
  if (grant.status === "revoked") return true;
  return Boolean(grant.revokedAt);
}

/**
 * Resolve grant status from timestamps. Order: revoked → expired → stale → active.
 */
export function resolveGrantStatus(
  grant: Pick<
    EntitlementGrant,
    "staleAfter" | "expiresAt" | "revokedAt" | "status"
  >,
  nowMs: number = Date.now()
): EntitlementGrant["status"] {
  if (isGrantRevoked(grant)) return "revoked";
  if (isGrantExpired(grant, nowMs)) return "expired";
  if (isGrantStale(grant, nowMs)) return "stale";
  return "active";
}

export function computeDefaultStaleAfter(
  source: EntitlementSource,
  observedAtIso: string,
  policy: FreshnessPolicy = DEFAULT_FRESHNESS_POLICY
): string | null {
  const offset = policy.defaultStaleAfterBySource[source];
  if (offset == null) return null;
  const observed = Date.parse(observedAtIso);
  if (!Number.isFinite(observed)) return null;
  return new Date(observed + offset).toISOString();
}

/**
 * Soft UI warning: observed_at older than warnAfterMs, grant still active.
 * Does not itself deny access.
 */
export function shouldWarnFreshness(
  grant: Pick<EntitlementGrant, "observedAt" | "status">,
  nowMs: number = Date.now(),
  policy: FreshnessPolicy = DEFAULT_FRESHNESS_POLICY
): boolean {
  if (grant.status !== "active") return false;
  if (!grant.observedAt) return false;
  const observed = Date.parse(grant.observedAt);
  if (!Number.isFinite(observed)) return true;
  return nowMs - observed >= policy.warnAfterMs;
}
