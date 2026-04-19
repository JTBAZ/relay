/**
 * Popup ↔ background message types (keep in sync with `EXT-4A` popup).
 */
export const MSG_START_CONSENT = "START_CONSENT" as const;
export const MSG_SYNC_NOW = "SYNC_NOW" as const;
export const MSG_REVOKE_LOCAL = "REVOKE_LOCAL" as const;
export const MSG_STATUS = "STATUS" as const;

export type InternalRequest =
  | { type: typeof MSG_START_CONSENT }
  | { type: typeof MSG_SYNC_NOW }
  | { type: typeof MSG_REVOKE_LOCAL }
  | { type: typeof MSG_STATUS };

export type ExternalConsentMessage = { type: "RELAY_CONSENT_CODE"; code: string };

export function isInternalRequest(v: unknown): v is InternalRequest {
  if (v === null || typeof v !== "object" || !("type" in v)) return false;
  const t = (v as { type: unknown }).type;
  return (
    t === MSG_START_CONSENT ||
    t === MSG_SYNC_NOW ||
    t === MSG_REVOKE_LOCAL ||
    t === MSG_STATUS
  );
}

export function isExternalConsentMessage(v: unknown): v is ExternalConsentMessage {
  if (v === null || typeof v !== "object" || !("type" in v) || !("code" in v)) {
    return false;
  }
  const m = v as { type: unknown; code: unknown };
  return m.type === "RELAY_CONSENT_CODE" && typeof m.code === "string" && m.code.trim().length > 0;
}
