"use client";

import { useState } from "react";

type Props = {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
  className?: string;
};

/**
 * Visitor media image that fails closed on 401/403 / load errors (EH-034).
 * Callers must only pass a private `/api/media/...` src when unlocked.
 */
export function VisitorMedia({
  src,
  alt = "",
  width = 1200,
  height = 900,
  loading = "lazy",
  fetchPriority,
  className
}: Props) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`patron-media-denied ${className ?? ""}`.trim()}
        role="status"
        aria-live="polite"
      >
        <p>
          Media unavailable. Access may have expired or been revoked — refresh
          your session from Account.
        </p>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      decoding="async"
      fetchPriority={fetchPriority}
      onError={() => setFailed(true)}
    />
  );
}
