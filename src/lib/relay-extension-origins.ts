/** API routes that accept browser-extension origins via `RELAY_EXTENSION_ORIGINS` only. */
export const RELAY_EXTENSION_AUTH_API_PREFIX = "/api/v1/auth/extension/";

/**
 * Parse comma-separated `RELAY_EXTENSION_ORIGINS`. Empty or unset env → empty set (fail-closed for extension CORS).
 */
export function parseRelayExtensionOrigins(): ReadonlySet<string> {
  const raw = process.env.RELAY_EXTENSION_ORIGINS?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

/** True for `chrome-extension:` and `moz-extension:` scheme URLs (case-sensitive per URL parser). */
export function isBrowserExtensionOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return u.protocol === "chrome-extension:" || u.protocol === "moz-extension:";
  } catch {
    return false;
  }
}
