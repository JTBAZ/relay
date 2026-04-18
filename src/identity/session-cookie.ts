import type { Request, Response } from "express";

import type { ActiveRole } from "./active-role-default.js";

const COOKIE_NAME = "relay_session";
const SIGNED_IN_NAME = "relay_signed_in";
const ACTIVE_ROLE_NAME = "relay_active_role";

function relayCookieSecure(): boolean {
  if (process.env.RELAY_COOKIE_SECURE === "1") return true;
  if (process.env.RELAY_COOKIE_SECURE === "0") return false;
  return process.env.NODE_ENV === "production";
}

function relayCookieDomain(): string | undefined {
  const d = process.env.RELAY_COOKIE_DOMAIN?.trim();
  return d && d.length > 0 ? d : undefined;
}

function maxAgeSecondsFromExpiry(expiresAtIso: string): number {
  const ms = new Date(expiresAtIso).getTime() - Date.now();
  return Math.max(60, Math.floor(ms / 1000));
}

function maxAgeSecondsFromEnvOrDefault(): number {
  const raw = process.env.RELAY_SESSION_TTL_SECONDS?.trim();
  if (raw && /^\d+$/.test(raw)) {
    return Math.max(60, parseInt(raw, 10));
  }
  return 60 * 60 * 24; /* 24h — matches identity-service SESSION_TTL_MS */
}

/**
 * Sets HttpOnly `relay_session` + non-HttpOnly `relay_signed_in=1` on the response.
 * Call after minting an opaque session; `expiresAtIso` should match the stored session row.
 */
export function setSessionCookie(
  res: Response,
  token: string,
  opts?: { expiresAtIso?: string }
): void {
  const maxAge = opts?.expiresAtIso
    ? maxAgeSecondsFromExpiry(opts.expiresAtIso)
    : maxAgeSecondsFromEnvOrDefault();
  const secure = relayCookieSecure();
  const domain = relayCookieDomain();
  const domainPart = domain ? `; Domain=${domain}` : "";
  const securePart = secure ? "; Secure" : "";

  const sessionPair = `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${securePart}${domainPart}`;
  const signedPair = `${SIGNED_IN_NAME}=1; Path=/; SameSite=Lax; Max-Age=${maxAge}${securePart}${domainPart}`;

  res.append("Set-Cookie", sessionPair);
  res.append("Set-Cookie", signedPair);
}

/** Clears both session cookies (e.g. logout). */
export function clearSessionCookie(res: Response): void {
  const secure = relayCookieSecure();
  const domain = relayCookieDomain();
  const domainPart = domain ? `; Domain=${domain}` : "";
  const securePart = secure ? "; Secure" : "";
  const clearBase = `Path=/; SameSite=Lax; Max-Age=0${securePart}${domainPart}`;

  res.append("Set-Cookie", `${COOKIE_NAME}=; ${clearBase}`);
  res.append("Set-Cookie", `${SIGNED_IN_NAME}=; ${clearBase}`);
}

/**
 * UI lens only — **not** HttpOnly (client may read for shell selection). Same Max-Age / Domain / Secure as session.
 */
export function setActiveRoleCookie(
  res: Response,
  role: ActiveRole,
  opts?: { expiresAtIso?: string }
): void {
  const maxAge = opts?.expiresAtIso
    ? maxAgeSecondsFromExpiry(opts.expiresAtIso)
    : maxAgeSecondsFromEnvOrDefault();
  const secure = relayCookieSecure();
  const domain = relayCookieDomain();
  const domainPart = domain ? `; Domain=${domain}` : "";
  const securePart = secure ? "; Secure" : "";
  const pair = `${ACTIVE_ROLE_NAME}=${role}; Path=/; SameSite=Lax; Max-Age=${maxAge}${securePart}${domainPart}`;
  res.append("Set-Cookie", pair);
}

export function clearActiveRoleCookie(res: Response): void {
  const secure = relayCookieSecure();
  const domain = relayCookieDomain();
  const domainPart = domain ? `; Domain=${domain}` : "";
  const securePart = secure ? "; Secure" : "";
  const clearBase = `Path=/; SameSite=Lax; Max-Age=0${securePart}${domainPart}`;
  res.append("Set-Cookie", `${ACTIVE_ROLE_NAME}=; ${clearBase}`);
}

/** Reads opaque `relay_session` from `Cookie` header (HttpOnly cookies appear here server-side). */
export function readSessionCookie(req: Request): string | null {
  const raw = req.headers.cookie;
  if (!raw || typeof raw !== "string") return null;
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    if (name !== COOKIE_NAME) continue;
    const value = part.slice(idx + 1).trim();
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}
