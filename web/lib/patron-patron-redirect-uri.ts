const PATRON_CALLBACK_PATH = "/patreon/patron/callback";

/**
 * Redirect URI for Patreon **patron** OAuth (authorize URL + token exchange).
 * Must exactly match a redirect URI on your Patreon OAuth client.
 *
 * - If `NEXT_PUBLIC_PATREON_PATRON_REDIRECT_URI` is set, it wins (use when port/host is non-default).
 * - Otherwise, uses the current browser origin + callback path, but maps **`127.0.0.1` → `localhost`**
 *   so dev setups that only registered `http://localhost:3000/patreon/patron/callback` in Patreon
 *   still work when Next is opened as `http://127.0.0.1:3000`.
 *
 * After a successful login, Patreon redirects to this URI (often `localhost`); use the same host
 * for the rest of the app so `localStorage` session keys match.
 */
export function patronPatronOAuthRedirectUri(): string {
  const fromEnv = process.env.NEXT_PUBLIC_PATREON_PATRON_REDIRECT_URI?.trim();
  if (fromEnv) return fromEnv;
  if (typeof window === "undefined") return "";
  try {
    const u = new URL(window.location.origin);
    if (u.hostname === "127.0.0.1") {
      u.hostname = "localhost";
    }
    return `${u.origin}${PATRON_CALLBACK_PATH}`;
  } catch {
    return `${window.location.origin}${PATRON_CALLBACK_PATH}`;
  }
}
