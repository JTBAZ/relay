import { createHmac, timingSafeEqual } from "node:crypto";

/** Hex-encoded SHA-256 HMAC of the raw body using `RELAY_DISCORD_INGEST_HMAC_SECRET`. */
export const RELAY_DISCORD_SIGNATURE_HEADER = "x-relay-discord-signature";

/**
 * Shared secret for HMAC verification on `POST /api/v1/internal/discord/ingest`.
 * Must match the Discord bridge bot configuration.
 */
export function getDiscordIngestHmacSecret(): string | null {
  const s = process.env.RELAY_DISCORD_INGEST_HMAC_SECRET?.trim();
  return s || null;
}

function normalizeSignatureHeader(raw: string | undefined): string | null {
  if (!raw?.trim()) {
    return null;
  }
  const t = raw.trim();
  const prefixed = /^sha256=(.+)$/i.exec(t);
  if (prefixed?.[1]) {
    return prefixed[1]!.toLowerCase();
  }
  if (/^[0-9a-f]{64}$/i.test(t)) {
    return t.toLowerCase();
  }
  return null;
}

/**
 * Verifies `X-Relay-Discord-Signature: sha256=<hex>` (or raw 64-char hex) using HMAC-SHA256(secret, rawBody).
 */
export function verifyDiscordIngestHmac(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  const secret = getDiscordIngestHmacSecret();
  if (!secret) {
    return false;
  }
  const receivedHex = normalizeSignatureHeader(signatureHeader);
  if (!receivedHex || receivedHex.length !== 64) {
    return false;
  }
  const expectedHex = createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    const a = Buffer.from(expectedHex, "hex");
    const b = Buffer.from(receivedHex, "hex");
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
