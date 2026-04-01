import type { FacetsData, GalleryItem, TierFacet } from "./relay-api";

const RELAY_PUBLIC = "relay_tier_public";
const RELAY_ALL = "relay_tier_all_patrons";

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
