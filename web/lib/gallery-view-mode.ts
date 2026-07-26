/** Phase 7 — Active Posts density only (list mode removed). */
export type GalleryViewMode = "dense" | "normal";

export const GALLERY_VIEW_MODE_KEY = "relay.galleryViewMode";

/** Read persisted mode; legacy `list` maps to `normal`. */
export function readGalleryViewMode(stored: string | null | undefined): GalleryViewMode {
  if (stored === "list" || stored === "normal") return "normal";
  return "dense";
}

/** True when localStorage still holds the removed `list` value and should be rewritten. */
export function galleryViewModeNeedsRewrite(stored: string | null | undefined): boolean {
  return stored === "list";
}
