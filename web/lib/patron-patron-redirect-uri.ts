import { getWebAppOrigin } from "./site-origin";

const PATRON_CALLBACK_PATH = "/patreon/patron/callback";

/**
 * Redirect URI for Patreon **patron** OAuth (authorize URL + token exchange).
 * Must exactly match a redirect URI on your Patreon OAuth client.
 *
 * - If `NEXT_PUBLIC_PATREON_PATRON_REDIRECT_URI` is set, it wins.
 * - Otherwise, uses {@link getWebAppOrigin} (production: `NEXT_PUBLIC_SITE_URL`, local: `127.0.0.1`
 *   when the tab is on localhost) + this path. Register the same URI in the Patreon developer app
 *   (e.g. `http://127.0.0.1:3000/patreon/patron/callback` for local dev).
 */
export function patronPatronOAuthRedirectUri(): string {
  const fromEnv = process.env.NEXT_PUBLIC_PATREON_PATRON_REDIRECT_URI?.trim();
  if (fromEnv) return fromEnv;
  if (typeof window === "undefined") return "";
  const origin = getWebAppOrigin();
  if (origin) {
    return `${origin}${PATRON_CALLBACK_PATH}`;
  }
  return `${window.location.origin}${PATRON_CALLBACK_PATH}`;
}
