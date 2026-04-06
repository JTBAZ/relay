import type { GalleryItem } from "@/lib/relay-api";
import { galleryItemExportVisibleToVisitor } from "@/lib/relay-api";

/**
 * True when the visitor cannot see export bytes for a real media row — show tier-gate / censored tile
 * (not the generic mime-type placeholder). Skips synthetic text-only rows.
 */
export function visitorMediaTierGateLocked(item: GalleryItem): boolean {
  if (galleryItemExportVisibleToVisitor(item)) return false;
  if (item.media_id.startsWith("post_only_")) return false;
  return true;
}
