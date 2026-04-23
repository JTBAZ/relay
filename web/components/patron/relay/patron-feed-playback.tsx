"use client";

import type { MouseEvent } from "react";

/**
 * Patron feed `<video>` — `crossOrigin="anonymous"` matches export `<img>` for CORS;
 * if cookies are required cross-origin and the browser omits them for media elements,
 * use a same-origin proxy or signed URLs (see `web/lib/relay-api.ts` / PE-B notes).
 */
export function PatronFeedVideo(props: {
  src: string;
  poster?: string | null;
  className?: string;
  controls?: boolean;
  muted?: boolean;
  loop?: boolean;
  preload?: "none" | "metadata" | "auto";
  onClick?: (e: MouseEvent<HTMLVideoElement>) => void;
}) {
  const {
    src,
    poster,
    className,
    controls = true,
    muted = false,
    loop,
    preload = "metadata",
    onClick
  } = props;
  return (
    <video
      src={src}
      poster={poster ?? undefined}
      className={className}
      controls={controls}
      playsInline
      muted={muted}
      loop={loop}
      preload={preload}
      crossOrigin="anonymous"
      onClick={onClick}
    />
  );
}
