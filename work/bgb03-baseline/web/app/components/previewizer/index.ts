/**
 * Stable Previewizer silo entry.
 * Autopost/distribution should import from here (or PreviewizerOverlay),
 * not from `app/dev/previewizer`.
 */
export { default as PreviewizerClient, default } from "./previewizer-client";
export type { PreviewizerClientProps } from "./previewizer-client";
