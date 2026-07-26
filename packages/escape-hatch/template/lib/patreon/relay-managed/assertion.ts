/**
 * Compact JWS EdDSA (Ed25519) assertion verification for relay_managed (EH-041).
 * Kit is verify-only — Relay holds private keys. Mirrors Relay assertion format.
 */

import { createPublicKey, verify } from "node:crypto";

export const RELAY_ASSERTION_ALG = "EdDSA" as const;

export type RelayAssertionPublicKey = {
  kid: string;
  /** SPKI PEM or raw base64url OKP x (32 bytes). */
  publicKeyPem?: string;
  /** JWKS OKP x (base64url). */
  x?: string;
};

export type RelayAssertionClaims = {
  iss: string;
  aud: string;
  sub: string;
  site_id: string;
  account_id: string;
  nonce: string;
  jti: string;
  iat: number;
  nbf: number;
  exp: number;
  entitlement: {
    tier_ids: string[];
    observed_at: string;
    patron_status: string;
  };
};

function pemFromOkpX(x: string): string {
  const raw = Buffer.from(x, "base64url");
  if (raw.length !== 32) {
    throw new Error("invalid_okp_x");
  }
  // SPKI prefix for Ed25519 SubjectPublicKeyInfo
  const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
  const der = Buffer.concat([spkiPrefix, raw]);
  const b64 = der.toString("base64");
  const lines = b64.match(/.{1,64}/g) ?? [b64];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----\n`;
}

function resolvePem(key: RelayAssertionPublicKey): string {
  if (key.publicKeyPem) return key.publicKeyPem;
  if (key.x) return pemFromOkpX(key.x);
  throw new Error("missing_public_key");
}

export type VerifyRelayAssertionArgs = {
  token: string;
  expectedIssuer: string;
  expectedAudience: string;
  expectedSiteId: string;
  expectedAccountId?: string;
  expectedNonce?: string;
  keys: readonly RelayAssertionPublicKey[];
  nowMs?: number;
  maxObservationAgeMs?: number;
};

export type VerifyRelayAssertionResult =
  | { ok: true; claims: RelayAssertionClaims; kid: string }
  | { ok: false; reason: string };

/**
 * Verify issuer, audience, signature, kid, exp/nbf, nonce, observation time.
 */
export function verifyRelayAssertion(
  args: VerifyRelayAssertionArgs
): VerifyRelayAssertionResult {
  const parts = args.token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "format" };
  const [headerB64, payloadB64, sigB64] = parts;

  let header: { alg?: string; kid?: string };
  try {
    header = JSON.parse(
      Buffer.from(headerB64, "base64url").toString("utf8")
    ) as { alg?: string; kid?: string };
  } catch {
    return { ok: false, reason: "header" };
  }
  if (header.alg !== RELAY_ASSERTION_ALG || !header.kid) {
    return { ok: false, reason: "alg_or_kid" };
  }

  const key = args.keys.find((k) => k.kid === header.kid);
  if (!key) return { ok: false, reason: "unknown_kid" };

  let pem: string;
  try {
    pem = resolvePem(key);
  } catch {
    return { ok: false, reason: "key_material" };
  }

  const input = `${headerB64}.${payloadB64}`;
  let sigOk = false;
  try {
    sigOk = verify(
      null,
      Buffer.from(input, "utf8"),
      createPublicKey(pem),
      Buffer.from(sigB64, "base64url")
    );
  } catch {
    return { ok: false, reason: "signature" };
  }
  if (!sigOk) return { ok: false, reason: "signature" };

  let claims: RelayAssertionClaims;
  try {
    claims = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    ) as RelayAssertionClaims;
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
    args.expectedAccountId !== undefined &&
    claims.account_id !== args.expectedAccountId
  ) {
    return { ok: false, reason: "account_id" };
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
  const nowMs = args.nowMs ?? Date.now();
  const maxAge = args.maxObservationAgeMs ?? 24 * 60 * 60 * 1000;
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

/** Parse ESCAPE_HATCH_RELAY_ASSERTION_KEYS_JSON for overlapping static keys. */
export function parseAssertionKeysJson(
  raw: string | undefined
): RelayAssertionPublicKey[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: RelayAssertionPublicKey[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const kid = typeof rec.kid === "string" ? rec.kid : "";
      if (!kid) continue;
      const publicKeyPem =
        typeof rec.publicKeyPem === "string"
          ? rec.publicKeyPem
          : typeof rec.public_key_pem === "string"
            ? rec.public_key_pem
            : undefined;
      const x = typeof rec.x === "string" ? rec.x : undefined;
      if (!publicKeyPem && !x) continue;
      out.push({ kid, publicKeyPem, x });
    }
    return out;
  } catch {
    return [];
  }
}
