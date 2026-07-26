/**
 * Same-origin checks for Patreon OAuth start (EH-040 CSRF defense).
 */

/**
 * Accepts matching Origin, or Referer whose origin matches the request URL.
 * Rejects when both are absent (browser form POSTs send Origin).
 */
export function isSameOriginOAuthStart(request: Request): boolean {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).origin === url.origin;
    } catch {
      return false;
    }
  }
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin === url.origin;
    } catch {
      return false;
    }
  }
  return false;
}
