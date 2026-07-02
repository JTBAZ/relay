/** Patreon origin for `cookies.get` (must match manifest host_permissions). */

export const PATREON_URL = "https://www.patreon.com";



/** Patreon new-post editor entry point for cross-post tab open. */

export const PATREON_NEW_POST_URL = "https://www.patreon.com/posts/new";

/** X compose entry for cross-post tab open. */
export const X_COMPOSE_URL = "https://x.com/compose/post";

/** DeviantArt Studio submit entry for cross-post tab open. */
export const DEVIANTART_SUBMIT_URL = "https://www.deviantart.com/submit";



/** Patreon web session cookie name (base64 in atob avoids leaking the name string in the popup bundle). */

export const PATREON_SESSION_COOKIE_NAME = atob("c2Vzc2lvbl9pZA==");



/** Production Relay host — web + API share this origin in prod (P-9). */

export const RELAY_HOSTED = "https://relayapp.me";


const IS_EXTENSION_DEV_BUILD = __EXT_ENV__ === "dev";


/** Next.js web app (consent page, settings deep links). Dev: :3000; prod: relayapp.me. */

export const RELAY_WEB_BASE = IS_EXTENSION_DEV_BUILD ? "http://localhost:3000" : RELAY_HOSTED;



/** Express API (extension bearer routes). Dev: :8787; prod: relayapp.me. */

export const RELAY_API_BASE = IS_EXTENSION_DEV_BUILD ? "http://localhost:8787" : RELAY_HOSTED;



/** @deprecated Prefer RELAY_API_BASE for fetch and RELAY_WEB_BASE for tab URLs. */

export const RELAY_BASE = RELAY_API_BASE;

