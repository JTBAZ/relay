import type { GalleryArrangement, GalleryItem } from "@/lib/relay-api";

/**
 * Orders items for designer + patron layout sections.
 * Tier mode uses `tierOrderIds` (lowest tier / broadest access first), then `published_at` desc within the same tier band.
 */
export function sortGalleryItemsForArrangement(
  items: GalleryItem[],
  mode: GalleryArrangement,
  tierOrderIds: string[]
): GalleryItem[] {
  const copy = [...items];
  if (mode !== "tier" || tierOrderIds.length === 0) {
    copy.sort((a, b) => b.published_at.localeCompare(a.published_at));
    return copy;
  }

  const rank = (item: GalleryItem) => {
    let max = -1;
    for (const tid of item.tier_ids) {
      const idx = tierOrderIds.indexOf(tid);
      if (idx >= 0) max = Math.max(max, idx);
    }
    return max < 0 ? 0 : max;
  };

  copy.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return b.published_at.localeCompare(a.published_at);
  });
  return copy;
}
