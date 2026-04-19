/** Patreon origin for `cookies.get` (must match manifest host_permissions). */
export const PATREON_URL = "https://www.patreon.com";

/** Patreon web session cookie name (base64 in atob avoids leaking the name string in the popup bundle). */
export const PATREON_SESSION_COOKIE_NAME = atob("c2Vzc2lvbl9pZA==");

/** Hosted Relay API — P-9: no user-configurable base URL. */
export const RELAY_BASE = "https://relayapp.me";
