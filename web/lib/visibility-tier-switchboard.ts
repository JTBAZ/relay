/**
 * Tier access reference for the Library visibility switchboard.
 * Layer A only — never mutates tiers; pairs with Hidden / Adult (Layer C) controls.
 */

import type { GalleryItem, TierFacet } from "@/lib/relay-api";
import {
  buildMinimumTierAccessState,
  buildTierLadderRows,
  type LadderComposeTier
} from "@/lib/minimum-tier-ladder";

export type TierAccessBucket = "access" | "locked" | "mixed";

export type TierAccessRow = {
  tier_id: string;
  label: string;
  bucket: TierAccessBucket;
};

export type VisibilityTierSwitchboard = {
  /** Open-web / public gate across the selection. */
  publicAccess: TierAccessBucket;
  tiers: TierAccessRow[];
};

function catalogAsLadder(catalog: TierFacet[]): LadderComposeTier[] {
  return catalog.map((t) => ({
    tier_id: t.tier_id,
    relay_tier_id: t.relay_tier_id?.trim() || t.tier_id,
    title: t.title,
    amount_cents: typeof t.amount_cents === "number" ? t.amount_cents : null
  }));
}

/** One representative gallery row per post_id (first wins). */
export function uniquePostsFromSelection(items: GalleryItem[]): GalleryItem[] {
  const seen = new Set<string>();
  const out: GalleryItem[] = [];
  for (const item of items) {
    const id = item.post_id?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

function postGrantsAccess(
  item: GalleryItem,
  catalog: LadderComposeTier[],
  tierId: string | "public"
): boolean {
  const gate = buildMinimumTierAccessState(item.tier_ids ?? [], catalog);
  if (tierId === "public") return gate.is_public;
  const rows = buildTierLadderRows(catalog, gate);
  const row = rows.find((r) => r.tier_id === tierId);
  if (!row) return false;
  return row.state === "public" || row.state === "minimum" || row.state === "implied";
}

function mergeBuckets(flags: boolean[]): TierAccessBucket {
  if (flags.length === 0) return "locked";
  const allOn = flags.every(Boolean);
  const allOff = flags.every((f) => !f);
  if (allOn) return "access";
  if (allOff) return "locked";
  return "mixed";
}

/**
 * Build Can access / No access rows for the visibility panel.
 * Catalog drives the tier list; selection posts decide access per tier.
 */
export function buildVisibilityTierSwitchboard(
  selectedItems: GalleryItem[],
  catalog: TierFacet[]
): VisibilityTierSwitchboard {
  const posts = uniquePostsFromSelection(selectedItems);
  const ladder = catalogAsLadder(catalog);

  if (posts.length === 0) {
    return { publicAccess: "locked", tiers: [] };
  }

  const publicAccess = mergeBuckets(
    posts.map((p) => postGrantsAccess(p, ladder, "public"))
  );

  const tiers: TierAccessRow[] = ladder.map((row) => ({
    tier_id: row.tier_id,
    label: row.title.trim() || row.relay_tier_id,
    bucket: mergeBuckets(posts.map((p) => postGrantsAccess(p, ladder, row.tier_id)))
  }));

  return { publicAccess, tiers };
}
