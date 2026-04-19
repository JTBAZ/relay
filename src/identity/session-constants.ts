/** Opaque web session TTL (`relay_session` / standard Bearer). */
export const WEB_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** Extension-issued opaque grant — sliding window on each successful resolution. */
export const EXTENSION_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
