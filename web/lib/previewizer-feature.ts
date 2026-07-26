/**
 * Client-side Previewizer availability.
 * Default ON when unset. Set NEXT_PUBLIC_RELAY_PREVIEWIZER_ENABLED=0|false to hide
 * Open Previewizer and rely on Choose existing preview / full media.
 */
export function isPreviewizerEnabled(): boolean {
  const raw = (process.env.NEXT_PUBLIC_RELAY_PREVIEWIZER_ENABLED ?? "").trim().toLowerCase();
  if (!raw) return true;
  return raw !== "0" && raw !== "false" && raw !== "off" && raw !== "no";
}
