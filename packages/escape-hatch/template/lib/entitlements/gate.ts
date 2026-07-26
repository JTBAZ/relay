/**
 * Resource gate check aligned with preview `canAccessPost` semantics (EH-032 / EH-082).
 * Kept local so entitlements do not import the fill-template contracts module.
 *
 * Parity rules (canonical `src/contracts.ts`):
 * - Missing `amount_cents` is not automatically free; free-title heuristic applies.
 * - Unknown floors must not authorize a different tier under `tier_or_higher`
 *   (exact tier id still matches).
 * - Relay sentinel ids are never paid pledges.
 */

import type { AccessLevel, TierMatchMode } from "./types";

/** Matches contracts FREE_TIER_TITLE_RE / Relay tier-rules isFreeTier. */
const FREE_TIER_TITLE_RE =
  /^\s*(free(\s*tier|\s*member|\s*access|\s*follower)?)\s*$/i;

const RELAY_TIER_PUBLIC = "relay_tier_public";
const RELAY_TIER_ALL_PATRONS = "relay_tier_all_patrons";

export type GateTierEntry = {
  amount_cents?: number | null;
  title?: string;
  currency?: string;
};

function isFreeTier(entry: GateTierEntry | undefined): boolean {
  if (!entry) return false;
  const amt = entry.amount_cents;
  if (typeof amt === "number" && Number.isFinite(amt)) {
    return amt <= 0;
  }
  return typeof entry.title === "string" && FREE_TIER_TITLE_RE.test(entry.title);
}

function paidUserTierIds(
  userTierIds: readonly string[],
  catalog: Record<string, GateTierEntry>
): string[] {
  const out: string[] = [];
  for (const id of userTierIds) {
    if (id === RELAY_TIER_PUBLIC || id === RELAY_TIER_ALL_PATRONS) continue;
    const row = Object.prototype.hasOwnProperty.call(catalog, id)
      ? catalog[id]
      : undefined;
    if (row && isFreeTier(row)) continue;
    out.push(id);
  }
  return out;
}

function tierFloorCents(
  tierId: string,
  catalog: Record<string, GateTierEntry>
): number | null {
  if (tierId === RELAY_TIER_PUBLIC) return 0;
  if (tierId === RELAY_TIER_ALL_PATRONS) return 1;
  const row = Object.prototype.hasOwnProperty.call(catalog, tierId)
    ? catalog[tierId]
    : undefined;
  const n = row?.amount_cents;
  if (typeof n === "number" && Number.isFinite(n) && n >= 0) return n;
  return null;
}

function userMeetsTierGatesExact(
  required: readonly string[],
  paid: readonly string[]
): boolean {
  return required.some((t) => paid.includes(t));
}

function userMeetsTierGatesWithOrdering(
  required: readonly string[],
  paid: readonly string[],
  catalog: Record<string, GateTierEntry>
): boolean {
  if (required.length === 0) return false;
  for (const req of required) {
    const reqFloor = tierFloorCents(req, catalog);
    for (const uid of paid) {
      if (uid === req) return true;
      const uFloor = tierFloorCents(uid, catalog);
      if (reqFloor !== null && uFloor !== null && uFloor >= reqFloor) return true;
    }
  }
  return false;
}

/**
 * Same semantics as contracts.canAccessPost for authorization decisions.
 */
export function userMeetsResourceGate(
  gate: {
    level: AccessLevel;
    tierIds: readonly string[];
    matchMode?: TierMatchMode;
  },
  userTierIds: readonly string[],
  tierCatalog?: Record<string, GateTierEntry>
): boolean {
  if (gate.level === "public") return true;

  const catalogKeys =
    tierCatalog && typeof tierCatalog === "object"
      ? Object.keys(tierCatalog)
      : [];
  const hasCatalog = catalogKeys.length > 0;

  const paid = hasCatalog
    ? paidUserTierIds(userTierIds, tierCatalog!)
    : [...userTierIds];

  if (gate.level === "member_only") return paid.length > 0;

  if (hasCatalog && gate.tierIds.length > 0) {
    if (gate.tierIds.some((t) => isFreeTier(tierCatalog![t]))) {
      if (gate.tierIds.some((t) => userTierIds.includes(t))) return true;
    }
    const mode = gate.matchMode ?? "tier_or_higher";
    if (mode === "exact") {
      return userMeetsTierGatesExact(gate.tierIds, paid);
    }
    return userMeetsTierGatesWithOrdering(gate.tierIds, paid, tierCatalog!);
  }

  return gate.tierIds.some((t) => userTierIds.includes(t));
}
