import { galleryItemImageGridSrc, RELAY_API_BASE, type GalleryItem, type RelayLibraryStagingItem } from "@/lib/relay-api";

export type PreviewMediaPickerOption = {
  mediaId: string;
  thumbUrl: string | null;
  label: string;
  source: "post" | "staging" | "library";
};

function isImageMime(mime?: string | null): boolean {
  return Boolean(mime?.trim().toLowerCase().startsWith("image/"));
}

function stagingThumbUrl(item: RelayLibraryStagingItem): string | null {
  const pathForThumb =
    item.mime_type?.toLowerCase() === "image/gif" && item.content_url_path?.trim()
      ? item.content_url_path
      : item.mime_type?.startsWith("image/") && item.thumb_url_path?.trim()
        ? item.thumb_url_path
        : item.content_url_path;
  const p = pathForThumb?.trim();
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return p;
  return `${RELAY_API_BASE}${p.startsWith("/") ? p : `/${p}`}`;
}

export function mergePreviewMediaPickerOptions(args: {
  postMedia?: GalleryItem[];
  stagingItems: RelayLibraryStagingItem[];
  libraryItems: GalleryItem[];
}): PreviewMediaPickerOption[] {
  const out: PreviewMediaPickerOption[] = [];
  const seen = new Set<string>();

  const push = (option: PreviewMediaPickerOption) => {
    if (!option.mediaId.trim() || seen.has(option.mediaId)) return;
    seen.add(option.mediaId);
    out.push(option);
  };

  for (const item of args.postMedia ?? []) {
    if (!isImageMime(item.mime_type)) continue;
    push({
      mediaId: item.media_id,
      thumbUrl: galleryItemImageGridSrc(item),
      label: item.title?.trim() || "This post",
      source: "post"
    });
  }

  for (const item of args.stagingItems) {
    if (!isImageMime(item.mime_type)) continue;
    push({
      mediaId: item.media_id,
      thumbUrl: stagingThumbUrl(item),
      label: item.ingest_origin === "DISCORD" ? "Discord" : "Import bay",
      source: "staging"
    });
  }

  for (const item of args.libraryItems) {
    if (!isImageMime(item.mime_type)) continue;
    push({
      mediaId: item.media_id,
      thumbUrl: galleryItemImageGridSrc(item),
      label: item.title?.trim() || "Library",
      source: "library"
    });
  }

  return out;
}
