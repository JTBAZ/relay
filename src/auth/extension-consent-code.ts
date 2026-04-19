import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const CODE_VERSION = "1";
export const EXTENSION_CONSENT_CODE_TTL_MS = 60_000;

/**
 * HMAC secret for `POST /api/v1/auth/extension/consent/start` → `consent_code` payloads.
 * Separate from Patreon OAuth state (`RELAY_PATREON_OAUTH_STATE_SECRET`).
 */
export function getExtensionConsentSecret(): string | null {
  const s = process.env.RELAY_EXTENSION_CONSENT_SECRET?.trim();
  return s && s.length >= 16 ? s : null;
}

/** In-memory single-use registry (per API process). Value = purge after timestamp. */
const usedConsentCodeHashes = new Map<string, number>();

function pruneUsedCodes(now: number): void {
  for (const [k, v] of usedConsentCodeHashes) {
    if (v < now) usedConsentCodeHashes.delete(k);
  }
}

function hashConsentCodeOpaque(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

export function isExtensionConsentCodeConsumed(code: string): boolean {
  const now = Date.now();
  pruneUsedCodes(now);
  return usedConsentCodeHashes.has(hashConsentCodeOpaque(code));
}

export function markExtensionConsentCodeConsumed(code: string): void {
  const now = Date.now();
  pruneUsedCodes(now);
  usedConsentCodeHashes.set(
    hashConsentCodeOpaque(code),
    now + EXTENSION_CONSENT_CODE_TTL_MS + 10_000
  );
}

export function signExtensionConsentCode(args: {
  accountId: string;
  installationId: string;
}): { consent_code: string; expires_at: string } {
  const secret = getExtensionConsentSecret();
  if (!secret) {
    throw new Error(
      "RELAY_EXTENSION_CONSENT_SECRET is not set or too short (min 16 characters)."
    );
  }
  const exp = Date.now() + EXTENSION_CONSENT_CODE_TTL_MS;
  const payload = {
    v: 1,
    a: args.accountId,
    i: args.installationId.trim(),
    exp
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(payloadB64).digest("base64url");
  const consent_code = `${CODE_VERSION}.${payloadB64}.${sig}`;
  return { consent_code, expires_at: new Date(exp).toISOString() };
}

export type VerifyExtensionConsentCodeResult =
  | { ok: true; accountId: string; installationId: string }
  | { ok: false; reason: string };

/**
 * Verify HMAC and expiry. Does not check single-use — caller must call
 * {@link isExtensionConsentCodeConsumed} / {@link markExtensionConsentCodeConsumed}.
 */
export function verifyExtensionConsentCode(code: string): VerifyExtensionConsentCodeResult {
  const secret = getExtensionConsentSecret();
  if (!secret) {
    return { ok: false, reason: "secret_unconfigured" };
  }
  const parts = code.split(".");
  if (parts.length !== 3) {
    return { ok: false, reason: "format" };
  }
  const [v, payloadB64, sig] = parts;
  if (v !== CODE_VERSION) {
    return { ok: false, reason: "version" };
  }
  const expectedSig = createHmac("sha256", secret).update(payloadB64).digest("base64url");
  const sigBuf = Buffer.from(sig, "utf8");
  const expBuf = Buffer.from(expectedSig, "utf8");
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, reason: "signature" };
  }
  let parsed: { v: number; a: string; i: string; exp: number };
  try {
    parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as typeof parsed;
  } catch {
    return { ok: false, reason: "payload" };
  }
  if (parsed.exp < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  if (typeof parsed.a !== "string" || typeof parsed.i !== "string") {
    return { ok: false, reason: "payload" };
  }
  return { ok: true, accountId: parsed.a, installationId: parsed.i };
}
