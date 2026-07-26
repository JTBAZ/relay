/**
 * @fileoverview Patron experience module patron-handle-policy.ts — see exported symbols.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma Account, TenantMembership, and related patron tables
 */
import { randomBytes } from "node:crypto";

/** Lowercase reserved segments (D16 + short infra list). */
export const PATRON_HANDLE_RESERVED = new Set([
  "admin",
  "api",
  "mod",
  "moderator",
  "null",
  "relay",
  "staff",
  "support",
  "system",
  "undefined",
  "www",
  "help",
  "status",
  "login",
  "logout",
  "signup",
  "settings",
  "patron",
  "creator",
  "feed",
  "discover",
  "notifications"
]);

const HANDLE_RE = /^[a-z0-9_-]{2,30}$/;

export function normalizePatronHandle(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validatePatronHandleFormat(norm: string): { ok: true } | { ok: false; message: string } {
  if (!HANDLE_RE.test(norm)) {
    return {
      ok: false,
      message:
        "Handle must be 2–30 characters: letters, digits, underscore, or hyphen (stored lowercase)."
    };
  }
  return { ok: true };
}

export function isReservedPatronHandle(norm: string): boolean {
  return PATRON_HANDLE_RESERVED.has(norm);
}

export function generateAutoPatronHandle(): string {
  const suffix = randomBytes(3).toString("hex");
  return `user_${suffix}`;
}
