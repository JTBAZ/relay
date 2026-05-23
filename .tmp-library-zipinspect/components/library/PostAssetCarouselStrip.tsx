"use client";

import type { GalleryItem } from "@/lib/relay-api";
import { RELAY_API_BASE } from "@/lib/relay-api";

export function relayPipelineReady(item: GalleryItem): boolean {
  return item.has_export === true && item.pipeline_status !== "processing";
}

export function relayMediaPlaceholderLabel(item: GalleryItem): string {
  if (!item.has_export) return "Not yet exported";
  if (item.pipeline_status === "processing") return "Processing…";
  return "No preview";
}

export type CarouselMainVisual =
  | { src: string; isVideo: boolean; relayProcessing: false }
  | { src: null; isVideo: false; relayProcessing: true }
  | { src: null; isVideo: false; relayProcessing: false };

export function postCarouselMainVisual(item: GalleryItem): CarouselMainVisual {
  if (!relayPipelineReady(item)) {
    return { src: null, isVideo: false, relayProcessing: true };
  }
  if (!item.has_export || !item.content_url_path) {
    return { src: null, isVideo: false, relayProcessing: false };
  }

  // Generate colored SVG for mock preview items
  if (item.content_url_path === 'color-1') {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect fill="#ef4444" width="400" height="400"/></svg>';
    return {
      src: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
      isVideo: false,
      relayProcessing: false,
    };
  }
  if (item.content_url_path === 'color-2') {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect fill="#3b82f6" width="400" height="400"/></svg>';
    return {
      src: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
      isVideo: false,
      relayProcessing: false,
    };
  }
  if (item.content_url_path === 'color-3') {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect fill="#8b5cf6" width="400" height="400"/></svg>';
    return {
      src: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
      isVideo: false,
      relayProcessing: false,
    };
  }

  return {
    src: `${RELAY_API_BASE}${item.content_url_path}`,
    isVideo: Boolean(item.mime_type?.startsWith("video/")),
    relayProcessing: false,
  };
}

interface PostAssetCarouselStripProps {
  items: GalleryItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
  activeBorderClass?: string;
  center?: boolean;
}

export default function PostAssetCarouselStrip({
  items,
  activeIndex,
  onSelect,
  activeBorderClass = "border-white",
  center = false,
}: PostAssetCarouselStripProps) {
  if (items.length <= 1) return null;

  return (
    <div
      className={`flex gap-1.5 overflow-x-auto py-0.5 scrollbar-none ${center ? "justify-center" : ""}`}
    >
      {items.map((item, i) => {
        const isActive = i === activeIndex;
        const visual = postCarouselMainVisual(item);

        return (
          <button
            key={item.post_id + i}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(i);
            }}
            aria-label={`View asset ${i + 1}`}
            className={`relative h-9 w-9 shrink-0 overflow-hidden rounded border-2 transition-all ${
              isActive
                ? activeBorderClass
                : "border-white/20 hover:border-white/50"
            }`}
          >
            {visual.src && !visual.isVideo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={visual.src}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : visual.src && visual.isVideo ? (
              <video
                src={visual.src}
                muted
                playsInline
                preload="metadata"
                className="h-full w-full object-cover"
                aria-hidden
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-white/10">
                <span className="text-[8px] text-white/50">
                  {item.mime_type?.split("/")[0] ?? "—"}
                </span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
