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
