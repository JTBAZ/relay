import type { CanonicalSnapshot, TierRow } from "../ingest/canonical-store.js";
import { RELAY_TIER_ALL_PATRONS, RELAY_TIER_PUBLIC } from "../patreon/relay-access-tiers.js";

/**
 * Minimum pledge floor (cents) implied by a single tier id, for ordering against
 * a collection access ceiling. Synthetic tiers: public = 0, all_patrons = 1
 * (any paid access is stricter than fully public).
 */
export function effectiveTierAmountCents(
  tierMap: Record<string, TierRow>,
  tierId: string
): number {
  if (tierId === RELAY_TIER_PUBLIC) return 0;
  if (tierId === RELAY_TIER_ALL_PATRONS) return 1;
  const row = tierMap[tierId];
  const n = row?.amount_cents;
  if (typeof n === "number" && Number.isFinite(n) && n >= 0) return n;
  return 0;
}

/** Max tier floor among a post's tier_ids — content is at least this "expensive". */
export function postTierFloorCents(
  snapshot: CanonicalSnapshot,
  creatorId: string,
  postId: string
): number {
  const post = snapshot.posts[creatorId]?.[postId];
  if (!post) return Number.MAX_SAFE_INTEGER;
  const tierMap = snapshot.tiers[creatorId] ?? {};
  const ids = post.current.tier_ids;
  if (!ids.length) return 0;
  let max = 0;
  for (const tid of ids) {
    max = Math.max(max, effectiveTierAmountCents(tierMap, tid));
  }
  return max;
}

export function ceilingTierAmountCents(
  snapshot: CanonicalSnapshot,
  creatorId: string,
  ceilingTierId: string
): number | null {
  const tierMap = snapshot.tiers[creatorId] ?? {};
  if (ceilingTierId === RELAY_TIER_PUBLIC) return 0;
  if (ceilingTierId === RELAY_TIER_ALL_PATRONS) return 1;
  const row = tierMap[ceilingTierId];
  if (row && typeof row.amount_cents === "number" && Number.isFinite(row.amount_cents)) {
    return row.amount_cents;
  }
  return null;
}

export function postFitsAccessCeiling(
  snapshot: CanonicalSnapshot,
  creatorId: string,
  postId: string,
  ceilingTierId: string
): boolean {
  const cap = ceilingTierAmountCents(snapshot, creatorId, ceilingTierId);
  if (cap === null) return true;
  const floor = postTierFloorCents(snapshot, creatorId, postId);
  return floor <= cap;
}
