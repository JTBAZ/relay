/**
 * @fileoverview Patron experience module notification-prefs-service.ts — see exported symbols.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma Account, TenantMembership, and related patron tables
 * @security-audit-required Patron PII or entitlement paths — audit responses and logs.
 */
/**
 * PE-G (BO-P3-03) — notification preference read/write.
 *
 * Per (membership, creator, type) toggle. Defaults to enabled when no row exists, so the
 * absence of a preference row never silently mutes a recipient.
 *
 * Preference types (open string today; promote to enum if the set stabilizes):
 *   - "comment_replied"
 *   - "comment_liked"
 *   - "new_follower"
 *   - "tier_changed"
 *   - "new_post_followed"
 *   - "mention"
 */

import type { PrismaClient } from "@prisma/client";

export interface PreferenceRecord {
  preferenceType: string;
  relayCreatorId: string;
  enabled: boolean;
  updatedAt: Date | null;
}

export async function listPreferences(
  prisma: PrismaClient,
  args: { membershipId: string; relayCreatorId?: string }
): Promise<PreferenceRecord[]> {
  const rows = await prisma.notificationPreference.findMany({
    where: {
      patronMembershipId: args.membershipId,
      ...(args.relayCreatorId !== undefined
        ? { relayCreatorId: args.relayCreatorId }
        : {})
    },
    orderBy: [{ relayCreatorId: "asc" }, { preferenceType: "asc" }]
  });
  return rows.map((r) => ({
    preferenceType: r.preferenceType,
    relayCreatorId: r.relayCreatorId,
    enabled: r.enabled,
    updatedAt: r.updatedAt
  }));
}

export async function setPreference(
  prisma: PrismaClient,
  args: {
    membershipId: string;
    relayCreatorId: string;
    preferenceType: string;
    enabled: boolean;
  }
): Promise<PreferenceRecord> {
  const upserted = await prisma.notificationPreference.upsert({
    where: {
      patronMembershipId_relayCreatorId_preferenceType: {
        patronMembershipId: args.membershipId,
        relayCreatorId: args.relayCreatorId,
        preferenceType: args.preferenceType
      }
    },
    create: {
      patronMembershipId: args.membershipId,
      relayCreatorId: args.relayCreatorId,
      preferenceType: args.preferenceType,
      enabled: args.enabled
    },
    update: { enabled: args.enabled }
  });
  return {
    preferenceType: upserted.preferenceType,
    relayCreatorId: upserted.relayCreatorId,
    enabled: upserted.enabled,
    updatedAt: upserted.updatedAt
  };
}

/**
 * Resolves whether a single (recipient, creator, kind) is enabled. Used by the delivery
 * worker before writing a Notification row so muted kinds never reach the inbox.
 *
 * Default policy: when no row exists, the kind is ENABLED. Callers must opt OUT explicitly.
 */
export async function isPreferenceEnabled(
  prisma: PrismaClient,
  args: { membershipId: string; relayCreatorId: string; preferenceType: string }
): Promise<boolean> {
  const row = await prisma.notificationPreference.findUnique({
    where: {
      patronMembershipId_relayCreatorId_preferenceType: {
        patronMembershipId: args.membershipId,
        relayCreatorId: args.relayCreatorId,
        preferenceType: args.preferenceType
      }
    }
  });
  return row ? row.enabled : true;
}
