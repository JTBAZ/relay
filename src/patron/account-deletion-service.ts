/**
 * PE-J (BO-P4-02) — account deletion lifecycle.
 *
 * Three operations:
 *   - requestDeletion  : creates a `pending` AccountDeletion row scheduled for now+grace,
 *                        emits `account.deletion_requested` outbox event. Idempotent on a
 *                        single pending row per account (returns the existing row instead of
 *                        creating a second one).
 *   - cancelDeletion   : flips the pending row to `cancelled`; emits
 *                        `account.deletion_cancelled`. No-op when no pending row exists.
 *   - executeDeletion  : called by the sweeper (or directly in tests). Runs the full purge
 *                        in a single transaction, flips the row to `executed`, emits
 *                        `account.deletion_executed`.
 *
 * Grace period default: 7 days. Configurable via `RELAY_ACCOUNT_DELETION_GRACE_DAYS`.
 *
 * Audit:
 *   Three outbox event names are emitted at the lifecycle hops -- producers re-use
 *   `emitNotificationOutboxEvent` for shape consistency. These events are NOT consumed by the
 *   notification mapper today (intentional; deletion notifications live on a different surface),
 *   but they're durable in `outbox_events` for downstream analytics and platform-admin tooling.
 *
 * What `executeDeletion` actually deletes:
 *   The single `prisma.account.delete({ where: { id } })` call cascades to:
 *     - TenantMembership (cascades sessions, patronProfile, patronFollows,
 *       patronEntitlementSnapshots, patronCampaignAccess, feedCursors,
 *       notificationPreferences, notifications, patronFollowSeeds)
 *     - PatronOAuthCredential (1:1 on accountId)
 *     - AccountFollow (both follower + followed sides)
 *     - AccountBlock (both blocker + blocked sides)
 *     - Tenant.primaryAccount (set to null via SetNull -- account loses claim, tenant survives)
 *
 *   The cascade does NOT touch the soft-FK tables (PatronFavorite, PatronSavedCollection,
 *   Comment, CommentReaction, ContentReport) because those reference patronUserId / accountId
 *   as raw strings rather than via @relation. We purge those manually first.
 */

import { Prisma, type PrismaClient } from "@prisma/client";

import { emitNotificationOutboxEvent } from "./notification-event-emit.js";

export const DEFAULT_GRACE_DAYS = 7;
export const ACCOUNT_DELETION_REQUESTED_EVENT = "account.deletion_requested";
export const ACCOUNT_DELETION_CANCELLED_EVENT = "account.deletion_cancelled";
export const ACCOUNT_DELETION_EXECUTED_EVENT = "account.deletion_executed";

function graceDaysFromEnv(): number {
  const raw = (process.env.RELAY_ACCOUNT_DELETION_GRACE_DAYS ?? "").trim();
  if (raw === "") return DEFAULT_GRACE_DAYS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_GRACE_DAYS;
  return Math.floor(n);
}

export interface AccountDeletionRecord {
  id: string;
  accountId: string;
  status: "pending" | "executed" | "cancelled";
  requestedAt: Date;
  scheduledFor: Date;
  executedAt: Date | null;
  cancelledAt: Date | null;
  reason: string | null;
}

function rowToRecord(row: {
  id: string;
  accountId: string;
  status: "pending" | "executed" | "cancelled";
  requestedAt: Date;
  scheduledFor: Date;
  executedAt: Date | null;
  cancelledAt: Date | null;
  reason: string | null;
}): AccountDeletionRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    status: row.status,
    requestedAt: row.requestedAt,
    scheduledFor: row.scheduledFor,
    executedAt: row.executedAt,
    cancelledAt: row.cancelledAt,
    reason: row.reason
  };
}

export interface RequestDeletionInput {
  accountId: string;
  reason?: string | null;
  requesterIp?: string | null;
  /** Override grace period; defaults to env / DEFAULT_GRACE_DAYS. */
  graceDays?: number;
}

/**
 * Get the current pending request for an account (or null when none). Used by the GET
 * status route and by the sweeper.
 */
export async function getPendingDeletion(
  prisma: PrismaClient,
  accountId: string
): Promise<AccountDeletionRecord | null> {
  const row = await prisma.accountDeletion.findFirst({
    where: { accountId, status: "pending" },
    orderBy: { requestedAt: "desc" }
  });
  return row ? rowToRecord(row) : null;
}

/**
 * Create a deletion request. Idempotent: when a pending row already exists for the account
 * we return it unchanged rather than stacking duplicates.
 */
export async function requestDeletion(
  prisma: PrismaClient,
  input: RequestDeletionInput
): Promise<{ record: AccountDeletionRecord; created: boolean }> {
  const existing = await getPendingDeletion(prisma, input.accountId);
  if (existing) {
    return { record: existing, created: false };
  }
  const grace = input.graceDays ?? graceDaysFromEnv();
  const scheduledFor = new Date(Date.now() + grace * 24 * 60 * 60 * 1000);
  const created = await prisma.accountDeletion.create({
    data: {
      accountId: input.accountId,
      scheduledFor,
      reason: input.reason ?? null,
      requesterIp: input.requesterIp ?? null
    }
  });
  await emitNotificationOutboxEvent(prisma, {
    eventName: ACCOUNT_DELETION_REQUESTED_EVENT,
    tenantId: "",
    primaryId: input.accountId,
    producer: "account-deletion-service",
    payload: {
      account_id: input.accountId,
      scheduled_for: scheduledFor.toISOString(),
      grace_days: grace
    }
  });
  return { record: rowToRecord(created), created: true };
}

/**
 * Cancel a pending deletion. Idempotent: returns null when there's nothing pending. Returns
 * the cancelled row (now status='cancelled') when it succeeds.
 */
export async function cancelDeletion(
  prisma: PrismaClient,
  accountId: string
): Promise<AccountDeletionRecord | null> {
  const pending = await getPendingDeletion(prisma, accountId);
  if (!pending) return null;
  const updated = await prisma.accountDeletion.update({
    where: { id: pending.id },
    data: { status: "cancelled", cancelledAt: new Date() }
  });
  await emitNotificationOutboxEvent(prisma, {
    eventName: ACCOUNT_DELETION_CANCELLED_EVENT,
    tenantId: "",
    primaryId: accountId,
    producer: "account-deletion-service",
    payload: {
      account_id: accountId,
      deletion_id: updated.id
    }
  });
  return rowToRecord(updated);
}

export interface ExecuteDeletionResult {
  /** Updated AccountDeletion row (status='executed'). */
  record: AccountDeletionRecord;
  /** Counts per soft-FK table; cascade-deleted rows aren't itemized (Prisma doesn't surface them). */
  counts: {
    favorites: number;
    collections: number;
    collectionEntries: number;
    comments: number;
    commentReactions: number;
    contentReports: number;
    moderationActionsAuthored: number;
    accountBlocks: number;
    accountFollows: number;
    memberships: number;
  };
}

/**
 * Execute a pending deletion. Called by the sweeper (or directly in admin tooling). Performs
 * soft-FK purge + Account.delete (which cascades the rest) inside a single transaction so a
 * partial failure leaves nothing half-deleted. Idempotent: re-running on an already-executed
 * row is a no-op (returns the executed record + zero counts).
 */
export async function executeDeletion(
  prisma: PrismaClient,
  deletionId: string
): Promise<ExecuteDeletionResult | null> {
  const row = await prisma.accountDeletion.findUnique({ where: { id: deletionId } });
  if (!row) return null;
  if (row.status !== "pending") {
    return {
      record: rowToRecord(row),
      counts: {
        favorites: 0,
        collections: 0,
        collectionEntries: 0,
        comments: 0,
        commentReactions: 0,
        contentReports: 0,
        moderationActionsAuthored: 0,
        accountBlocks: 0,
        accountFollows: 0,
        memberships: 0
      }
    };
  }
  const accountId = row.accountId;

  const result = await prisma.$transaction(async (tx) => {
    // Resolve membership ids ONCE for soft-FK queries that key on patronMembershipId.
    const memberships = await tx.tenantMembership.findMany({
      where: { accountId },
      select: { id: true }
    });
    const membershipIds = memberships.map((m) => m.id);

    // Soft-FK purge -- order chosen so child references go before parents, even though most
    // of these are independent.
    let favorites = 0;
    let collections = 0;
    let collectionEntries = 0;
    let comments = 0;
    let commentReactions = 0;
    let contentReports = 0;
    let moderationActionsAuthored = 0;
    if (membershipIds.length > 0) {
      const favRes = await tx.patronFavorite.deleteMany({
        where: { patronMembershipId: { in: membershipIds } }
      });
      favorites = favRes.count;
      const entryRes = await tx.patronSavedCollectionEntry.count({
        where: { patronMembershipId: { in: membershipIds } }
      });
      collectionEntries = entryRes;
      const colRes = await tx.patronSavedCollection.deleteMany({
        where: { patronMembershipId: { in: membershipIds } }
      });
      collections = colRes.count;
      const cmtRes = await tx.comment.deleteMany({
        where: { patronUserId: { in: membershipIds } }
      });
      comments = cmtRes.count;
    }
    const reactRes = await tx.commentReaction.deleteMany({
      where: { accountId }
    });
    commentReactions = reactRes.count;
    const reportRes = await tx.contentReport.deleteMany({
      where: { reporterAccountId: accountId }
    });
    contentReports = reportRes.count;
    // ModerationAction rows authored by the patron (rare but possible if the account is also a
    // creator). Don't delete the rows -- they're an audit trail; just null out the actor.
    const modRes = await tx.moderationAction.updateMany({
      where: { actorAccountId: accountId },
      data: { actorAccountId: null }
    });
    moderationActionsAuthored = modRes.count;

    // Capture cascade-counted artifacts BEFORE the account delete (Prisma doesn't surface
    // cascade row counts).
    const blockCount = await tx.accountBlock.count({
      where: {
        OR: [{ blockerAccountId: accountId }, { blockedAccountId: accountId }]
      }
    });
    const followCount = await tx.accountFollow.count({
      where: {
        OR: [{ followerAccountId: accountId }, { followedAccountId: accountId }]
      }
    });

    // The big hammer. Cascades all relations declared in schema.prisma with onDelete: Cascade.
    await tx.account.delete({ where: { id: accountId } });

    // Mark the deletion row executed. NOTE: this row's accountId still references the deleted
    // account id (no FK on AccountDeletion.accountId by design -- audit log survives the delete).
    const updated = await tx.accountDeletion.update({
      where: { id: deletionId },
      data: { status: "executed", executedAt: new Date() }
    });

    return {
      record: rowToRecord(updated),
      counts: {
        favorites,
        collections,
        collectionEntries,
        comments,
        commentReactions,
        contentReports,
        moderationActionsAuthored,
        accountBlocks: blockCount,
        accountFollows: followCount,
        memberships: membershipIds.length
      }
    };
  });

  await emitNotificationOutboxEvent(prisma, {
    eventName: ACCOUNT_DELETION_EXECUTED_EVENT,
    tenantId: "",
    primaryId: accountId,
    producer: "account-deletion-service",
    payload: {
      account_id: accountId,
      deletion_id: deletionId,
      counts: result.counts as unknown as Prisma.InputJsonValue
    }
  });

  return result;
}

/**
 * Helper for the sweeper -- returns IDs of pending deletions whose grace has elapsed.
 * Bounded by `limit` so a single tick is bounded.
 */
export async function listDueDeletions(
  prisma: PrismaClient,
  args: { now?: Date; limit?: number } = {}
): Promise<{ id: string; accountId: string }[]> {
  const cutoff = args.now ?? new Date();
  const limit = args.limit ?? 50;
  return prisma.accountDeletion.findMany({
    where: { status: "pending", scheduledFor: { lte: cutoff } },
    select: { id: true, accountId: true },
    orderBy: { scheduledFor: "asc" },
    take: limit
  });
}
