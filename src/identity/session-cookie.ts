/**
 * @fileoverview HTTP cookie helpers for Relay opaque sessions and UI-only active-role lens.
 * @description Sets/clears `relay_session` (HttpOnly), `relay_signed_in`, and `relay_active_role` with shared Domain/Secure/Max-Age from env (`RELAY_COOKIE_SECURE`, `RELAY_COOKIE_DOMAIN`, `RELAY_SESSION_TTL_SECONDS`).
 * @see src/jsdoc-core-entities.ts
 * @security-audit-required Cookie flags and cross-subdomain `Domain=` behavior should match production threat model.
 */

import type { Request, Response } from "express";

import type { ActiveRole } from "./active-role-default.js";

const COOKIE_NAME = "relay_session";
const SIGNED_IN_NAME = "relay_signed_in";
const ACTIVE_ROLE_NAME = "relay_active_role";

/**
 * @description Resolves whether cookies get the `Secure` attribute (`RELAY_COOKIE_SECURE` or `NODE_ENV === "production"`).
 * @returns {boolean}
 */
function relayCookieSecure(): boolean {
  if (process.env.RELAY_COOKIE_SECURE === "1") return true;
  if (process.env.RELAY_COOKIE_SECURE === "0") return false;
  return process.env.NODE_ENV === "production";
}

/**
 * @description Optional cookie `Domain` from `RELAY_COOKIE_DOMAIN`.
 * @returns {string|undefined}
 */
function relayCookieDomain(): string | undefined {
  const d = process.env.RELAY_COOKIE_DOMAIN?.trim();
  return d && d.length > 0 ? d : undefined;
}

/**
 * @description Max-Age in seconds from a session expiry ISO string (minimum 60s).
 * @param {string} expiresAtIso
 * @returns {number}
 */
function maxAgeSecondsFromExpiry(expiresAtIso: string): number {
  const ms = new Date(expiresAtIso).getTime() - Date.now();
  return Math.max(60, Math.floor(ms / 1000));
}

/**
 * @description Default session Max-Age from `RELAY_SESSION_TTL_SECONDS` or 24h (matches `WEB_SESSION_TTL_MS`).
 * @returns {number}
 */
function maxAgeSecondsFromEnvOrDefault(): number {
  const raw = process.env.RELAY_SESSION_TTL_SECONDS?.trim();
  if (raw && /^\d+$/.test(raw)) {
    return Math.max(60, parseInt(raw, 10));
  }
  return 60 * 60 * 24; /* 24h — matches identity-service SESSION_TTL_MS */
}

/**
 * @description Sets HttpOnly `relay_session` + non-HttpOnly `relay_signed_in=1` on the response after minting an opaque session.
 * @param {import("express").Response} res
 * @param {string} token Opaque session secret (raw; not stored server-side on the wire beyond Set-Cookie).
 * @param {{ expiresAtIso?: string }} [opts] When set, Max-Age aligns with row `expires_at`.
 * @returns {void}
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

/**
 * @description Clears both session cookies (logout).
 * @param {import("express").Response} res
 * @returns {void}
 */
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
 * @description UI lens only — not HttpOnly; client may read for shell selection. Same Max-Age / Domain / Secure as session.
 * @param {import("express").Response} res
 * @param {import("./active-role-default.js").ActiveRole} role
 * @param {{ expiresAtIso?: string }} [opts]
 * @returns {void}
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

/**
 * @description Clears `relay_active_role`.
 * @param {import("express").Response} res
 * @returns {void}
 */
export function clearActiveRoleCookie(res: Response): void {
  const secure = relayCookieSecure();
  const domain = relayCookieDomain();
  const domainPart = domain ? `; Domain=${domain}` : "";
  const securePart = secure ? "; Secure" : "";
  const clearBase = `Path=/; SameSite=Lax; Max-Age=0${securePart}${domainPart}`;
  res.append("Set-Cookie", `${ACTIVE_ROLE_NAME}=; ${clearBase}`);
}

/**
 * @description Reads opaque `relay_session` from the `Cookie` header (HttpOnly cookies appear server-side).
 * @param {import("express").Request} req
 * @returns {string|null}
 */
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
