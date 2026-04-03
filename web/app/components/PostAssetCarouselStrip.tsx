"use client";

import { Lock } from "lucide-react";
import { galleryItemKey } from "@/lib/gallery-group";
import { RELAY_API_BASE, type GalleryItem } from "@/lib/relay-api";

function thumbSrc(m: GalleryItem): string | null {
  if (!m.has_export || !m.content_url_path) return null;
  const mt = m.mime_type ?? "";
  if (mt.startsWith("image/") || mt.startsWith("video/")) {
    return `${RELAY_API_BASE}${m.content_url_path}`;
  }
  return null;
}

function isVideo(m: GalleryItem): boolean {
  return Boolean(m.mime_type?.startsWith("video/"));
}

type Props = {
  items: GalleryItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
  /**
   * Selected thumb border (Tailwind). Always paired with `border-2` so inactive/active
   * use the same box model — no row jump when the selection changes.
   */
  activeBorderClass: string;
  /** Thumbnail size */
  size?: "sm" | "md";
  /** Center the thumb row when it’s narrower than the container (visitor + library previews). */
  center?: boolean;
};

/**
 * Horizontal thumbnail strip for multi-asset post tiles (Library + visitor grid).
 */
export default function PostAssetCarouselStrip({
  items,
  activeIndex,
  onSelect,
  activeBorderClass,
  size = "sm",
  center = false
}: Props) {
  const dim = size === "md" ? "h-10 w-10 md:h-11 md:w-11" : "h-9 w-9";

  const scrollbarStyle = { scrollbarColor: "oklch(0.35 0.01 160) transparent" } as const;
  const rowClass =
    "flex min-h-0 max-w-full gap-1.5 overflow-x-auto overflow-y-hidden pb-0.5 [-ms-overflow-style:none] [scrollbar-width:thin]";

  const buttons = items.map((m, i) => {
    const src = thumbSrc(m);
    const v = isVideo(m);
    const active = i === activeIndex;
    return (
      <button
        key={galleryItemKey(m)}
        type="button"
        role="tab"
        aria-selected={active}
        aria-label={`Show asset ${i + 1} of ${items.length}`}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(i);
        }}
        onMouseDown={(e) => e.preventDefault()}
        className={`relative box-border shrink-0 overflow-hidden rounded-md bg-black/55 transition ${dim} border-2 ${
          active
            ? activeBorderClass
            : "border-white/18 opacity-90 hover:border-white/32 hover:opacity-100"
        }`}
      >
        {src && v ? (
          <video
            className="pointer-events-none h-full w-full object-cover object-center"
            src={src}
            muted
            playsInline
            preload="metadata"
            aria-hidden
          />
        ) : src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-full w-full object-cover object-center" />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            <Lock className="h-3.5 w-3.5 text-white/50" strokeWidth={1.5} aria-hidden />
          </span>
        )}
      </button>
    );
  });

  if (center) {
    return (
      <div className="flex w-full min-h-0 justify-center">
        <div
          className={`${rowClass} w-max`}
          style={scrollbarStyle}
          role="tablist"
          aria-label="Assets in this post"
        >
          {buttons}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${rowClass} w-full`}
      style={scrollbarStyle}
      role="tablist"
      aria-label="Assets in this post"
    >
      {buttons}
    </div>
  );
}

export function postCarouselMainVisual(item: GalleryItem): {
  src: string | null;
  isVideo: boolean;
  locked: boolean;
} {
  const locked = !item.has_export || !item.content_url_path;
  const src = thumbSrc(item);
  return { src, isVideo: isVideo(item), locked };
}
