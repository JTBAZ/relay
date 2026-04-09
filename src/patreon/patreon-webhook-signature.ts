import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Patreon signs the **raw** POST body with HMAC-MD5; header value is lowercase hex.
 * @see https://docs.patreon.com — Webhook Responses / X-Patreon-Signature
 */
export function patreonWebhookMd5Hex(rawBody: Buffer, secret: string): string {
  return createHmac("md5", secret).update(rawBody).digest("hex");
}

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
