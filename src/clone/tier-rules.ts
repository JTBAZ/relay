import type { TierRow } from "../ingest/canonical-store.js";
import {
  RELAY_TIER_ALL_PATRONS,
  RELAY_TIER_PUBLIC
} from "../patreon/relay-access-tiers.js";
import type { AccessLevel, CloneTierRule } from "./types.js";

export function evaluateTierRules(
  tiers: Record<string, TierRow>
): CloneTierRule[] {
  return Object.values(tiers)
    .filter((t) => !t.tier_id.startsWith("relay_tier_"))
    .map((t) => ({
      tier_id: t.tier_id,
      title: t.title,
      access_level: "tier_gated" as AccessLevel,
      campaign_id: t.campaign_id
    }));
}

/**
 * Pledge floor for ordering (cents). Synthetic tiers: public = 0, all_patrons = 1.
 * Unknown Patreon tier rows return `null` (fall back to id match in gate checks).
 */
export function tierFloorCents(
  tiers: Record<string, TierRow>,
  tierId: string
): number | null {
  if (tierId === RELAY_TIER_PUBLIC) return 0;
  if (tierId === RELAY_TIER_ALL_PATRONS) return 1;
  const row = tiers[tierId];
  const n = row?.amount_cents;
  if (typeof n === "number" && Number.isFinite(n) && n >= 0) return n;
  return null;
}

/**
 * “Tier or higher” semantics: for each required tier, the patron qualifies if they hold
 * **that** tier id **or** any tier whose pledge floor is **≥** the required floor (when both floors are known).
 */
export function userMeetsTierGatesWithOrdering(
  requiredTierIds: string[],
  userTierIds: string[],
  tiers: Record<string, TierRow>
): boolean {
  if (requiredTierIds.length === 0) return false;
  for (const req of requiredTierIds) {
    const reqFloor = tierFloorCents(tiers, req);
    for (const uid of userTierIds) {
      if (uid === req) return true;
      const uFloor = tierFloorCents(tiers, uid);
      if (reqFloor !== null && uFloor !== null && uFloor >= reqFloor) return true;
    }
  }
  return false;
}

export function resolvePostAccessLevel(
  tierIds: string[],
  tierRules: CloneTierRule[]
): { level: AccessLevel; tier_ids: string[] } {
  const synthPublic = tierIds.includes(RELAY_TIER_PUBLIC);
  const synthPatrons = tierIds.includes(RELAY_TIER_ALL_PATRONS);
  const patreonOnly = tierIds.filter(
    (t) => t !== RELAY_TIER_PUBLIC && t !== RELAY_TIER_ALL_PATRONS
  );

  if (patreonOnly.length === 0) {
    if (synthPublic && !synthPatrons) {
      return { level: "public", tier_ids: [] };
    }
    if (synthPatrons && !synthPublic) {
      return { level: "member_only", tier_ids: [] };
    }
  }

  if (tierIds.length === 0) {
    return { level: "member_only", tier_ids: [] };
  }
  const known = tierRules.filter((r) => tierIds.includes(r.tier_id));
  if (known.length === 0) {
    return { level: "member_only", tier_ids: [...tierIds] };
  }
  return { level: "tier_gated", tier_ids: known.map((r) => r.tier_id) };
}

export function canAccessPost(
  postAccess: { level: AccessLevel; tier_ids: string[] },
  userTierIds: string[],
  tierCatalog?: Record<string, TierRow>
): boolean {
  if (postAccess.level === "public") return true;
  if (postAccess.level === "member_only") return userTierIds.length > 0;
  if (
    tierCatalog &&
    Object.keys(tierCatalog).length > 0 &&
    postAccess.tier_ids.length > 0
  ) {
    return userMeetsTierGatesWithOrdering(
      postAccess.tier_ids,
      userTierIds,
      tierCatalog
    );
  }
  return postAccess.tier_ids.some((t) => userTierIds.includes(t));
}
