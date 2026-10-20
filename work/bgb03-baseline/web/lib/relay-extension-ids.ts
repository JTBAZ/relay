/**
 * Browser extension IDs allowed to complete `/extension/authorize` (mirrors server
 * `RELAY_EXTENSION_ORIGINS` — same id strings, without `chrome-extension://` prefix).
 */
export function parseRelayExtensionIds(): ReadonlySet<string> {
  const raw = process.env.NEXT_PUBLIC_RELAY_EXTENSION_IDS?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export function isRecognizedRelayExtensionId(extId: string | null | undefined): boolean {
  const id = extId?.trim();
  if (!id) return false;
  return parseRelayExtensionIds().has(id);
}
