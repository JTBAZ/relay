/**
 * Stripe webhook signature verification (EH-051).
 * Compatible with Stripe-Signature `t=…,v1=…` HMAC-SHA256 of `${t}.${rawBody}`.
 * No Stripe SDK required for CI / fail-closed verify.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length || ba.length === 0) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export type VerifyStripeWebhookSignatureArgs = {
  rawBody: Buffer | string;
  signatureHeader: string | null | undefined;
  secret: string | null | undefined;
  /** Max age of Stripe `t=` timestamp (seconds). Default 300. */
  toleranceSec?: number;
  nowMs?: number;
};

export type VerifyStripeWebhookSignatureResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Verify Stripe webhook authenticity. Always fail closed when secret or
 * signature is missing/invalid — never accept unsigned bodies in production paths.
 */
export function verifyStripeWebhookSignature(
  args: VerifyStripeWebhookSignatureArgs
): VerifyStripeWebhookSignatureResult {
  const secret = typeof args.secret === "string" ? args.secret.trim() : "";
  if (!secret) {
    return { ok: false, reason: "webhook_secret_required" };
  }

  const header = args.signatureHeader?.trim();
  if (!header) {
    return { ok: false, reason: "missing_signature" };
  }

  const raw =
    typeof args.rawBody === "string"
      ? args.rawBody
      : args.rawBody.toString("utf8");
  const nowMs = args.nowMs ?? Date.now();
  const toleranceSec = args.toleranceSec ?? 300;

  if (header.includes("t=") && header.includes("v1=")) {
    const parts = header.split(",").map((p) => p.trim());
    let t: string | undefined;
    const v1s: string[] = [];
    for (const p of parts) {
      if (p.startsWith("t=")) t = p.slice(2);
      if (p.startsWith("v1=")) v1s.push(p.slice(3));
    }
    if (!t || v1s.length === 0) {
      return { ok: false, reason: "invalid_signature_header" };
    }
    const tSec = Number.parseInt(t, 10);
    if (!Number.isFinite(tSec)) {
      return { ok: false, reason: "invalid_signature_timestamp" };
    }
    if (Math.abs(nowMs / 1000 - tSec) > toleranceSec) {
      return { ok: false, reason: "signature_timestamp_expired" };
    }
    const expected = createHmac("sha256", secret)
      .update(`${t}.${raw}`, "utf8")
      .digest("hex");
    if (!v1s.some((v) => timingSafeEqualHex(v, expected))) {
      return { ok: false, reason: "invalid_signature" };
    }
    return { ok: true };
  }

  // Fixture form used in unit tests: sha256=<hex> of raw body
  if (header.toLowerCase().startsWith("sha256=")) {
    const presented = header.slice("sha256=".length).trim();
    const expected = createHmac("sha256", secret)
      .update(raw, "utf8")
      .digest("hex");
    if (!timingSafeEqualHex(presented, expected)) {
      return { ok: false, reason: "invalid_signature" };
    }
    return { ok: true };
  }

  return { ok: false, reason: "unsupported_signature_format" };
}

/** Test helper: mint a Stripe-like signature header. */
export function mintStripeWebhookSignature(args: {
  rawBody: string;
  secret: string;
  timestampSec?: number;
}): string {
  const t = String(args.timestampSec ?? Math.floor(Date.now() / 1000));
  const v1 = createHmac("sha256", args.secret)
    .update(`${t}.${args.rawBody}`, "utf8")
    .digest("hex");
  return `t=${t},v1=${v1}`;
}
