/**
 * @fileoverview Comment @mention parsing and recipient resolution.
 * @see prisma/schema.prisma Account, TenantMembership
 */

import type { PrismaClient } from "@prisma/client";

const MENTION_RE = /@([a-z0-9][a-z0-9_-]{1,31})/gi;
const EMAIL_OR_WORD_CHAR_BEFORE = /[a-z0-9_@.-]/i;

export interface MentionRecipient {
  /** Normalized handle as written without the leading @. */
  handle: string;
  recipientMembershipId: string;
  targetKind: "creator" | "patron";
  targetAccountId: string | null;
}

/**
 * Extract unique normalized handles from comment text.
 *
 * The parser intentionally avoids email-ish matches (`name@example.com`) and supports the
 * existing creator/patron handle character set: letters, digits, underscore, and hyphen.
 */
export function extractMentionHandles(body: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of body.matchAll(MENTION_RE)) {
    const atIndex = match.index ?? -1;
    if (atIndex > 0 && EMAIL_OR_WORD_CHAR_BEFORE.test(body.charAt(atIndex - 1))) {
      continue;
    }
    const handle = match[1]?.toLowerCase();
    if (!handle || seen.has(handle)) continue;
    seen.add(handle);
    out.push(handle);
  }
  return out;
}

/**
 * Resolve @handles to notification recipient memberships.
 *
 * Handles resolve only through `Account.usernameNorm`, the canonical Relay username. Profile
 * handles and creator public slugs are intentionally not aliases for @mentions.
 */
export async function resolveMentionRecipients(
  prisma: PrismaClient,
  args: {
    handles: string[];
    authorMembershipId: string;
  }
): Promise<MentionRecipient[]> {
  const handles = Array.from(new Set(args.handles.map((h) => h.toLowerCase()).filter(Boolean)));
  if (handles.length === 0) return [];

  const author = await prisma.tenantMembership.findUnique({
    where: { id: args.authorMembershipId },
    select: { id: true, accountId: true }
  });
  const authorAccountId = author?.accountId ?? null;

  const accounts = await prisma.account.findMany({
    where: { usernameNorm: { in: handles } },
    select: { id: true, usernameNorm: true, primaryRelayCreatorId: true }
  });

  const memberships =
    accounts.length > 0
      ? await prisma.tenantMembership.findMany({
          where: { accountId: { in: accounts.map((a) => a.id) } },
          select: { id: true, accountId: true }
        })
      : [];
  const membershipsByAccount = new Map<string, typeof memberships>();
  for (const membership of memberships) {
    const rows = membershipsByAccount.get(membership.accountId) ?? [];
    rows.push(membership);
    membershipsByAccount.set(membership.accountId, rows);
  }

  const recipients: MentionRecipient[] = [];
  const recipientKeys = new Set<string>();
  const addRecipient = (recipient: MentionRecipient) => {
    if (recipient.recipientMembershipId === args.authorMembershipId) return;
    if (recipient.targetAccountId && recipient.targetAccountId === authorAccountId) return;
    const key = recipient.recipientMembershipId;
    if (recipientKeys.has(key)) return;
    recipientKeys.add(key);
    recipients.push(recipient);
  };

  for (const account of accounts) {
    if (!account.usernameNorm) continue;
    const accountMemberships = membershipsByAccount.get(account.id) ?? [];
    for (const membership of accountMemberships) {
      addRecipient({
        handle: account.usernameNorm,
        recipientMembershipId: membership.id,
        targetKind: account.primaryRelayCreatorId ? "creator" : "patron",
        targetAccountId: membership.accountId
      });
    }
  }

  return recipients;
}

