"use client";

import { RELAY_API_BASE, type GalleryItem } from "@/lib/relay-api";

type Props = {
  item: GalleryItem;
  /** When true, native video `loop` (Library fullscreen preference). */
  videoLoop?: boolean;
};

function mediaSrc(item: GalleryItem): string {
  return `${RELAY_API_BASE}${item.content_url_path}`;
}

export function InspectAssetPreview({ item, videoLoop = false }: Props) {
  const src = mediaSrc(item);

  if (item.has_export && item.mime_type?.startsWith("image/")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={item.title}
        className="max-h-full max-w-full object-contain"
      />
    );
  }

  if (item.has_export && item.mime_type?.startsWith("video/")) {
    return (
      <video
        src={src}
        controls
        playsInline
        loop={videoLoop}
        className="max-h-full max-w-full object-contain"
      />
    );
  }

  if (item.has_export && item.mime_type?.startsWith("audio/")) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-6">
        <svg
          className="h-14 w-14 text-[var(--lib-fg-muted)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
        <audio src={src} controls className="w-full max-w-md" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2 p-8 text-[var(--lib-fg-muted)]">
      <svg className="h-12 w-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <p className="text-sm">{item.mime_type ?? "Unknown type"}</p>
      <p className="text-[var(--lib-fg)]">{item.title}</p>
    </div>
  );
}
