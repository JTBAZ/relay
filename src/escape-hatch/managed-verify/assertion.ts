/**
 * Compact JWS (EdDSA / Ed25519) assertion issue + verify (EH-041).
 * Format: base64url(header).base64url(payload).base64url(sig)
 */

import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import {
  DEFAULT_ASSERTION_TTL_SEC,
  MANAGED_VERIFY_ALG,
  type ManagedVerifyAssertionClaims,
  type EntitlementObservation,
  type ManagedVerifyKeyPair
} from "./types.js";

function b64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signingInput(headerB64: string, payloadB64: string): string {
  return `${headerB64}.${payloadB64}`;
}

export type IssueAssertionArgs = {
  issuer: string;
  audience: string;
  siteId: string;
  accountId: string;
  patreonUserId: string;
  nonce: string;
  jti: string;
  entitlement: EntitlementObservation;
  signingKey: ManagedVerifyKeyPair;
  ttlSec?: number;
  nowMs?: number;
};

export function issueManagedVerifyAssertion(args: IssueAssertionArgs): {
  token: string;
  claims: ManagedVerifyAssertionClaims;
} {
  const nowSec = Math.floor((args.nowMs ?? Date.now()) / 1000);
  const ttl = args.ttlSec ?? DEFAULT_ASSERTION_TTL_SEC;
  const claims: ManagedVerifyAssertionClaims = {
    iss: args.issuer,
    aud: args.audience,
    sub: args.patreonUserId,
    site_id: args.siteId,
    account_id: args.accountId,
    nonce: args.nonce,
    jti: args.jti,
    iat: nowSec,
    nbf: nowSec,
    exp: nowSec + ttl,
    entitlement: {
      tier_ids: [...args.entitlement.tierIds],
      observed_at: args.entitlement.observedAtIso,
      patron_status: args.entitlement.patronStatus
    }
  };
  const header = {
    alg: MANAGED_VERIFY_ALG,
    typ: "JWT",
    kid: args.signingKey.kid
  };
  const headerB64 = b64urlJson(header);
  const payloadB64 = b64urlJson(claims);
  const input = signingInput(headerB64, payloadB64);
  const key = createPrivateKey(args.signingKey.privateKeyPem);
  const sig = sign(null, Buffer.from(input, "utf8"), key).toString("base64url");
  return { token: `${headerB64}.${payloadB64}.${sig}`, claims };
}

export type VerifyAssertionArgs = {
  token: string;
  expectedIssuer: string;
  expectedAudience: string;
  expectedSiteId: string;
  expectedNonce?: string;
  verificationKeys: readonly ManagedVerifyKeyPair[];
  nowMs?: number;
  /** Max age of entitlement.observed_at relative to now (ms). Default 24h. */
  maxObservationAgeMs?: number;
};

export type VerifyAssertionResult =
  | { ok: true; claims: ManagedVerifyAssertionClaims; kid: string }
  | { ok: false; reason: string };

export function verifyManagedVerifyAssertion(
  args: VerifyAssertionArgs
): VerifyAssertionResult {
  const parts = args.token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "format" };
  const [headerB64, payloadB64, sigB64] = parts;

  let header: { alg?: string; kid?: string; typ?: string };
  try {
    header = JSON.parse(
      Buffer.from(headerB64, "base64url").toString("utf8")
    ) as { alg?: string; kid?: string; typ?: string };
  } catch {
    return { ok: false, reason: "header" };
  }
  if (header.alg !== MANAGED_VERIFY_ALG || !header.kid) {
    return { ok: false, reason: "alg_or_kid" };
  }

  const key = args.verificationKeys.find((k) => k.kid === header.kid);
  if (!key) return { ok: false, reason: "unknown_kid" };

  const input = signingInput(headerB64, payloadB64);
  const pub = createPublicKey(key.publicKeyPem);
  let sigOk = false;
  try {
    sigOk = verify(
      null,
      Buffer.from(input, "utf8"),
      pub,
      Buffer.from(sigB64, "base64url")
    );
  } catch {
    return { ok: false, reason: "signature" };
  }
  if (!sigOk) return { ok: false, reason: "signature" };

  let claims: ManagedVerifyAssertionClaims;
  try {
    claims = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    ) as ManagedVerifyAssertionClaims;
  } catch {
    return { ok: false, reason: "payload" };
  }

  if (
    typeof claims.iss !== "string" ||
    typeof claims.aud !== "string" ||
    typeof claims.sub !== "string" ||
    typeof claims.site_id !== "string" ||
    typeof claims.account_id !== "string" ||
    typeof claims.nonce !== "string" ||
    typeof claims.jti !== "string" ||
    typeof claims.iat !== "number" ||
    typeof claims.nbf !== "number" ||
    typeof claims.exp !== "number" ||
    !claims.entitlement ||
    !Array.isArray(claims.entitlement.tier_ids) ||
    typeof claims.entitlement.observed_at !== "string"
  ) {
    return { ok: false, reason: "claims" };
  }

  if (claims.iss !== args.expectedIssuer) return { ok: false, reason: "iss" };
  if (claims.aud !== args.expectedAudience) return { ok: false, reason: "aud" };
  if (claims.site_id !== args.expectedSiteId) {
    return { ok: false, reason: "site_id" };
  }
  if (
    args.expectedNonce !== undefined &&
    claims.nonce !== args.expectedNonce
  ) {
    return { ok: false, reason: "nonce" };
  }

  const nowSec = Math.floor((args.nowMs ?? Date.now()) / 1000);
  if (claims.nbf > nowSec) return { ok: false, reason: "nbf" };
  if (claims.exp < nowSec) return { ok: false, reason: "exp" };

  const observedMs = Date.parse(claims.entitlement.observed_at);
  if (!Number.isFinite(observedMs)) {
    return { ok: false, reason: "observation_time" };
  }
  const maxAge = args.maxObservationAgeMs ?? 24 * 60 * 60 * 1000;
  const nowMs = args.nowMs ?? Date.now();
  if (observedMs > nowMs + 60_000) {
    return { ok: false, reason: "observation_future" };
  }
  if (nowMs - observedMs > maxAge) {
    return { ok: false, reason: "observation_stale" };
  }

  if (claims.entitlement.patron_status !== "active_patron") {
    return { ok: false, reason: "inactive_patron" };
  }

  return { ok: true, claims, kid: header.kid };
}

/** Tamper helper for tests — flips one byte in the payload segment. */
export function tamperAssertionPayload(token: string): string {
  const parts = token.split(".");
  if (parts.length !== 3) return token;
  const raw = Buffer.from(parts[1], "base64url");
  raw[0] = raw[0] ^ 0xff;
  parts[1] = raw.toString("base64url");
  return parts.join(".");
}
