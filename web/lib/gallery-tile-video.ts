import { useEffect, useRef } from "react";
import { galleryItemKey } from "@/lib/gallery-group";
import type { GalleryItem } from "@/lib/relay-api";

/**
 * Registers video elements by item key and plays only the active index while `isHovered`.
 * Pauses and resets others (grid tiles: hover-to-preview, no autoplay loop).
 */
export function useGalleryMultiVideoHoverSync(
  items: GalleryItem[],
  activeIndex: number,
  isHovered: boolean
): (item: GalleryItem, el: HTMLVideoElement | null) => void {
  const mapRef = useRef<Map<string, HTMLVideoElement>>(new Map());

  useEffect(() => {
    const map = mapRef.current;
    items.forEach((item, idx) => {
      if (!item.mime_type?.startsWith("video/")) return;
      const el = map.get(galleryItemKey(item));
      if (!el) return;
      if (idx === activeIndex && isHovered) void el.play().catch(() => {});
      else {
        el.pause();
        el.currentTime = 0;
      }
    });
  }, [items, activeIndex, isHovered]);

  return (item: GalleryItem, el: HTMLVideoElement | null) => {
    const k = galleryItemKey(item);
    if (el) mapRef.current.set(k, el);
    else mapRef.current.delete(k);
  };
}
