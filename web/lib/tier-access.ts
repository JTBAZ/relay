import type { FacetsData, GalleryItem, TierFacet } from "./relay-api";

export const RELAY_TIER_PUBLIC = "relay_tier_public";
/** Any logged-in patron; not a priced tier chip. */
export const RELAY_TIER_ALL_PATRONS = "relay_tier_all_patrons";
const RELAY_PUBLIC = RELAY_TIER_PUBLIC;
const RELAY_ALL = RELAY_TIER_ALL_PATRONS;

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

/** Pledge floor for a tier (0 = free/public access). Used only for display labels, NOT lock state. */
export function tierFloorCentsFromFacets(facets: FacetsData, tierId: string): number {
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
    max = Math.max(max, tierFloorCentsFromFacets(facets, tid));
  }
  return max;
}

// ─── Designer preview lock (semantic, not cents-based) ────────────────────────
//
// Mirrors server `resolvePostAccessLevel` / `canAccessPost` in tier-rules.ts.
// amount_cents is intentionally NOT used for lock state because it is optional
// and frequently missing/0 for real paid tiers, making cents comparisons unreliable.
//
// paidTierOrderIds: caller-supplied list of PAID Patreon tier IDs, sorted cheapest→most
//   expensive, with relay_tier_public and isFreePublicAccessTier tiers already excluded.
//   relay_tier_all_patrons is also excluded (handled specially below).
// viewerMaxRank: -1 = unauthenticated public visitor, 0..N = patron at rank N.
//
// Access levels (matches server):
//   public      – tier_ids = [relay_tier_public] only  → always visible
//   member_only – tier_ids = [relay_tier_all_patrons], empty, or no known paid tiers
//                                                       → visible to any patron (rank ≥ 0)
//   tier_gated  – tier_ids contains real Patreon tier IDs
//                                                       → visible if viewer rank ≥ min tier rank

/**
 * True when the item should show a lock overlay for the given simulated viewer.
 * Does NOT depend on amount_cents — uses tier ID semantics only.
 */
export function isItemLockedForDesignerPreview(
  item: GalleryItem | undefined,
  viewerMaxRank: number,
  paidTierOrderIds: string[]
): boolean {
  if (!item) return false;
  const tids = item.tier_ids;
  if (!tids.length) return viewerMaxRank < 0;                    // empty → member_only

  const hasPublic     = tids.some(t => t === RELAY_PUBLIC);
  const hasAllPatrons = tids.some(t => t === RELAY_ALL);
  const concrete      = tids.filter(t => t !== RELAY_PUBLIC && t !== RELAY_ALL);

  if (hasPublic && concrete.length === 0 && !hasAllPatrons) return false; // fully public
  if (hasAllPatrons && concrete.length === 0) return viewerMaxRank < 0;   // any patron

  // tier_gated: viewer needs at least one of the item's concrete paid tiers
  if (concrete.length === 0) return viewerMaxRank < 0;                    // fallback: member_only

  const ranks = concrete.map(t => paidTierOrderIds.indexOf(t)).filter(r => r >= 0);
  if (ranks.length === 0) return viewerMaxRank < 0;                        // unknown tiers → member_only
  return viewerMaxRank < Math.min(...ranks);
}

/** Tier ID used for the lock/badge label — cheapest concrete paid tier on the item by rank. */
function previewPrimaryTierId(
  item: GalleryItem | undefined,
  paidTierOrderIds: string[]
): string | "all_patrons" | null {
  if (!item) return null;
  const hasAllPatrons = item.tier_ids.some(t => t === RELAY_ALL);
  const concrete = item.tier_ids.filter(t => t !== RELAY_PUBLIC && t !== RELAY_ALL);

  if (concrete.length === 0) return hasAllPatrons ? "all_patrons" : null;

  let minR = Infinity;
  let minId: string | null = null;
  for (const tid of concrete) {
    const r = paidTierOrderIds.indexOf(tid);
    if (r >= 0 && r < minR) { minR = r; minId = tid; }
  }
  if (minId) return minId;
  return hasAllPatrons ? "all_patrons" : null;
}

export function designerUnlockLabelFromFacets(
  item: GalleryItem | undefined,
  paidTierOrderIds: string[],
  tierTitleById: Record<string, string>
): string {
  const tid = previewPrimaryTierId(item, paidTierOrderIds);
  if (tid === "all_patrons") {
    const first = paidTierOrderIds[0];
    const t = first ? (tierTitleById[first] ?? first).trim() : null;
    return t ? `${t}+` : "Any patron+";
  }
  if (!tid) return "Unlock";
  return `${(tierTitleById[tid] ?? tid).trim()}+`;
}

export function designerBadgeTitleFromFacets(
  item: GalleryItem | undefined,
  paidTierOrderIds: string[],
  tierTitleById: Record<string, string>
): string | null {
  const tid = previewPrimaryTierId(item, paidTierOrderIds);
  if (tid === "all_patrons") {
    const first = paidTierOrderIds[0];
    return first ? (tierTitleById[first] ?? first).trim() || null : null;
  }
  if (!tid) return null;
  return (tierTitleById[tid] ?? tid).trim() || null;
}

/** Next paid tier after the viewer's current rank (for upgrade nudge). */
export function nextPaidTierAfterRank(
  paidTierOrderIds: string[],
  tierTitleById: Record<string, string>,
  viewerMaxRank: number
): { id: string; title: string } | null {
  const next = paidTierOrderIds[viewerMaxRank + 1];
  if (!next) return null;
  return { id: next, title: (tierTitleById[next] ?? next).trim() };
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
