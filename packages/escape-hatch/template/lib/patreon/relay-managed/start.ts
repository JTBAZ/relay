/**
 * Site→Relay start redirect + local HMAC state (EH-041).
 */

import {
  createHmac,
  randomBytes,
  timingSafeEqual
} from "node:crypto";
import {
  isSafeReturnPath,
  mintPkceVerifier,
  normalizeReturnPath,
  pkceChallengeS256
} from "../state";
import type { RelayManagedConfig } from "./config";

const STATE_VERSION = "rm1";
const DEFAULT_TTL_MS = 15 * 60 * 1000;

export type RelayManagedStatePayload = {
  v: number;
  siteId: string;
  accountId: string;
  nonce: string;
  codeVerifier: string;
  returnPath: string;
  exp: number;
};

export function mintRelayNonce(): string {
  return randomBytes(16).toString("base64url");
}

export function signRelayManagedState(args: {
  siteId: string;
  accountId: string;
  returnPath?: string;
  secret: string;
  ttlMs?: number;
  nowMs?: number;
}): { state: string; payload: RelayManagedStatePayload; expiresAtIso: string } {
  const now = args.nowMs ?? Date.now();
  const exp = now + (args.ttlMs ?? DEFAULT_TTL_MS);
  const payload: RelayManagedStatePayload = {
    v: 1,
    siteId: args.siteId.trim(),
    accountId: args.accountId.trim(),
    nonce: mintRelayNonce(),
    codeVerifier: mintPkceVerifier(),
    returnPath: normalizeReturnPath(args.returnPath),
    exp
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  const sig = createHmac("sha256", args.secret)
    .update(payloadB64)
    .digest("base64url");
  return {
    state: `${STATE_VERSION}.${payloadB64}.${sig}`,
    payload,
    expiresAtIso: new Date(exp).toISOString()
  };
}

export type VerifyRelayManagedStateResult =
  | { ok: true; payload: RelayManagedStatePayload }
  | { ok: false; reason: string };

export function verifyRelayManagedState(
  state: string,
  secret: string,
  opts?: {
    expectedAccountId?: string;
    expectedSiteId?: string;
    nowMs?: number;
  }
): VerifyRelayManagedStateResult {
  if (!secret || secret.length < 16) {
    return { ok: false, reason: "secret_unconfigured" };
  }
  const parts = state.split(".");
  if (parts.length !== 3) return { ok: false, reason: "format" };
  const [v, payloadB64, sig] = parts;
  if (v !== STATE_VERSION) return { ok: false, reason: "version" };

  const expectedSig = createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64url");
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expectedSig, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "signature" };
  }

  let parsed: RelayManagedStatePayload;
  try {
    parsed = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    ) as RelayManagedStatePayload;
  } catch {
    return { ok: false, reason: "payload" };
  }

  if (
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
  if (parsed.exp < now) return { ok: false, reason: "expired" };
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

/**
 * Build Relay start URL. Caller must ensure returnUrl origin is allowlisted on Relay.
 * Rejects absolute/external returnPath (local state only allows relative paths).
 */
export function buildRelayManagedStartUrl(args: {
  config: RelayManagedConfig;
  siteId: string;
  accountId: string;
  /** Absolute callback URL registered with Relay. */
  returnUrl: string;
  returnPath?: string;
  nowMs?: number;
}): { ok: true; url: string; state: string; expiresAtIso: string } | {
  ok: false;
  reason: string;
} {
  let returnParsed: URL;
  try {
    returnParsed = new URL(args.returnUrl);
  } catch {
    return { ok: false, reason: "return_url_invalid" };
  }
  if (
    returnParsed.protocol !== "https:" &&
    returnParsed.protocol !== "http:"
  ) {
    return { ok: false, reason: "return_url_invalid" };
  }
  if (returnParsed.username || returnParsed.password) {
    return { ok: false, reason: "return_url_invalid" };
  }

  const signed = signRelayManagedState({
    siteId: args.siteId,
    accountId: args.accountId,
    returnPath: args.returnPath,
    secret: args.config.stateSecret,
    nowMs: args.nowMs
  });
  const challenge = pkceChallengeS256(signed.payload.codeVerifier);

  const start = new URL(
    `${args.config.verifyBaseUrl}/api/v1/escape-hatch/managed-verify/start`
  );
  start.searchParams.set("site_id", args.config.siteId);
  start.searchParams.set("return_url", args.returnUrl);
  start.searchParams.set("state", signed.state);
  start.searchParams.set("nonce", signed.payload.nonce);
  start.searchParams.set("code_challenge", challenge);
  start.searchParams.set("code_challenge_method", "S256");
  start.searchParams.set("account_id", args.accountId);

  return {
    ok: true,
    url: start.toString(),
    state: signed.state,
    expiresAtIso: signed.expiresAtIso
  };
}
