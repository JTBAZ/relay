"use client";

import type { GalleryItem } from "@/lib/relay-api";
import { RELAY_API_BASE } from "@/lib/relay-api";
import { relayPipelineReady, relayMediaPlaceholderLabel } from "../PostAssetCarouselStrip";
import { FileImage, FileVideo, FileAudio, FileText } from "lucide-react";

interface InspectAssetPreviewProps {
  item: GalleryItem;
}

export function InspectAssetPreview({ item }: InspectAssetPreviewProps) {
  const ready = relayPipelineReady(item);
  const src = ready && item.content_url_path
    ? `${RELAY_API_BASE}${item.content_url_path}`
    : null;
  const isImage = item.mime_type?.startsWith("image/");
  const isVideo = item.mime_type?.startsWith("video/");
  const isAudio = item.mime_type?.startsWith("audio/");

  if (!ready || !src) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center">
        <FileImage className="h-8 w-8 text-[var(--lib-fg-muted)]" aria-hidden />
        <p className="text-xs font-medium text-[var(--lib-fg-muted)]">
          {relayMediaPlaceholderLabel(item)}
        </p>
      </div>
    );
  }

  if (isImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={item.title}
        className="h-full w-full object-contain"
      />
    );
  }

  if (isVideo) {
    return (
      <video
        src={src}
        controls
        muted
        playsInline
        preload="metadata"
        className="h-full w-full object-contain"
        aria-label={item.title}
      />
    );
  }

  if (isAudio) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-4">
        <FileAudio className="h-10 w-10 text-[var(--lib-fg-muted)]" aria-hidden />
        <audio src={src} controls className="w-full" aria-label={item.title} />
      </div>
    );
  }

  // Text / generic fallback
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center">
      <FileText className="h-8 w-8 text-[var(--lib-fg-muted)]" aria-hidden />
      <p className="text-xs font-medium text-[var(--lib-fg)]">{item.title}</p>
      <p className="text-[11px] text-[var(--lib-fg-muted)]">
        {item.mime_type ?? "Unknown type"}
      </p>
    </div>
  );
}
