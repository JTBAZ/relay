/**
 * @fileoverview Patron experience module notification-service.ts — see exported symbols.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma Account, TenantMembership, and related patron tables
 * @security-audit-required Patron PII or entitlement paths — audit responses and logs.
 */
/**
 * PE-G (BO-P3-03) — notification storage + read API.
 *
 * Owns the per-recipient `Notification` rows (writer side via `createOrCluster` called by the
 * delivery worker; reader side via `listNotifications`, `unreadCount`, `markRead`).
 *
 * Recipient lanes (Option B):
 *   - Patron: `recipientMembershipId`
 *   - Creator studio owner: `recipientCreatorAccountId`
 *   Exactly one lane is set per row.
 *
 * Clustering contract:
 *   - Same (recipient, clusterKey, unread) within `CLUSTER_WINDOW_MS` => increment
 *     count + bump updatedAt + replace the latest payload.
 *   - Otherwise => new row.
 *   - clusterKey null => never coalesce (used for high-signal kinds like `tier_changed`).
 *
 * Non-clustered inserts use partial unique indexes per recipient lane when `cluster_key` is null;
 * `P2002` is treated as idempotent return of the existing row.
 *
 * The worker is the only writer. The HTTP layer reads + flips read state.
 */

import type { NotificationKind, Prisma, PrismaClient } from "@prisma/client";

/** Window inside which repeated events with the same clusterKey collapse into one row. */
export const CLUSTER_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export interface CreateNotificationInput {
  /** Patron lane — set for patron-facing notifications. */
  recipientMembershipId?: string | null;
  /** Creator lane — set for studio-owner notifications. */
  recipientCreatorAccountId?: string | null;
  relayCreatorId?: string;
  kind: NotificationKind;
  payload: Record<string, unknown>;
  /** When set + an unread row matches inside CLUSTER_WINDOW_MS, the row is updated in place. */
  clusterKey?: string | null;
  sourceEventId?: string | null;
}

export interface NotificationRecord {
  id: string;
  recipientMembershipId: string | null;
  recipientCreatorAccountId: string | null;
  relayCreatorId: string;
  kind: NotificationKind;
  payload: Record<string, unknown>;
  clusterKey: string | null;
  clusterCount: number;
  sourceEventId: string | null;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function assertExactlyOneRecipient(input: CreateNotificationInput): void {
  const hasMembership = Boolean(input.recipientMembershipId);
  const hasCreator = Boolean(input.recipientCreatorAccountId);
  if (hasMembership === hasCreator) {
    throw new Error("Notification requires exactly one recipient lane");
  }
}

function recipientWhere(input: CreateNotificationInput): Prisma.NotificationWhereInput {
  if (input.recipientCreatorAccountId) {
    return { recipientCreatorAccountId: input.recipientCreatorAccountId };
  }
  return { recipientMembershipId: input.recipientMembershipId! };
}

function rowToRecord(row: {
  id: string;
  recipientMembershipId: string | null;
  recipientCreatorAccountId: string | null;
  relayCreatorId: string;
  kind: NotificationKind;
  payloadJson: Prisma.JsonValue;
  clusterKey: string | null;
  clusterCount: number;
  sourceEventId: string | null;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): NotificationRecord {
  return {
    id: row.id,
    recipientMembershipId: row.recipientMembershipId,
    recipientCreatorAccountId: row.recipientCreatorAccountId,
    relayCreatorId: row.relayCreatorId,
    kind: row.kind,
    payload: (row.payloadJson as Record<string, unknown> | null) ?? {},
    clusterKey: row.clusterKey,
    clusterCount: row.clusterCount,
    sourceEventId: row.sourceEventId,
    readAt: row.readAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

/**
 * Idempotent write entry-point. Use this from the delivery worker for every recipient. Returns
 * the row that ended up reflecting this event (either the new row or the updated cluster).
 */
export async function createOrClusterNotification(
  prisma: PrismaClient,
  input: CreateNotificationInput
): Promise<NotificationRecord> {
  assertExactlyOneRecipient(input);
  const recipient = recipientWhere(input);

  if (input.clusterKey) {
    const cutoff = new Date(Date.now() - CLUSTER_WINDOW_MS);
    const existing = await prisma.notification.findFirst({
      where: {
        ...recipient,
        clusterKey: input.clusterKey,
        readAt: null,
        createdAt: { gte: cutoff }
      },
      orderBy: { createdAt: "desc" }
    });
    if (existing) {
      const updated = await prisma.notification.update({
        where: { id: existing.id },
        data: {
          payloadJson: input.payload as Prisma.InputJsonValue,
          clusterCount: { increment: 1 },
          sourceEventId: input.sourceEventId ?? existing.sourceEventId
        }
      });
      return rowToRecord(updated);
    }
  }
  try {
    const created = await prisma.notification.create({
      data: {
        recipientMembershipId: input.recipientMembershipId ?? null,
        recipientCreatorAccountId: input.recipientCreatorAccountId ?? null,
        relayCreatorId: input.relayCreatorId ?? "",
        kind: input.kind,
        payloadJson: input.payload as Prisma.InputJsonValue,
        clusterKey: input.clusterKey ?? null,
        sourceEventId: input.sourceEventId ?? null
      }
    });
    return rowToRecord(created);
  } catch (e) {
    const p2002 =
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2002";
    if (
      p2002 &&
      !input.clusterKey &&
      input.sourceEventId != null &&
      input.sourceEventId !== ""
    ) {
      const raced = await prisma.notification.findFirst({
        where: {
          sourceEventId: input.sourceEventId,
          ...recipient,
          clusterKey: null
        }
      });
      if (raced) return rowToRecord(raced);
    }
    throw e;
  }
}

export interface ListNotificationsOptions {
  recipientMembershipId: string;
  /** When set, also returns notifications addressed to this creator account. */
  recipientCreatorAccountId?: string | null;
  unreadOnly?: boolean;
  /** Optional creator scope filter (e.g. notifications about a specific creator). */
  relayCreatorId?: string;
  limit?: number;
  /** Opaque cursor: previous page's last notification id. */
  cursor?: string;
}

export interface ListNotificationsResult {
  items: NotificationRecord[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function recipientOrFilter(options: {
  recipientMembershipId: string;
  recipientCreatorAccountId?: string | null;
}): Prisma.NotificationWhereInput {
  const lanes: Prisma.NotificationWhereInput[] = [
    { recipientMembershipId: options.recipientMembershipId }
  ];
  if (options.recipientCreatorAccountId) {
    lanes.push({ recipientCreatorAccountId: options.recipientCreatorAccountId });
  }
  return lanes.length === 1 ? lanes[0]! : { OR: lanes };
}

export async function listNotifications(
  prisma: PrismaClient,
  options: ListNotificationsOptions
): Promise<ListNotificationsResult> {
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT));
  const rows = await prisma.notification.findMany({
    where: {
      ...recipientOrFilter(options),
      ...(options.unreadOnly ? { readAt: null } : {}),
      ...(options.relayCreatorId !== undefined
        ? { relayCreatorId: options.relayCreatorId }
        : {})
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {})
  });
  const items = rows.slice(0, limit).map(rowToRecord);
  const nextCursor = rows.length > limit ? rows[limit].id : null;
  return { items, nextCursor };
}

export async function unreadCount(
  prisma: PrismaClient,
  args: {
    recipientMembershipId: string;
    recipientCreatorAccountId?: string | null;
  }
): Promise<number> {
  return prisma.notification.count({
    where: {
      ...recipientOrFilter(args),
      readAt: null
    }
  });
}

export async function markRead(
  prisma: PrismaClient,
  args: {
    recipientMembershipId: string;
    recipientCreatorAccountId?: string | null;
    notificationIds: string[];
  }
): Promise<{ updatedCount: number }> {
  if (args.notificationIds.length === 0) {
    return { updatedCount: 0 };
  }
  const result = await prisma.notification.updateMany({
    where: {
      ...recipientOrFilter(args),
      id: { in: args.notificationIds },
      readAt: null
    },
    data: { readAt: new Date() }
  });
  return { updatedCount: result.count };
}

export async function markAllRead(
  prisma: PrismaClient,
  args: {
    recipientMembershipId: string;
    recipientCreatorAccountId?: string | null;
  }
): Promise<{ updatedCount: number }> {
  const result = await prisma.notification.updateMany({
    where: {
      ...recipientOrFilter(args),
      readAt: null
    },
    data: { readAt: new Date() }
  });
  return { updatedCount: result.count };
}

/** Patron membership + optional creator account lane for merged inbox queries. */
export async function resolveNotificationRecipientScope(
  prisma: PrismaClient,
  args: { membershipId: string; accountId: string | null }
): Promise<{
  recipientMembershipId: string;
  recipientCreatorAccountId: string | null;
}> {
  let recipientCreatorAccountId: string | null = null;
  if (args.accountId) {
    const account = await prisma.account.findUnique({
      where: { id: args.accountId },
      select: { primaryRelayCreatorId: true, id: true }
    });
    if (account?.primaryRelayCreatorId) {
      recipientCreatorAccountId = account.id;
    }
  }
  return {
    recipientMembershipId: args.membershipId,
    recipientCreatorAccountId
  };
}
