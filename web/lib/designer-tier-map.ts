import type { FacetsData, GalleryItem } from "@/lib/relay-api";
import type { TierKey } from "@/lib/designer-mock";
import {
  designerBadgeTitleFromFacets,
  designerUnlockLabelFromFacets,
  isItemLockedForDesignerPreview as isItemLockedSemantic,
} from "@/lib/tier-access";

const TIER_ORDER: TierKey[] = ["public", "supporter", "member", "inner"];

function tierIndex(t: TierKey): number {
  return TIER_ORDER.indexOf(t);
}

/**
 * Maps a gallery row to a designer preview tier band using facet tier order (low → high price).
 * Used when a section mixes posts (e.g. full-catalog filter) so each tile gets its own badge/lock state.
 */
export function tierKeyForGalleryItem(
  item: GalleryItem | undefined,
  tierOrderIds: string[]
): TierKey {
  if (!item?.tier_ids?.length || tierOrderIds.length === 0) return "public";

  let maxR = -1;
  for (const tid of item.tier_ids) {
    const r = tierOrderIds.indexOf(tid);
    if (r > maxR) maxR = r;
  }
  if (maxR < 0) return "public";

  const n = tierOrderIds.length;
  if (n === 1) return "supporter";

  const t = maxR / (n - 1);
  if (t < 0.26) return "public";
  if (t < 0.51) return "supporter";
  if (t < 0.76) return "member";
  return "inner";
}

/**
 * Minimum tier rank required to view this item (cheapest tier among the post's `tier_ids`).
 * -1 means public / no tier gate.
 */
export function itemAccessRank(
  item: GalleryItem | undefined,
  tierOrderIds: string[]
): number {
  if (!item?.tier_ids?.length || tierOrderIds.length === 0) return -1;
  let minR = Infinity;
  for (const tid of item.tier_ids) {
    const r = tierOrderIds.indexOf(tid);
    if (r >= 0) minR = Math.min(minR, r);
  }
  return minR === Infinity ? -1 : minR;
}

/** Patreon-style: higher tiers include lower; viewer rank v unlocks items with access rank ≤ v. */
export function isItemLockedForViewer(
  item: GalleryItem | undefined,
  viewerMaxRank: number,
  tierOrderIds: string[]
): boolean {
  const r = itemAccessRank(item, tierOrderIds);
  if (r < 0) return false;
  return viewerMaxRank < r;
}

/** Tier id for the cheapest tier that unlocks the post — used for lock copy. */
export function accessTierIdForItem(
  item: GalleryItem | undefined,
  tierOrderIds: string[]
): string | null {
  if (!item?.tier_ids?.length || tierOrderIds.length === 0) return null;
  let minR = Infinity;
  let bestId: string | null = null;
  for (const tid of item.tier_ids) {
    const r = tierOrderIds.indexOf(tid);
    if (r >= 0 && r < minR) {
      minR = r;
      bestId = tid;
    }
  }
  return bestId;
}

export function unlockLabelForItem(
  item: GalleryItem | undefined,
  tierOrderIds: string[],
  tierTitleById: Record<string, string>
): string {
  const tid = accessTierIdForItem(item, tierOrderIds);
  if (!tid) return "Unlock";
  const title = (tierTitleById[tid] ?? tid).trim();
  return `${title}+`;
}

/** Badge chip text when facet titles exist; falls back to null (caller uses TierKey label). */
export function badgeTitleForItem(
  item: GalleryItem | undefined,
  tierOrderIds: string[],
  tierTitleById: Record<string, string>
): string | null {
  const tid = accessTierIdForItem(item, tierOrderIds);
  if (!tid) return null;
  const title = (tierTitleById[tid] ?? tid).trim();
  return title || null;
}

/**
 * Stub tile (no loaded row): map bucket tier to a required rank for lock preview when facets exist.
 */
export function tierKeyToStubAccessRank(tk: TierKey, tierOrderIds: string[]): number {
  const n = tierOrderIds.length;
  if (n === 0) return -1;
  if (tk === "public") return -1;
  if (tk === "supporter") return 0;
  if (tk === "member") return Math.min(Math.max(1, Math.floor(n / 2)), n - 1);
  return n - 1;
}

/**
 * Lock state for a single gallery tile in the designer preview.
 *
 * When paidTierOrderIds is populated (facets loaded), uses semantic tier logic:
 *   relay_tier_public-only → never locked
 *   relay_tier_all_patrons → locked only for unauthenticated (rank < 0)
 *   concrete Patreon tiers  → locked if viewerMaxRank < cheapest tier rank
 *
 * When paidTierOrderIds is empty (facets not yet loaded), falls back to the
 * legacy TierKey band comparison.
 *
 * paidTierOrderIds must contain ONLY paid Patreon tier IDs (relay_tier_public and
 * free/public Patreon tiers already filtered out by the caller).
 */
export function previewLockState(
  item: GalleryItem | undefined,
  tierFallback: TierKey,
  viewerMaxRank: number,
  paidTierOrderIds: string[],
  tierTitleById: Record<string, string>,
  viewerTier: TierKey,
  _facets: FacetsData | null          // kept for API compatibility, not used for lock state
): { locked: boolean; unlockLabel: string; badgeTitle: string | null } {
  if (paidTierOrderIds.length > 0) {
    if (item) {
      return {
        locked: isItemLockedSemantic(item, viewerMaxRank, paidTierOrderIds),
        unlockLabel: designerUnlockLabelFromFacets(item, paidTierOrderIds, tierTitleById),
        badgeTitle: designerBadgeTitleFromFacets(item, paidTierOrderIds, tierTitleById),
      };
    }
    // Stub tile (no loaded item row): fall back to TierKey band heuristic
    const stubR = tierKeyToStubAccessRank(tierFallback, paidTierOrderIds);
    const locked = stubR >= 0 && viewerMaxRank < stubR;
    const stubTierId = stubR >= 0 ? paidTierOrderIds[stubR] : null;
    const stubTitle = stubTierId
      ? (tierTitleById[stubTierId] ?? stubTierId).trim() || null
      : null;
    return {
      locked,
      unlockLabel: stubTitle ? `${stubTitle}+` : "Unlock",
      badgeTitle: stubTitle,
    };
  }
  // Legacy fallback: no facets loaded yet
  const locked = tierIndex(viewerTier) < tierIndex(tierFallback);
  const legacy = ["Public", "Supporter", "Member", "Inner Circle"] as const;
  return {
    locked,
    unlockLabel: `${legacy[Math.max(0, tierIndex(tierFallback))]}+`,
    badgeTitle: null,
  };
}
