/**
 * HMAC-signed OAuth `state` for creator SubscribeStar linking (CSRF + binding).
 * Uses `RELAY_SUBSCRIBESTAR_OAUTH_STATE_SECRET` (fallback: `RELAY_SUBSCRIBESTAR_CREATOR_OAUTH_STATE_SECRET`).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const STATE_VERSION = "1";

export function getSubscribeStarOAuthStateSecret(): string | null {
  const s =
    process.env.RELAY_SUBSCRIBESTAR_OAUTH_STATE_SECRET?.trim() ||
    process.env.RELAY_SUBSCRIBESTAR_CREATOR_OAUTH_STATE_SECRET?.trim();
  return s && s.length >= 16 ? s : null;
}

export function signCreatorSubscribeStarOAuthState(args: {
  accountId: string;
  creatorId: string;
  ttlMs?: number;
}): { state: string; expiresAtIso: string } {
  const secret = getSubscribeStarOAuthStateSecret();
  if (!secret) {
    throw new Error(
      "RELAY_SUBSCRIBESTAR_OAUTH_STATE_SECRET is not set or too short (min 16 chars)."
    );
  }
  const exp = Date.now() + (args.ttlMs ?? 15 * 60 * 1000);
  const payload = {
    v: 1,
    a: args.accountId,
    c: args.creatorId.trim(),
    exp
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(payloadB64).digest("base64url");
  const state = `${STATE_VERSION}.${payloadB64}.${sig}`;
  return { state, expiresAtIso: new Date(exp).toISOString() };
}

export function verifyCreatorSubscribeStarOAuthState(
  state: string,
  expectedAccountId: string,
  expectedCreatorId: string
): { ok: true } | { ok: false; reason: string } {
  const secret = getSubscribeStarOAuthStateSecret();
  if (!secret) {
    return { ok: false, reason: "secret_unconfigured" };
  }
  const parts = state.split(".");
  if (parts.length !== 3) {
    return { ok: false, reason: "format" };
  }
  const [v, payloadB64, sig] = parts;
  if (v !== STATE_VERSION) {
    return { ok: false, reason: "version" };
  }
  const expectedSig = createHmac("sha256", secret).update(payloadB64).digest("base64url");
  const sigBuf = Buffer.from(sig, "utf8");
  const expBuf = Buffer.from(expectedSig, "utf8");
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, reason: "signature" };
  }
  let parsed: { v: number; a: string; c: string; exp: number };
  try {
    parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as typeof parsed;
  } catch {
    return { ok: false, reason: "payload" };
  }
  if (parsed.exp < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  if (parsed.a !== expectedAccountId) {
    return { ok: false, reason: "account" };
  }
  if (parsed.c !== expectedCreatorId.trim()) {
    return { ok: false, reason: "creator" };
  }
  return { ok: true };
}
