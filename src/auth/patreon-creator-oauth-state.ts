/**
 * @fileoverview HMAC-signed OAuth `state` payloads for creator Patreon linking (CSRF + binding).
 * @description Base64url JSON + HMAC using `RELAY_PATREON_OAUTH_STATE_SECRET`.
 * @security-audit-required Stateless tokens bind `accountId` and `creatorId`; callers must enforce session ownership before minting or accepting states.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const STATE_VERSION = "1";

/**
 * HMAC secret for `POST /api/v1/auth/patreon/creator/prepare` → `state` payloads.
 * Minimum length avoids accidental empty values.
 * @description Reads `RELAY_PATREON_OAUTH_STATE_SECRET` env; returns trimmed secret or `null` when unset/short.
 * @returns Secret string or `null` when not configured.
 */
export function getPatreonOAuthStateSecret(): string | null {
  const s = process.env.RELAY_PATREON_OAUTH_STATE_SECRET?.trim();
  return s && s.length >= 16 ? s : null;
}

/**
 * @description Signs a time-bounded state binding account and creator ids.
 * @param args.accountId Authenticated account attaching Patreon.
 * @param args.creatorId Creator scope for the linkage.
 * @param args.ttlMs Optional expiry offset (defaults 15 minutes).
 * @returns Opaque state string plus ISO expiry.
 * @throws {Error} When server secret missing or shorter than 16 chars.
 */
export function signCreatorPatreonOAuthState(args: {
  accountId: string;
  creatorId: string;
  ttlMs?: number;
}): { state: string; expiresAtIso: string } {
  const secret = getPatreonOAuthStateSecret();
  if (!secret) {
    throw new Error("RELAY_PATREON_OAUTH_STATE_SECRET is not set or too short (min 16 chars).");
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

/**
 * @description Validates HMAC, expiry version, and account/creator binding for a returning OAuth redirect.
 * @param state Serialized state from Patreon redirect.
 * @param expectedAccountId Account id encoded at mint time.
 * @param expectedCreatorId Creator id encoded at mint time.
 * @returns Success marker or `{ ok:false, reason }` diagnostic code.
 */
export function verifyCreatorPatreonOAuthState(
  state: string,
  expectedAccountId: string,
  expectedCreatorId: string
): { ok: true } | { ok: false; reason: string } {
  const secret = getPatreonOAuthStateSecret();
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
