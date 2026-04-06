import { galleryItemExportVisibleToVisitor, type GalleryItem } from "@/lib/relay-api";

export type VisitorLayoutMediaKind = "image" | "video" | "audio" | "text";

function mimeMatchesKinds(
  mime: string | undefined | null,
  kinds: ReadonlySet<VisitorLayoutMediaKind>
): boolean {
  if (kinds.size === 0) return true;
  const mt = (mime ?? "").toLowerCase();
  if (!mt) return false;
  if (kinds.has("image") && mt.startsWith("image/")) return true;
  if (kinds.has("video") && mt.startsWith("video/")) return true;
  if (kinds.has("audio") && mt.startsWith("audio/")) return true;
  if (
    kinds.has("text") &&
    (mt.startsWith("text/") ||
      mt === "application/pdf" ||
      mt.includes("markdown") ||
      mt === "application/json")
  ) {
    return true;
  }
  return false;
}

export type VisitorLayoutFilterOpts = {
  search: string;
  mediaKinds: ReadonlySet<VisitorLayoutMediaKind>;
  /** When true, only items the visitor can view (export visible). */
  myTierOnly: boolean;
  /** When false, hide mature-tagged rows (`visibility === "review"`). */
  matureOn: boolean;
};

/**
 * Client-side filters for curated (Site Designer) sections — API list for sections
 * does not accept the same query params as the full library.
 */
export function filterGalleryItemsForVisitorLayout(
  items: GalleryItem[],
  opts: VisitorLayoutFilterOpts
): GalleryItem[] {
  const q = opts.search.trim().toLowerCase();
  return items.filter((item) => {
    if (opts.myTierOnly && !galleryItemExportVisibleToVisitor(item)) return false;
    if (!opts.matureOn && item.visibility === "review") return false;
    if (!mimeMatchesKinds(item.mime_type, opts.mediaKinds)) return false;
    if (q) {
      const desc = (item.description ?? "").toLowerCase();
      const tagHit = item.tag_ids.some((t) => t.toLowerCase().includes(q));
      if (!item.title.toLowerCase().includes(q) && !desc.includes(q) && !tagHit) return false;
    }
    return true;
  });
}
