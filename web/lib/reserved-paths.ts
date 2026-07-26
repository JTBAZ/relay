/**
 * @fileoverview URL segments reserved from public `/[handle]` creator profile routes.
 * @description Keep aligned with `RESERVED_PUBLIC_SLUGS` in `src/creator/public-slug.ts`.
 */

/** Lowercase path segments that map to first-party app routes (not creator handles). */
export const RESERVED_PATH_SEGMENTS = new Set([
  "about",
  "account",
  "actions",
  "admin",
  "analytics",
  "api",
  "app",
  "auth",
  "callback",
  "collections",
  "commission-hub",
  "connect",
  "creator",
  "creators",
  "designer",
  "dev",
  "discover",
  "extension",
  "favorites",
  "feed",
  "former-subscriptions",
  "help",
  "import",
  "landing",
  "legal",
  "library",
  "login",
  "logout",
  "new-post",
  "notifications",
  "null",
  "oauth",
  "onboarding",
  "patron",
  "patrons",
  "platform-metrics",
  "preview",
  "privacy",
  "private",
  "profile",
  "public",
  "patreon",
  "relay",
  "settings",
  "signup",
  "static",
  "studio",
  "subscribestar",
  "support",
  "terms",
  "u",
  "undefined",
  "visitor",
  "visitors",
  "www"
]);

export function isReservedPathSegment(segment: string): boolean {
  const s = segment.trim().toLowerCase();
  if (!s) return true;
  return RESERVED_PATH_SEGMENTS.has(s);
}
