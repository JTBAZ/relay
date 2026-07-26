/**
 * Injectable cross-post content script path (relative to extension package root).
 * Used by background tab injection (`browser.scripting.executeScript({ files: [...] })`).
 */
export const FILL_PATREON_EDITOR_SCRIPT = "assets/fill-patreon-editor.js" as const;
export const FILL_X_COMPOSE_SCRIPT = "assets/fill-x-compose.js" as const;
export const FILL_DEVIANTART_SUBMIT_SCRIPT = "assets/fill-deviantart-submit.js" as const;
