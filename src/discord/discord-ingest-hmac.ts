/**
 * @fileoverview HMAC verification helpers for internal Discord media ingest HTTP endpoint.
 * @description Uses `RELAY_DISCORD_INGEST_HMAC_SECRET` shared with the bridge bot.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * @description Header clients must send (`x-relay-discord-signature`) containing hex-encoded SHA-256 HMAC of raw body using `RELAY_DISCORD_INGEST_HMAC_SECRET`.
 */
export const RELAY_DISCORD_SIGNATURE_HEADER = "x-relay-discord-signature";

/**
 * Shared secret for HMAC verification on `POST /api/v1/internal/discord/ingest`.
 * Must match the Discord bridge bot configuration.
 * @description Reads shared secret env for HMAC verification.
 * @returns Secret string or `null` when unset.
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
 * @description Constant-time comparison when lengths match.
 * @param rawBody Exact request bytes used for signing.
 * @param signatureHeader Header value from client (optional `sha256=` prefix).
 * @returns `true` only when secret configured and digest matches.
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
