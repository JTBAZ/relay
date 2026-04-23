/**
 * PE-G (BO-P3-03) — notification storage + read API.
 *
 * Owns the per-recipient `Notification` rows (writer side via `createOrCluster` called by the
 * delivery worker; reader side via `listNotifications`, `unreadCount`, `markRead`).
 *
 * Clustering contract:
 *   - Same (recipientMembershipId, clusterKey, unread) within `CLUSTER_WINDOW_MS` => increment
 *     count + bump updatedAt + replace the latest payload.
 *   - Otherwise => new row.
 *   - clusterKey null => never coalesce (used for high-signal kinds like `tier_changed`).
 *
 * The worker is the only writer. The HTTP layer reads + flips read state.
 */

import type { NotificationKind, PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";

/** Window inside which repeated events with the same clusterKey collapse into one row. */
export const CLUSTER_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export interface CreateNotificationInput {
  recipientMembershipId: string;
  relayCreatorId?: string;
  kind: NotificationKind;
  payload: Record<string, unknown>;
  /** When set + an unread row matches inside CLUSTER_WINDOW_MS, the row is updated in place. */
  clusterKey?: string | null;
  sourceEventId?: string | null;
}

export interface NotificationRecord {
  id: string;
  recipientMembershipId: string;
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

function rowToRecord(row: {
  id: string;
  recipientMembershipId: string;
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
  if (input.clusterKey) {
    const cutoff = new Date(Date.now() - CLUSTER_WINDOW_MS);
    const existing = await prisma.notification.findFirst({
      where: {
        recipientMembershipId: input.recipientMembershipId,
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
  const created = await prisma.notification.create({
    data: {
      recipientMembershipId: input.recipientMembershipId,
      relayCreatorId: input.relayCreatorId ?? "",
      kind: input.kind,
      payloadJson: input.payload as Prisma.InputJsonValue,
      clusterKey: input.clusterKey ?? null,
      sourceEventId: input.sourceEventId ?? null
    }
  });
  return rowToRecord(created);
}

export interface ListNotificationsOptions {
  recipientMembershipId: string;
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

export async function listNotifications(
  prisma: PrismaClient,
  options: ListNotificationsOptions
): Promise<ListNotificationsResult> {
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT));
  const rows = await prisma.notification.findMany({
    where: {
      recipientMembershipId: options.recipientMembershipId,
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
  recipientMembershipId: string
): Promise<number> {
  return prisma.notification.count({
    where: { recipientMembershipId, readAt: null }
  });
}

export async function markRead(
  prisma: PrismaClient,
  args: { recipientMembershipId: string; notificationIds: string[] }
): Promise<{ updatedCount: number }> {
  if (args.notificationIds.length === 0) {
    return { updatedCount: 0 };
  }
  const result = await prisma.notification.updateMany({
    where: {
      recipientMembershipId: args.recipientMembershipId,
      id: { in: args.notificationIds },
      readAt: null
    },
    data: { readAt: new Date() }
  });
  return { updatedCount: result.count };
}

export async function markAllRead(
  prisma: PrismaClient,
  recipientMembershipId: string
): Promise<{ updatedCount: number }> {
  const result = await prisma.notification.updateMany({
    where: { recipientMembershipId, readAt: null },
    data: { readAt: new Date() }
  });
  return { updatedCount: result.count };
}
