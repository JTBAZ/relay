/**
 * Portable auth (EH-031 / Path B) — app-managed users + opaque sessions.
 * Password hashes: Node crypto scrypt (no plaintext). Never leak to browser.
 */

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/** scrypt params — modern defaults for Node crypto (N=16384, r=8, p=1). */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_BYTES = 16;

/** Encoded form: scrypt$N$r$p$saltB64$keyB64 */
export function hashPassword(password: string): string {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const key = scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P
  });
  return [
    "scrypt",
    String(SCRYPT_N),
    String(SCRYPT_R),
    String(SCRYPT_P),
    salt.toString("base64url"),
    key.toString("base64url")
  ].join("$");
}

export function verifyPassword(
  password: string,
  encodedHash: string
): boolean {
  if (typeof password !== "string" || typeof encodedHash !== "string") {
    return false;
  }
  const parts = encodedHash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false;
  }
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], "base64url");
    expected = Buffer.from(parts[5], "base64url");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;
  try {
    const actual = scryptSync(password, salt, expected.length, { N, r, p });
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  } catch {
    return false;
  }
}

/** Raw session token (cookie value) — 32 random bytes, base64url. */
export function mintSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Hash a raw session token with optional pepper (ESCAPE_HATCH_SESSION_SECRET).
 * Only the hash is stored in Postgres.
 */
export function hashSessionToken(
  rawToken: string,
  sessionSecret: string
): string {
  return createHash("sha256")
    .update(`${sessionSecret}:${rawToken}`, "utf8")
    .digest("hex");
}

export const PORTABLE_SESSION_COOKIE = "eh_portable_session";

/** Default session lifetime: 14 days. */
export const PORTABLE_SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type SessionCookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
};

/**
 * Cookie flags for portable sessions.
 * secure=true when NODE_ENV=production or explicitly requested.
 * Documented in OPERATIONS.md — never put the raw token in localStorage.
 */
export function portableSessionCookieOptions(
  opts?: { secure?: boolean; maxAgeSec?: number }
): SessionCookieOptions {
  const secure =
    opts?.secure ??
    (process.env.NODE_ENV === "production" ||
      process.env.ESCAPE_HATCH_COOKIE_SECURE === "1");
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: opts?.maxAgeSec ?? Math.floor(PORTABLE_SESSION_TTL_MS / 1000)
  };
}
