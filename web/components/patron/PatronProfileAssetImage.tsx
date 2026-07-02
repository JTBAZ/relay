"use client";

import { useEffect, useState } from "react";
import { fetchPatronProfileAssetBlob } from "@/lib/fetch-patron-profile-asset-blob";
import {
  isPatronProfileStaticAsset,
  patronProfileAssetBrowserFetchPath,
} from "@/lib/patron-profile-asset-display";

type PatronProfileAssetImageProps = Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  "src"
> & {
  storedUrl: string | null | undefined;
  /** Optional local blob URL to show while a hosted asset fetch is in flight. */
  pendingBlobUrl?: string | null;
  fallback?: React.ReactNode;
};

/**
 * Renders patron avatar/banner images. Relay-hosted R2 assets load through a same-origin
 * Next proxy so pilot-ux Bearer tokens reach the API (raw cross-origin <img> cannot).
 */
export function PatronProfileAssetImage({
  storedUrl,
  pendingBlobUrl = null,
  fallback = null,
  alt = "",
  ...imgProps
}: PatronProfileAssetImageProps): React.ReactElement | null {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = storedUrl?.trim();
    if (!trimmed) {
      setSrc(null);
      return;
    }

    if (isPatronProfileStaticAsset(trimmed)) {
      setSrc(trimmed);
      return;
    }

    if (!patronProfileAssetBrowserFetchPath(trimmed)) {
      setSrc(trimmed);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    void fetchPatronProfileAssetBlob(trimmed)
      .then((blob) => {
        if (cancelled) return;
        if (!blob) {
          setSrc(null);
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) {
          setSrc(null);
        }
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [storedUrl]);

  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- blob or static public asset
    return <img src={src} alt={alt} {...imgProps} />;
  }

  if (pendingBlobUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- local upload preview
    return <img src={pendingBlobUrl} alt={alt} {...imgProps} />;
  }

  return <>{fallback}</>;
}
