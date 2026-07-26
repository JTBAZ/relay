/**
 * @fileoverview Tier pledge-floor helpers for comparing posts to library collection access ceilings.
 * @description Uses canonical tier rows and synthetic Relay tier ids (`RELAY_TIER_PUBLIC`, `RELAY_TIER_ALL_PATRONS`).
 * @see prisma/schema.prisma Tier / campaign models consumed via canonical snapshot
 * @see src/jsdoc-core-entities.ts Artist/Gallery/SyncStatus mapping notes
 */

import type { CanonicalSnapshot, TierRow } from "../ingest/canonical-store.js";
import { RELAY_TIER_ALL_PATRONS, RELAY_TIER_PUBLIC } from "../patreon/relay-access-tiers.js";

/**
 * @description Minimum pledge floor (cents) implied by a single tier id, for ordering against a collection access ceiling. Synthetic tiers: public = 0, all_patrons = 1 (any paid access is stricter than fully public).
 * @param tierMap Canonical tier id → row map for one creator.
 * @param tierId Tier id or synthetic Relay tier constant.
 * @returns Non-negative cents floor; missing tier rows treated as 0.
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

/**
 * @description Max tier floor among a post's `tier_ids` — content is at least this "expensive"; missing post → `Number.MAX_SAFE_INTEGER`.
 * @param snapshot Canonical ingest snapshot.
 * @param creatorId Creator partition inside the snapshot.
 * @param postId Post id.
 * @returns Maximum effective cents across post tiers, or 0 when post has no tiers.
 * @security-audit-required Caller must ensure `creatorId`/`postId` match an authorized creator scope; no `tenant_id` in signature—enforce at route layer.
 */
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

/**
 * @description Resolves the pledge floor (cents) for a collection access-ceiling tier id, or `null` when the tier is unknown in canonical.
 * @param snapshot Canonical ingest snapshot.
 * @param creatorId Creator partition.
 * @param ceilingTierId Tier id acting as maximum pledge for collection membership.
 * @returns Tier amount in cents, `0`/`1` for synthetic tiers, or `null` if tier missing.
 * @security-audit-required Caller must scope `creatorId` to the authenticated creator; no explicit tenant key on this helper.
 */
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

/**
 * @description Whether a post's tier floor is within a collection's access ceiling (unknown ceiling → permissive `true`).
 * @param snapshot Canonical ingest snapshot.
 * @param creatorId Creator partition.
 * @param postId Post id.
 * @param ceilingTierId Collection ceiling tier id.
 * @returns `true` when post fits or ceiling cannot be resolved.
 * @security-audit-required Route must bind `creatorId` to authorized context; helper does not validate tenancy.
 */
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
