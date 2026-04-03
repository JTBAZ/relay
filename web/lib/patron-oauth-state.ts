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

export function encodePatronOAuthState(p: PatronOAuthStatePayload): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(p)));
}

export function decodePatronOAuthState(state: string): PatronOAuthStatePayload {
  let raw: string;
  try {
    raw = new TextDecoder().decode(base64UrlToBytes(state));
  } catch {
    throw new Error("Invalid OAuth state encoding.");
  }
  const o = JSON.parse(raw) as Record<string, unknown>;
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
