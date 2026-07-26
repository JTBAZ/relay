/**
 * Pure helpers for the /studio/promos Add Post picker (VS1-T03).
 * Selection is by post_id; Linked Set members stay separate posts.
 */

import type {
  CreatorPromoSlotRow,
  GalleryItem,
  PutCreatorPromoSlotRow
} from "@/lib/relay-api";

export const MAX_PROMO_SLOTS = 5;

export type PromoPostOption = {
  post_id: string;
  title: string;
  thumb_url_path?: string;
  creative_work_id?: string;
  member_label?: string | null;
  variant_role?: string | null;
  creative_work_sort_order?: number;
  /** True when this option came from a non-default Linked Set. */
  linked_set_member: boolean;
};

export type SelectedPromoPost = {
  slot_rank: 1 | 2 | 3 | 4 | 5;
  post_id: string;
  title: string;
  thumb_url_path?: string;
  member_label?: string | null;
  /** Legacy media slot that could not resolve to a post. */
  unresolved_legacy?: boolean;
  legacy_media_id?: string;
};

/** Active Posts eligibility for the promo picker. */
export function isActivePromoPickerItem(item: GalleryItem): boolean {
  if (item.shadow_cover) return false;
  if (item.visibility === "hidden" || item.visibility === "review") return false;
  const postId = item.post_id?.trim();
  return Boolean(postId);
}

function isLinkedSetMember(item: GalleryItem): boolean {
  if (!item.creative_work_id) return false;
  if (item.is_default_bundle !== false) return false;
  return (item.creative_work_member_count ?? 0) >= 2;
}

/**
 * Collapse gallery rows to one option per post_id (multi-asset → one tile).
 * Does NOT collapse Linked Sets — each member post remains its own option.
 */
export function galleryItemsToPostOptions(items: readonly GalleryItem[]): PromoPostOption[] {
  const byPost = new Map<string, PromoPostOption>();
  for (const item of items) {
    if (!isActivePromoPickerItem(item)) continue;
    const postId = item.post_id.trim();
    if (byPost.has(postId)) continue;
    byPost.set(postId, {
      post_id: postId,
      title: item.title?.trim() || "Untitled",
      thumb_url_path: item.thumb_url_path || undefined,
      creative_work_id: item.creative_work_id,
      member_label: item.member_label ?? null,
      variant_role: item.variant_role ?? null,
      creative_work_sort_order: item.creative_work_sort_order,
      linked_set_member: isLinkedSetMember(item)
    });
  }
  return Array.from(byPost.values());
}

export function nextAvailableRank(selected: Map<number, SelectedPromoPost>): number | null {
  for (let rank = 1; rank <= MAX_PROMO_SLOTS; rank += 1) {
    if (!selected.has(rank)) return rank;
  }
  return null;
}

export function rankForPostId(
  selected: Map<number, SelectedPromoPost>,
  postId: string
): number | null {
  for (const [rank, row] of Array.from(selected.entries())) {
    if (row.post_id === postId) return rank;
  }
  return null;
}

/** Toggle a post into/out of selection. Rejects a sixth selection without changing the map. */
export function togglePostSelection(
  selected: Map<number, SelectedPromoPost>,
  option: PromoPostOption
): Map<number, SelectedPromoPost> {
  const existing = rankForPostId(selected, option.post_id);
  if (existing != null) {
    const next = new Map(selected);
    next.delete(existing);
    return next;
  }
  const rank = nextAvailableRank(selected);
  if (rank == null) return selected;
  const next = new Map(selected);
  next.set(rank, {
    slot_rank: rank as 1 | 2 | 3 | 4 | 5,
    post_id: option.post_id,
    title: option.title,
    thumb_url_path: option.thumb_url_path,
    member_label: option.member_label
  });
  return next;
}

/** Prefill selection from current promo slots (post targets + resolved legacy media). */
export function selectionFromSlots(
  slots: readonly CreatorPromoSlotRow[]
): Map<number, SelectedPromoPost> {
  const selected = new Map<number, SelectedPromoPost>();
  const sorted = [...slots].sort((a, b) => a.slot_rank - b.slot_rank);
  let nextRank = 1;
  for (const slot of sorted) {
    if (nextRank > MAX_PROMO_SLOTS) break;
    if (slot.target_kind === "post") {
      selected.set(nextRank, {
        slot_rank: nextRank as 1 | 2 | 3 | 4 | 5,
        post_id: slot.target_id,
        title: slot.title || slot.label || slot.target_id,
        thumb_url_path: slot.thumb_url_path
      });
      nextRank += 1;
      continue;
    }
    const resolvedPost = slot.post_id?.trim();
    if (resolvedPost) {
      // Skip duplicate post if already selected from another media row.
      if (rankForPostId(selected, resolvedPost) != null) continue;
      selected.set(nextRank, {
        slot_rank: nextRank as 1 | 2 | 3 | 4 | 5,
        post_id: resolvedPost,
        title: slot.title || slot.label || resolvedPost,
        thumb_url_path: slot.thumb_url_path,
        legacy_media_id: slot.target_id
      });
      nextRank += 1;
      continue;
    }
    selected.set(nextRank, {
      slot_rank: nextRank as 1 | 2 | 3 | 4 | 5,
      post_id: `unresolved:${slot.target_id}`,
      title: slot.title || slot.label || slot.target_id,
      thumb_url_path: slot.thumb_url_path,
      unresolved_legacy: true,
      legacy_media_id: slot.target_id
    });
    nextRank += 1;
  }
  return selected;
}

/** Compact ranks 1…N as post-target PUT rows. Drops unresolved legacy entries. */
export function selectionToPutRows(
  selected: Map<number, SelectedPromoPost>
): PutCreatorPromoSlotRow[] {
  return Array.from(selected.values())
    .filter((row) => !row.unresolved_legacy)
    .sort((a, b) => a.slot_rank - b.slot_rank)
    .map((row, idx) => ({
      slot_rank: (idx + 1) as 1 | 2 | 3 | 4 | 5,
      target_kind: "post" as const,
      target_id: row.post_id
    }));
}

/** Compact after remove/reorder while preserving relative order. */
export function compactSelection(
  selected: Map<number, SelectedPromoPost>
): Map<number, SelectedPromoPost> {
  const ordered = Array.from(selected.values()).sort((a, b) => a.slot_rank - b.slot_rank);
  const next = new Map<number, SelectedPromoPost>();
  ordered.forEach((row, idx) => {
    const rank = (idx + 1) as 1 | 2 | 3 | 4 | 5;
    next.set(rank, { ...row, slot_rank: rank });
  });
  return next;
}
