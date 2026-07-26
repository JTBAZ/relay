/**
 * Patron profile asset URL helpers — stored Relay paths vs same-origin browser fetch paths.
 */
export function isPatronProfileStaticAsset(url: string): boolean {
  const trimmed = url.trim();
  return trimmed.startsWith("/patron-profile/");
}

const RELAY_ASSET_PATH_RE =
  /^\/api\/v1\/public\/patron-profile-assets\/([^/]+)\/(avatar|banner)\/([^/]+)\/content$/;

const BROWSER_ASSET_PATH_RE =
  /^\/api\/patron-profile-assets\/([^/]+)\/(avatar|banner)\/([^/]+)\/content$/;

/**
 * Relay API path for a patron profile R2 asset (`/api/v1/public/patron-profile-assets/...`).
 * Accepts a stored path or a full URL with that pathname.
 */
export function patronProfileAssetRequestPath(
  url: string | null | undefined
): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/api/v1/public/patron-profile-assets/")) {
    return trimmed;
  }
  if (trimmed.startsWith("/api/patron-profile-assets/")) {
    const browserMatch = BROWSER_ASSET_PATH_RE.exec(trimmed);
    if (browserMatch) {
      return `/api/v1/public/patron-profile-assets/${browserMatch[1]}/${browserMatch[2]}/${browserMatch[3]}/content`;
    }
  }
  try {
    const pathname = trimmed.startsWith("http")
      ? new URL(trimmed).pathname
      : trimmed;
    if (pathname.startsWith("/api/v1/public/patron-profile-assets/")) {
      return pathname;
    }
    const browserMatch = BROWSER_ASSET_PATH_RE.exec(pathname);
    if (browserMatch) {
      return `/api/v1/public/patron-profile-assets/${browserMatch[1]}/${browserMatch[2]}/${browserMatch[3]}/content`;
    }
  } catch {
    return null;
  }
  return null;
}

/** Same-origin Next proxy path for authenticated browser fetches. */
export function patronProfileAssetBrowserFetchPath(
  url: string | null | undefined
): string | null {
  const relayPath = patronProfileAssetRequestPath(url);
  if (!relayPath) return null;
  const match = RELAY_ASSET_PATH_RE.exec(relayPath);
  if (!match) return null;
  return `/api/patron-profile-assets/${match[1]}/${match[2]}/${match[3]}/content`;
}

export function isPatronProfileHostedAsset(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  return isPatronProfileStaticAsset(url) || patronProfileAssetRequestPath(url) !== null;
}
