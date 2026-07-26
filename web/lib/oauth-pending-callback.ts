/**
 * Before sending the user to Patreon / SubscribeStar authorize, we store which callback
 * route should handle the `code` + `state` return. If the OAuth app is mis-registered
 * with redirect_uri = site root (`/`), the user lands on `/` (Library) with query params
 * instead of the dedicated callback page — `home-page-client` forwards using this marker.
 */

const STORAGE_KEY = "relay_oauth_pending_callback";

export type PendingOAuthCallback = "subscribestar-creator" | "patreon-creator";

export function setPendingOAuthCallbackTarget(target: PendingOAuthCallback): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, target);
  } catch {
    /* quota / private mode */
  }
}

export function clearPendingOAuthCallbackTarget(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Non-destructive read — use before confirming we will forward (avoids Strict Mode consuming early). */
export function readPendingOAuthCallbackTarget(): PendingOAuthCallback | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw === "subscribestar-creator" || raw === "patreon-creator") return raw;
    return null;
  } catch {
    return null;
  }
}

/**
 * Read and remove the marker (e.g. when `/` forwards to the real OAuth callback route).
 */
export function consumePendingOAuthCallbackTarget(): PendingOAuthCallback | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    if (raw === "subscribestar-creator" || raw === "patreon-creator") return raw;
    return null;
  } catch {
    return null;
  }
}
