/**
 * @fileoverview Wall-clock TTL constants for opaque Relay sessions (web vs extension).
 * @description Paired with cookie Max-Age defaults in `session-cookie.ts` and `IdentityService.createSessionForUser`.
 * @see ./identity-service.js
 */

/** Opaque web session TTL (`relay_session` / standard Bearer). */
export const WEB_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** Extension-issued opaque grant — sliding window on each successful resolution. */
export const EXTENSION_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
