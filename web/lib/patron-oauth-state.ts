/**
 * Legacy payload — used only by `POST /api/v1/auth/patreon/patron/exchange` when
 * `RELAY_PATRON_PATRON_ALLOW_LEGACY_EXCHANGE=1` (emergency rollback). Product flows require
 * a Relay session first and use `POST .../patron/link`; we do not attach Patreon without an
 * `Account` to attach to.
 *
 * The session-first `/link` path does not need campaign/creator in state; those fields are
 * resolved from Patreon's identity API using the full `campaigns` scope. Kept for
 * backward-compat decoding of old callbacks and the rollback path.
 */
export type PatronOAuthStatePayload = {
  creator_id: string;
  patreon_campaign_numeric_id: string;
};

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Legacy: encodes `creator_id` + `patreon_campaign_numeric_id`. Only for the deprecated `/exchange` path. */
export function encodePatronOAuthState(p: PatronOAuthStatePayload): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(p)));
}

/**
 * Session-first CSRF nonce: encodes a random token so Patreon echoes it back and
 * the callback can verify the round-trip without needing `creator_id` or `campaign_numeric_id`.
 * Uses `crypto.randomUUID` (available in modern browsers and Node ≥ 19).
 */
export function encodePatronOAuthNonce(): string {
  const nonce =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ nonce })));
}

/**
 * Decodes and validates OAuth `state` returned by Patreon.
 * - If state is a **nonce** (session-first `/link` path): decodes without error; returns null.
 * - If state is a **legacy payload** (`creator_id` + `patreon_campaign_numeric_id`): validates and returns them.
 * - Throws on invalid base64url or unparseable JSON (tampered / corrupted state).
 */
export function decodePatronOAuthState(state: string): PatronOAuthStatePayload | null {
  let raw: string;
  try {
    raw = new TextDecoder().decode(base64UrlToBytes(state));
  } catch {
    throw new Error("Invalid OAuth state encoding.");
  }
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("Invalid OAuth state (not JSON).");
  }

  // Nonce-only state from the session-first connect page — valid, no legacy fields.
  if ("nonce" in o && !("creator_id" in o)) {
    return null;
  }

  // Legacy payload: both fields required.
  const creator_id = typeof o.creator_id === "string" ? o.creator_id.trim() : "";
  const patreon_campaign_numeric_id =
    typeof o.patreon_campaign_numeric_id === "string"
      ? o.patreon_campaign_numeric_id.trim()
      : "";
  if (!creator_id || !patreon_campaign_numeric_id) {
    throw new Error("Invalid OAuth state payload.");
  }
  if (!/^\d+$/.test(patreon_campaign_numeric_id)) {
    throw new Error("Invalid Patreon campaign id in state.");
  }
  return { creator_id, patreon_campaign_numeric_id };
}
