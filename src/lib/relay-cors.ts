/**
 * @fileoverview CORS origin allowlist for the Relay API (non-extension routes).
 * @description [R-SEC-03 — security-review 2026-06] Replaces reflective "echo any Origin with credentials"
 *   with an explicit allowlist. Credentialed responses (`Allow-Credentials: true`) are only emitted for
 *   allowlisted origins. All other origins receive `Allow-Origin: *` on OPTIONS (no credentials), which
 *   is enough for unauthenticated public GET requests but silently blocks credentialed cross-origin calls.
 *
 *   In development (NODE_ENV !== "production") localhost origins are always trusted so local dev flow is
 *   unchanged. In production, only explicitly configured origins are trusted.
 *
 *   Config (comma-separated, trimmed):
 *     RELAY_ALLOWED_WEB_ORIGINS — e.g. "https://app.relayapp.me,https://www.relayapp.me"
 *
 *   Extension origins are handled separately via RELAY_EXTENSION_ORIGINS / isBrowserExtensionOrigin.
 * @see docs/security-review-2026-06.md
 */

/**
 * @description Parse `RELAY_ALLOWED_WEB_ORIGINS` (comma-separated) into a normalized set.
 */
export function parseAllowedWebOrigins(
  env: NodeJS.ProcessEnv = process.env
): ReadonlySet<string> {
  const raw = env.RELAY_ALLOWED_WEB_ORIGINS?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function isLocalhostOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    const h = u.hostname;
    return (
      h === "localhost" ||
      h === "127.0.0.1" ||
      h === "::1" ||
      h.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

/**
 * @description Evaluate whether an incoming Origin should receive credentialed CORS headers.
 * @param origin The raw `Origin` request header value (already trimmed).
 * @param allowedWebOrigins Parsed set from `RELAY_ALLOWED_WEB_ORIGINS`.
 * @param isProduction Whether `NODE_ENV === "production"`.
 * @returns `true` when the origin may receive `Access-Control-Allow-Credentials: true`.
 */
export function isCredentialedCorsOrigin(
  origin: string,
  allowedWebOrigins: ReadonlySet<string>,
  isProduction: boolean
): boolean {
  if (allowedWebOrigins.has(origin)) return true;
  if (!isProduction && isLocalhostOrigin(origin)) return true;
  return false;
}
