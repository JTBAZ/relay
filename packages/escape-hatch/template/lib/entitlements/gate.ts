/**
 * Resource gate check aligned with preview `canAccessPost` semantics (EH-032).
 * Kept local so entitlements do not import the fill-template contracts module.
 */

import type { AccessLevel, TierMatchMode } from "./types";

export type GateTierEntry = {
  amount_cents?: number | null;
  title?: string;
  currency?: string;
};

function isFreeTier(entry: GateTierEntry | undefined): boolean {
  if (!entry) return false;
  return (entry.amount_cents ?? 0) <= 0;
}

function paidUserTierIds(
  userTierIds: readonly string[],
  catalog: Record<string, GateTierEntry>
): string[] {
  return userTierIds.filter((id) => {
    const entry = catalog[id];
    if (!entry) return true; // unknown id: treat as potentially paid (fail-open for catalog gaps → still need gate match)
    return !isFreeTier(entry);
  });
}

function tierFloorCents(
  tierId: string,
  catalog: Record<string, GateTierEntry>
): number {
  return catalog[tierId]?.amount_cents ?? 0;
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
  if (required.length === 0) return paid.length > 0;
  const minRequired = Math.min(
    ...required.map((t) => tierFloorCents(t, catalog))
  );
  return paid.some((t) => tierFloorCents(t, catalog) >= minRequired);
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
