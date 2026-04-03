import type { FacetsData, GalleryItem, TierFacet } from "./relay-api";

export const RELAY_TIER_PUBLIC = "relay_tier_public";
const RELAY_PUBLIC = RELAY_TIER_PUBLIC;
const RELAY_ALL = "relay_tier_all_patrons";

/**
 * Tiers we collapse into one Access chip and one analytics bucket labeled "Free"
 * (Patreon public + free follower access; $0).
 */
export function isFreePublicAccessTier(t: TierFacet): boolean {
  if (t.tier_id === RELAY_PUBLIC) return true;
  const n = t.title.trim().toLowerCase();
  return n === "public" || n === "free";
}

export function freePublicTierIdsFromFacets(tiers: TierFacet[]): string[] {
  return tiers.filter(isFreePublicAccessTier).map((x) => x.tier_id);
}

/** Label used in analytics after resolving primary tier for an item. */
export function tierAnalyticsBucketLabel(tierId: string, displayTitle: string): string {
  if (tierId === RELAY_PUBLIC) return "Free";
  const n = displayTitle.trim().toLowerCase();
  if (n === "public" || n === "free") return "Free";
  return displayTitle;
}

function tierFloorCents(facets: FacetsData, tierId: string): number {
  if (tierId === RELAY_PUBLIC) return 0;
  if (tierId === RELAY_ALL) return 1;
  const row = facets.tiers.find((t) => t.tier_id === tierId);
  if (row && typeof row.amount_cents === "number" && Number.isFinite(row.amount_cents)) {
    return row.amount_cents;
  }
  return 0;
}

export function postTierFloorCentsFromFacets(facets: FacetsData, item: GalleryItem): number {
  if (!item.tier_ids.length) return 0;
  let max = 0;
  for (const tid of item.tier_ids) {
    max = Math.max(max, tierFloorCents(facets, tid));
  }
  return max;
}

export function ceilingAmountCents(facets: FacetsData, ceilingTierId: string | null | undefined): number | null {
  if (!ceilingTierId) return null;
  if (ceilingTierId === RELAY_PUBLIC) return 0;
  if (ceilingTierId === RELAY_ALL) return 1;
  const row = facets.tiers.find((t) => t.tier_id === ceilingTierId);
  if (row && typeof row.amount_cents === "number" && Number.isFinite(row.amount_cents)) {
    return row.amount_cents;
  }
  return null;
}

/** When ceiling is set but amount unknown, do not block in UI (server may still allow). */
export function postFitsCeilingInUi(
  facets: FacetsData,
  item: GalleryItem,
  ceilingTierId: string | null | undefined
): boolean {
  const cap = ceilingAmountCents(facets, ceilingTierId);
  if (cap === null && ceilingTierId && ceilingTierId !== RELAY_PUBLIC && ceilingTierId !== RELAY_ALL) {
    return true;
  }
  if (cap === null) return true;
  return postTierFloorCentsFromFacets(facets, item) <= cap;
}

export function tierFacetLabel(t: TierFacet): string {
  const cents = t.amount_cents;
  if (typeof cents === "number" && cents > 0) {
    return `${t.title} ($${(cents / 100).toFixed(0)})`;
  }
  return t.title;
}

/** Floor cents for access chip ordering (matches server `effectiveTierAmountCents` semantics). */
function accessChipFloorCents(tiers: TierFacet[], tierId: string): number {
  if (tierId === RELAY_PUBLIC) return 0;
  if (tierId === RELAY_ALL) return 1;
  const row = tiers.find((t) => t.tier_id === tierId);
  if (row && typeof row.amount_cents === "number" && Number.isFinite(row.amount_cents)) {
    return row.amount_cents;
  }
  return 0;
}

/**
 * Single badge tier: highest pledge floor among `tier_ids`, using facet `amount_cents`.
 * Tie-break: lexicographically smallest `tier_id`.
 */
export function pickPrimaryAccessTierIdForChip(tierIds: string[], tiers: TierFacet[]): string | null {
  if (!tierIds.length) return null;
  let bestId = tierIds[0]!;
  let bestFloor = accessChipFloorCents(tiers, bestId);
  for (let i = 1; i < tierIds.length; i++) {
    const id = tierIds[i]!;
    const f = accessChipFloorCents(tiers, id);
    if (f > bestFloor || (f === bestFloor && id.localeCompare(bestId) < 0)) {
      bestId = id;
      bestFloor = f;
    }
  }
  return bestId;
}

/** Order tier ids for multi-chip display: highest floor first. */
export function sortTierIdsForAccessChip(tierIds: string[], tiers: TierFacet[]): string[] {
  return [...tierIds].sort((a, b) => {
    const fa = accessChipFloorCents(tiers, a);
    const fb = accessChipFloorCents(tiers, b);
    if (fb !== fa) return fb - fa;
    return a.localeCompare(b);
  });
}
