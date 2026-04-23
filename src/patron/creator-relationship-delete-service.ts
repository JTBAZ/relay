/**
 * PE-J (BO-P4-02) — per-creator relationship delete.
 *
 * Drops every patron-side artifact tying ONE Account to ONE creator scope, without touching
 * the global Account or relationships with any OTHER creator. Use cases:
 *   - patron unsubscribes from a creator and wants their footprint gone
 *   - creator-side privacy request (initiated through support, not exposed to creator UI)
 *
 * Scope of deletion (in order):
 *   1. PatronFavorite      — by (patronMembershipId, creatorId)
 *   2. PatronSavedCollection (cascades entries) — by (patronMembershipId, creatorId)
 *   3. CommentReaction     — by (accountId, comment.relayCreatorId = creator) -- reactions on
 *      this creator's posts only
 *   4. Comment             — by (patronUserId = membership.id, relayCreatorId = creator).
 *      Cascades comment_reactions and replies via the FK.
 *   5. ContentReport       — filed by (reporterAccountId = account, relayCreatorId = creator)
 *   6. NotificationPreference — by (membership, creator)
 *   7. Notification         — by (recipientMembershipId = membership.id, relayCreatorId = creator)
 *   8. PatronEntitlementSnapshot, PatronCampaignAccess, FeedCursor, PatronFollow,
 *      PatronFollowSeed, PatronProfile, Session — cascade via TenantMembership delete
 *   9. TenantMembership    — finally; cascades the rest via @@onDelete(Cascade)
 *
 * What we DON'T touch:
 *   - Account row, AccountFollow rows (account-level, not per-creator)
 *   - Other people's data (someone else's reaction on a comment we authored)
 *   - OutboxEvent rows (operational telemetry)
 *
 * Returns counts so callers can surface "we deleted N favorites, M comments, …" in the UI.
 */

import type { PrismaClient } from "@prisma/client";

export interface CreatorRelationshipDeletionCounts {
  favorites: number;
  collections: number;
  collectionEntries: number;
  comments: number;
  commentReactions: number;
  contentReports: number;
  notificationPreferences: number;
  notifications: number;
  /** Always 0 or 1 -- a (account, tenant) row is unique. */
  memberships: number;
}

const EMPTY: CreatorRelationshipDeletionCounts = {
  favorites: 0,
  collections: 0,
  collectionEntries: 0,
  comments: 0,
  commentReactions: 0,
  contentReports: 0,
  notificationPreferences: 0,
  notifications: 0,
  memberships: 0
};

/**
 * Drop the relationship. Caller is responsible for authz (route-level Bearer + accountId match).
 *
 * Wraps everything in a single transaction so a partial failure leaves nothing half-deleted.
 * Cascades on TenantMembership do their own row-level locking; the transaction is mostly
 * about consistency, not throughput.
 */
export async function deleteCreatorRelationship(
  prisma: PrismaClient,
  args: { accountId: string; relayCreatorId: string }
): Promise<CreatorRelationshipDeletionCounts> {
  const { accountId, relayCreatorId } = args;
  if (!accountId || !relayCreatorId) {
    throw new Error("accountId and relayCreatorId are required");
  }

  // Resolve the (account, tenant) membership up front -- everything keyed on patronMembershipId
  // needs this id, and the tenant lookup is the canonical creator-scope pivot.
  const tenant = await prisma.tenant.findUnique({
    where: { relayCreatorId },
    select: { id: true }
  });
  if (!tenant) {
    return { ...EMPTY };
  }
  const membership = await prisma.tenantMembership.findUnique({
    where: {
      accountId_tenantId: { accountId, tenantId: tenant.id }
    },
    select: { id: true }
  });
  if (!membership) {
    // No membership row: still purge any orphaned soft-FK rows (defensive cleanup).
    return prisma.$transaction(async (tx) => {
      const reports = await tx.contentReport.deleteMany({
        where: { reporterAccountId: accountId, relayCreatorId }
      });
      return { ...EMPTY, contentReports: reports.count };
    });
  }
  const membershipId = membership.id;

  return prisma.$transaction(async (tx) => {
    const favorites = await tx.patronFavorite.deleteMany({
      where: { patronMembershipId: membershipId, creatorId: relayCreatorId }
    });
    // Capture entry count before deleting collections (cascade swallows it).
    const entries = await tx.patronSavedCollectionEntry.count({
      where: { patronMembershipId: membershipId, creatorId: relayCreatorId }
    });
    const collections = await tx.patronSavedCollection.deleteMany({
      where: { patronMembershipId: membershipId, creatorId: relayCreatorId }
    });
    // Reactions on the creator's comments -- find via comment scope.
    const reactionRows = await tx.commentReaction.findMany({
      where: {
        accountId,
        comment: { relayCreatorId }
      },
      select: { id: true }
    });
    const commentReactions = await tx.commentReaction.deleteMany({
      where: { id: { in: reactionRows.map((r) => r.id) } }
    });
    // Comments -- cascades their reactions + child replies via FK.
    const comments = await tx.comment.deleteMany({
      where: { patronUserId: membershipId, relayCreatorId }
    });
    const reports = await tx.contentReport.deleteMany({
      where: { reporterAccountId: accountId, relayCreatorId }
    });
    const notificationPrefs = await tx.notificationPreference.deleteMany({
      where: { patronMembershipId: membershipId, relayCreatorId }
    });
    const notifications = await tx.notification.deleteMany({
      where: { recipientMembershipId: membershipId, relayCreatorId }
    });
    // Final: TenantMembership delete cascades the rest (sessions, follows, entitlement snapshots,
    // patronProfile, feedCursors, follow seeds, etc.).
    await tx.tenantMembership.delete({ where: { id: membershipId } });

    return {
      favorites: favorites.count,
      collections: collections.count,
      collectionEntries: entries,
      comments: comments.count,
      commentReactions: commentReactions.count,
      contentReports: reports.count,
      notificationPreferences: notificationPrefs.count,
      notifications: notifications.count,
      memberships: 1
    };
  });
}
