/**
 * Grant merge (EH-032).
 *
 * effective access = active Patreon OR active billing OR unexpired manual
 * (plus staff override at evaluate time; soft persona only in local_preview).
 *
 * Duplicate sources do not create duplicate accounts; cancellation of one
 * source does not revoke another active source. Tier ids are unioned across
 * active grants.
 */

import type { EntitlementGrant } from "./types";
import {
  isGrantExpired,
  isGrantRevoked,
  isGrantStale,
  resolveGrantStatus
} from "./freshness";

export type MergedGrants = {
  /** All input grants with resolved status. */
  grants: EntitlementGrant[];
  /** Tier ids from active (non-stale when failClosedOnStale) grants. */
  effectiveTier: readonly string[];
  /** True if any considered grant is stale. */
  anyStale: boolean;
  /** Best deny reason when no active grant remains. */
  denyReason:
    | "no_entitlement"
    | "entitlement_expired"
    | "entitlement_revoked"
    | "entitlement_stale"
    | null;
};

function uniqueTiers(ids: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== "string" || id.trim().length === 0) continue;
    const t = id.trim();
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * Normalize and merge grant rows. Never elevates via soft_persona source when
 * called from a configured-provider path (caller must omit those grants).
 */
export function mergeEntitlementGrants(
  input: readonly EntitlementGrant[],
  opts?: { nowMs?: number; failClosedOnStale?: boolean }
): MergedGrants {
  const nowMs = opts?.nowMs ?? Date.now();
  const failClosedOnStale = opts?.failClosedOnStale !== false;

  const grants: EntitlementGrant[] = input.map((g) => {
    const status = resolveGrantStatus(g, nowMs);
    return {
      source: g.source,
      tierIds: uniqueTiers(g.tierIds),
      status,
      observedAt: g.observedAt,
      staleAfter: g.staleAfter,
      expiresAt: g.expiresAt,
      revokedAt: g.revokedAt,
      reason: g.reason
    };
  });

  const activeForAuth: EntitlementGrant[] = [];
  let anyStale = false;
  let sawRevoked = false;
  let sawExpired = false;
  let sawStale = false;
  let sawAny = grants.length > 0;

  for (const g of grants) {
    if (g.source === "staff") {
      // Staff grants are handled at evaluate time; skip tier merge.
      continue;
    }
    if (isGrantRevoked(g)) {
      sawRevoked = true;
      continue;
    }
    if (isGrantExpired(g, nowMs)) {
      sawExpired = true;
      continue;
    }
    if (isGrantStale(g, nowMs) || g.status === "stale") {
      anyStale = true;
      sawStale = true;
      if (failClosedOnStale) continue;
      // fail-open: include tiers but keep stale flag
      activeForAuth.push(g);
      continue;
    }
    if (g.status === "active") {
      activeForAuth.push(g);
    }
  }

  const effectiveTier = uniqueTiers(activeForAuth.flatMap((g) => [...g.tierIds]));

  let denyReason: MergedGrants["denyReason"] = null;
  if (effectiveTier.length === 0) {
    if (!sawAny) denyReason = "no_entitlement";
    else if (sawRevoked && !sawExpired && !sawStale) denyReason = "entitlement_revoked";
    else if (sawExpired && !sawStale) denyReason = "entitlement_expired";
    else if (sawStale && failClosedOnStale) denyReason = "entitlement_stale";
    else if (sawRevoked) denyReason = "entitlement_revoked";
    else if (sawExpired) denyReason = "entitlement_expired";
    else denyReason = "no_entitlement";
  }

  return {
    grants,
    effectiveTier,
    anyStale,
    denyReason
  };
}

/**
 * Build a grant from an entitlement snapshot row shape (no secrets).
 */
export function grantFromSnapshot(input: {
  source: EntitlementGrant["source"];
  tierIds: readonly string[];
  observedAt: string | null;
  staleAfter: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  reason?: string | null;
  nowMs?: number;
}): EntitlementGrant {
  const base: EntitlementGrant = {
    source: input.source,
    tierIds: uniqueTiers(input.tierIds),
    status: "active",
    observedAt: input.observedAt,
    staleAfter: input.staleAfter,
    expiresAt: input.expiresAt ?? null,
    revokedAt: input.revokedAt ?? null,
    reason: input.reason ?? null
  };
  return {
    ...base,
    status: resolveGrantStatus(base, input.nowMs ?? Date.now())
  };
}
