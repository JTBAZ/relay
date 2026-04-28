/**
 * Canonical origin for the Next.js web app: `emailRedirectTo`, Patreon `redirect_uri`, public links.
 *
 * - **Production:** set `NEXT_PUBLIC_SITE_URL=https://relayapp.me` in the host env.
 * - **Local dev:** set `NEXT_PUBLIC_SITE_URL=http://localhost:3000` and
 *   `NEXT_PUBLIC_RELAY_API_URL=http://localhost:8787` so the cookie hostname matches.
 *   Both must use the same loopback name — `localhost` ≠ `127.0.0.1` for cookies.
 *
 * `NEXT_PUBLIC_SITE_URL` is used verbatim (no host rewriting). When unset, falls back to
 * `window.location.origin` as-is — whatever host the browser is already on.
 */
export function getWebAppOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (fromEnv) {
    return fromEnv;
  }
  if (typeof window === "undefined") {
    return "";
  }
  return window.location.origin;
}
