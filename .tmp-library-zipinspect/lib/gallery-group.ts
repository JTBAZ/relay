import type { GalleryItem } from './relay-api';

export type PostGalleryGroup = {
  post_id: string;
  items: GalleryItem[];
};

export function galleryItemKey(item: GalleryItem): string {
  return item.post_id;
}
