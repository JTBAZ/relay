/**
 * HMAC-signed OAuth state for creator-owned Patreon linking (EH-040).
 * Binds site + account + PKCE verifier + safe return path; CSRF + expiry.
 */

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual
} from "node:crypto";

const STATE_VERSION = "1";
const DEFAULT_TTL_MS = 15 * 60 * 1000;
const MIN_SECRET_LEN = 16;

export type PatreonOAuthStatePayload = {
  v: number;
  siteId: string;
  accountId: string;
  nonce: string;
  codeVerifier: string;
  returnPath: string;
  exp: number;
};

export type SignPatreonOAuthStateArgs = {
  siteId: string;
  accountId: string;
  returnPath?: string;
  ttlMs?: number;
  secret: string;
  nowMs?: number;
};

/**
 * Same-origin relative path only — rejects protocol-relative and absolute URLs.
 */
export function isSafeReturnPath(path: string | null | undefined): boolean {
  if (typeof path !== "string" || path.length === 0) return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;
  if (path.includes("://")) return false;
  if (path.includes("\\")) return false;
  return true;
}

export function normalizeReturnPath(
  path: string | null | undefined,
  fallback = "/account"
): string {
  return isSafeReturnPath(path) ? (path as string) : fallback;
}

function assertSecret(secret: string): string {
  const s = secret.trim();
  if (s.length < MIN_SECRET_LEN) {
    throw new Error(
      `ESCAPE_HATCH_PATREON_OAUTH_STATE_SECRET is not set or too short (min ${MIN_SECRET_LEN} chars).`
    );
  }
  return s;
}

/** Generate a PKCE code_verifier (43–128 chars, unreserved). */
export function mintPkceVerifier(): string {
  return randomBytes(32).toString("base64url");
}

/** S256 code_challenge from verifier. */
export function pkceChallengeS256(verifier: string): string {
  return createHash("sha256").update(verifier, "utf8").digest("base64url");
}

export function signPatreonOAuthState(
  args: SignPatreonOAuthStateArgs
): { state: string; expiresAtIso: string; payload: PatreonOAuthStatePayload } {
  const secret = assertSecret(args.secret);
  const now = args.nowMs ?? Date.now();
  const exp = now + (args.ttlMs ?? DEFAULT_TTL_MS);
  const payload: PatreonOAuthStatePayload = {
    v: 1,
    siteId: args.siteId.trim(),
    accountId: args.accountId.trim(),
    nonce: randomBytes(16).toString("base64url"),
    codeVerifier: mintPkceVerifier(),
    returnPath: normalizeReturnPath(args.returnPath),
    exp
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  const sig = createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return {
    state: `${STATE_VERSION}.${payloadB64}.${sig}`,
    expiresAtIso: new Date(exp).toISOString(),
    payload
  };
}

export type VerifyPatreonOAuthStateResult =
  | { ok: true; payload: PatreonOAuthStatePayload }
  | { ok: false; reason: string };

/**
 * Verify HMAC, expiry, and optional account/site binding.
 * When expectedAccountId / expectedSiteId are provided, they must match.
 */
export function verifyPatreonOAuthState(
  state: string,
  secret: string,
  opts?: {
    expectedAccountId?: string;
    expectedSiteId?: string;
    nowMs?: number;
  }
): VerifyPatreonOAuthStateResult {
  let secretOk: string;
  try {
    secretOk = assertSecret(secret);
  } catch {
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

  const expectedSig = createHmac("sha256", secretOk)
    .update(payloadB64)
    .digest("base64url");
  const sigBuf = Buffer.from(sig, "utf8");
  const expBuf = Buffer.from(expectedSig, "utf8");
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, reason: "signature" };
  }

  let parsed: PatreonOAuthStatePayload;
  try {
    parsed = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    ) as PatreonOAuthStatePayload;
  } catch {
    return { ok: false, reason: "payload" };
  }

  if (
    typeof parsed.v !== "number" ||
    typeof parsed.siteId !== "string" ||
    typeof parsed.accountId !== "string" ||
    typeof parsed.nonce !== "string" ||
    typeof parsed.codeVerifier !== "string" ||
    typeof parsed.returnPath !== "string" ||
    typeof parsed.exp !== "number"
  ) {
    return { ok: false, reason: "payload" };
  }

  const now = opts?.nowMs ?? Date.now();
  if (parsed.exp < now) {
    return { ok: false, reason: "expired" };
  }

  if (
    opts?.expectedAccountId !== undefined &&
    parsed.accountId !== opts.expectedAccountId
  ) {
    return { ok: false, reason: "account" };
  }
  if (
    opts?.expectedSiteId !== undefined &&
    parsed.siteId !== opts.expectedSiteId
  ) {
    return { ok: false, reason: "site" };
  }

  if (!isSafeReturnPath(parsed.returnPath)) {
    return { ok: false, reason: "return_path" };
  }

  return { ok: true, payload: parsed };
}
