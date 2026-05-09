/**
 * @fileoverview HMAC-MD5 verification helpers for Patreon platform webhook signatures (`X-Patreon-Signature`).
 * @description Patreon signs the **raw** POST body; header value is lowercase hex digest.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see {@link https://docs.patreon.com/} webhook signing
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Computes Patreon-style MD5 hex HMAC over the raw body bytes.
 * @param rawBody Unparsed request body buffer.
 * @param secret Creator webhook secret.
 */
export function patreonWebhookMd5Hex(rawBody: Buffer, secret: string): string {
  return createHmac("md5", secret).update(rawBody).digest("hex");
}

/**
 * Constant-time compare of header digest vs expected secret-derived digest.
 * @param rawBody Same bytes Patreon signed.
 * @param signatureHeader `X-Patreon-Signature` header (hex).
 * @param secret Webhook secret from Patreon dashboard / registration.
 */
export function verifyPatreonWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!signatureHeader?.trim() || !secret) {
    return false;
  }
  const expected = patreonWebhookMd5Hex(rawBody, secret);
  const got = signatureHeader.trim().toLowerCase();
  if (got.length !== expected.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(got, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    return false;
  }
}
