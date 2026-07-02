/**
 * @fileoverview Canonical Relay username policy and account-level persistence.
 * @description A Relay username is the account's one public @mention alias across the site.
 * @see prisma/schema.prisma Account.username
 */

import type { PrismaClient } from "@prisma/client";

export const RELAY_USERNAME_RESERVED = new Set([
  "about",
  "account",
  "actions",
  "admin",
  "analytics",
  "api",
  "app",
  "auth",
  "collections",
  "commission-hub",
  "connect",
  "creator",
  "creators",
  "designer",
  "dev",
  "discover",
  "extension",
  "feed",
  "former-subscriptions",
  "help",
  "import",
  "landing",
  "legal",
  "library",
  "login",
  "logout",
  "mod",
  "moderator",
  "new-post",
  "notifications",
  "null",
  "onboarding",
  "patron",
  "patrons",
  "platform-metrics",
  "preview",
  "profile",
  "relay",
  "root",
  "settings",
  "staff",
  "status",
  "studio",
  "subscribestar",
  "support",
  "system",
  "terms",
  "u",
  "undefined",
  "visitor",
  "www"
]);

const RELAY_USERNAME_RE = /^[a-z0-9][a-z0-9_-]{2,31}$/;

export function normalizeRelayUsername(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

export function validateRelayUsernameFormat(
  norm: string
): { ok: true } | { ok: false; message: string } {
  if (!RELAY_USERNAME_RE.test(norm)) {
    return {
      ok: false,
      message:
        "Username must be 3-32 characters: lowercase letters, numbers, underscore, or hyphen."
    };
  }
  if (RELAY_USERNAME_RESERVED.has(norm)) {
    return { ok: false, message: "That username is reserved." };
  }
  return { ok: true };
}

export async function setRelayUsernameForAccount(
  prisma: PrismaClient,
  args: { accountId: string; username: string }
): Promise<{ username: string; usernameNorm: string }> {
  const username = args.username.trim().replace(/^@+/, "");
  const usernameNorm = normalizeRelayUsername(username);
  const fmt = validateRelayUsernameFormat(usernameNorm);
  if (!fmt.ok) {
    throw Object.assign(new Error(fmt.message), {
      code: "VALIDATION_ERROR" as const
    });
  }

  const other = await prisma.account.findFirst({
    where: { usernameNorm, NOT: { id: args.accountId } },
    select: { id: true }
  });
  if (other) {
    throw Object.assign(new Error("That username is already taken."), {
      code: "CONFLICT" as const
    });
  }

  const updated = await prisma.account.update({
    where: { id: args.accountId },
    data: { username, usernameNorm },
    select: { username: true, usernameNorm: true }
  });
  return {
    username: updated.username ?? username,
    usernameNorm: updated.usernameNorm ?? usernameNorm
  };
}

