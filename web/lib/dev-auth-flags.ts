/**
 * @fileoverview Production-safe resolution of dev-only auth-bypass flags.
 * @description [R-SEC-08 / R-SEC-23 — security-review 2026-06] `NEXT_PUBLIC_RELAY_STUDIO_AUTH_DISABLED`
 *   and `NEXT_PUBLIC_RELAY_PLATFORM_METRICS_AUTH_DISABLED` are local-development conveniences. They are
 *   HARD-IGNORED in production builds (`NODE_ENV === "production"`) so an accidental prod env value can
 *   never disable the client-side session guards. Dev behavior is unchanged. See docs/security-review-2026-06.md.
 */

function isProductionBuild(): boolean {
  return typeof process !== "undefined" && process.env.NODE_ENV === "production";
}

/**
 * @description True only when the studio auth-disable flag is set AND this is not a production build.
 * @returns {boolean}
 */
export function studioAuthDisabled(): boolean {
  if (isProductionBuild()) return false;
  return process.env.NEXT_PUBLIC_RELAY_STUDIO_AUTH_DISABLED === "1";
}

/**
 * @description True only when the platform-metrics auth-disable flag is set AND this is not a production build.
 * @returns {boolean}
 */
export function platformMetricsAuthDisabled(): boolean {
  if (isProductionBuild()) return false;
  return process.env.NEXT_PUBLIC_RELAY_PLATFORM_METRICS_AUTH_DISABLED === "1";
}
