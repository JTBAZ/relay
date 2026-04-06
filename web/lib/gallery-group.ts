import type { GalleryItem } from "@/lib/relay-api";

export type PostGalleryGroup = {
  post_id: string;
  items: GalleryItem[];
};

export function galleryItemKey(i: GalleryItem): string {
  return `${i.post_id}::${i.media_id}`;
}

/**
 * Groups consecutive display order by post_id: first time a post appears defines group order.
 */
export function groupGalleryItemsByPost(items: GalleryItem[]): PostGalleryGroup[] {
  const order: string[] = [];
  const map = new Map<string, GalleryItem[]>();
  for (const it of items) {
    if (!map.has(it.post_id)) {
      order.push(it.post_id);
      map.set(it.post_id, []);
    }
    map.get(it.post_id)!.push(it);
  }
  return order.map((post_id) => ({ post_id, items: map.get(post_id)! }));
}

/**
 * Visitor / patron catalog: prefer non-`shadow_cover` rows per post; if all are shadow, keep one row
 * so the post still appears.
 */
export function dedupeShadowCoverRows(items: GalleryItem[]): GalleryItem[] {
  const byPost = new Map<string, GalleryItem[]>();
  const order: string[] = [];
  for (const it of items) {
    if (!byPost.has(it.post_id)) {
      order.push(it.post_id);
      byPost.set(it.post_id, []);
    }
    byPost.get(it.post_id)!.push(it);
  }
  const out: GalleryItem[] = [];
  for (const pid of order) {
    const group = byPost.get(pid)!;
    const nonShadow = group.filter((i) => !i.shadow_cover);
    if (nonShadow.length > 0) {
      out.push(...nonShadow);
    } else if (group[0]) {
      out.push(group[0]);
    }
  }
  return out;
}
