/**
 * @fileoverview Browser extension origin parsing for Relay auth API CORS allow-lists.
 * @description Fail-closed when `RELAY_EXTENSION_ORIGINS` unset.
 * @see src/server.ts Extension consent and OAuth routes
 * @security-audit-required Origin checks must precede any cookie or token responses to untrusted browsers.
 */

/**
 * @description API routes that accept browser-extension origins via `RELAY_EXTENSION_ORIGINS` only.
 * @const {string} RELAY_EXTENSION_AUTH_API_PREFIX
 */
export const RELAY_EXTENSION_AUTH_API_PREFIX = "/api/v1/auth/extension/";

/**
 * @description Parses comma-separated `RELAY_EXTENSION_ORIGINS`. Empty or unset env → empty set (fail-closed for extension CORS).
 * @returns {ReadonlySet<string>} Normalized origin strings.
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

/**
 * @description Detects browser extension schemes (`chrome-extension:`, `moz-extension:`).
 * @param {string} origin Origin header or configured allow-list entry.
 * @returns {boolean} True when URL parser accepts and protocol matches.
 */
export function isBrowserExtensionOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return u.protocol === "chrome-extension:" || u.protocol === "moz-extension:";
  } catch {
    return false;
  }
}
