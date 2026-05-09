import { describe, expect, it, vi } from "vitest";
import {
  CLUSTER_WINDOW_MS,
  createOrClusterNotification,
  listNotifications,
  markAllRead,
  markRead,
  unreadCount
} from "../../src/patron/notification-service.js";

function record(over: Record<string, unknown> = {}) {
  return {
    id: "n1",
    recipientMembershipId: "m1",
    relayCreatorId: "c1",
    kind: "comment_liked" as const,
    payloadJson: { foo: "bar" },
    clusterKey: null,
    clusterCount: 1,
    sourceEventId: "ev1",
    readAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over
  };
}

describe("createOrClusterNotification", () => {
  it("creates a new row when no clusterKey is provided", async () => {
    const create = vi.fn().mockResolvedValue(record());
    const findFirst = vi.fn();
    const update = vi.fn();
    const prisma = {
      notification: { create, findFirst, update }
    } as never;
    const out = await createOrClusterNotification(prisma, {
      recipientMembershipId: "m1",
      kind: "tier_changed",
      payload: { x: 1 }
    });
    expect(out.id).toBe("n1");
    expect(create).toHaveBeenCalledOnce();
    // No clusterKey -> findFirst is never queried.
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("creates a new row when clusterKey is provided but no recent unread match exists", async () => {
    const create = vi.fn().mockResolvedValue(record({ clusterKey: "k1" }));
    const findFirst = vi.fn().mockResolvedValue(null);
    const update = vi.fn();
    const prisma = {
      notification: { create, findFirst, update }
    } as never;
    await createOrClusterNotification(prisma, {
      recipientMembershipId: "m1",
      kind: "comment_liked",
      payload: { x: 1 },
      clusterKey: "k1"
    });
    expect(findFirst).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
    // Cluster window must be respected -- the lookup uses createdAt >= now-CLUSTER_WINDOW_MS.
    const where = findFirst.mock.calls[0][0].where;
    expect(where.clusterKey).toBe("k1");
    expect(where.readAt).toBeNull();
    expect(where.createdAt.gte).toBeInstanceOf(Date);
    const ageMs = Date.now() - (where.createdAt.gte as Date).getTime();
    expect(ageMs).toBeGreaterThanOrEqual(CLUSTER_WINDOW_MS - 100);
    expect(ageMs).toBeLessThanOrEqual(CLUSTER_WINDOW_MS + 100);
  });

  it("clusters into the existing unread row when one matches", async () => {
    const existing = record({ id: "existing-id", clusterKey: "k1", clusterCount: 1 });
    const create = vi.fn();
    const findFirst = vi.fn().mockResolvedValue(existing);
    const update = vi.fn().mockResolvedValue({ ...existing, clusterCount: 2 });
    const prisma = {
      notification: { create, findFirst, update }
    } as never;
    const out = await createOrClusterNotification(prisma, {
      recipientMembershipId: "m1",
      kind: "comment_liked",
      payload: { x: 2 },
      clusterKey: "k1",
      sourceEventId: "ev2"
    });
    expect(out.id).toBe("existing-id");
    expect(out.clusterCount).toBe(2);
    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: "existing-id" },
      data: {
        payloadJson: { x: 2 },
        clusterCount: { increment: 1 },
        sourceEventId: "ev2"
      }
    });
  });

  it("returns existing row on unique violation for non-clustered + sourceEventId (P2002)", async () => {
    const existing = record({ id: "n-winner", sourceEventId: "outbox-row-1" });
    const create = vi.fn().mockRejectedValue({ code: "P2002" });
    const findFirst = vi.fn().mockResolvedValue(existing);
    const prisma = {
      notification: { create, findFirst, update: vi.fn() }
    } as never;
    const out = await createOrClusterNotification(prisma, {
      recipientMembershipId: "m1",
      kind: "tier_changed",
      payload: { x: 1 },
      clusterKey: null,
      sourceEventId: "outbox-row-1"
    });
    expect(out.id).toBe("n-winner");
    expect(create).toHaveBeenCalledOnce();
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        sourceEventId: "outbox-row-1",
        recipientMembershipId: "m1",
        clusterKey: null
      }
    });
  });

  it("rethrows P2002 when no matching row (unexpected constraint target)", async () => {
    const create = vi.fn().mockRejectedValue({ code: "P2002" });
    const findFirst = vi.fn().mockResolvedValue(null);
    const prisma = {
      notification: { create, findFirst, update: vi.fn() }
    } as never;
    await expect(
      createOrClusterNotification(prisma, {
        recipientMembershipId: "m1",
        kind: "tier_changed",
        payload: {},
        sourceEventId: "src1"
      })
    ).rejects.toEqual({ code: "P2002" });
  });
});

describe("listNotifications + markRead + markAllRead + unreadCount", () => {
  it("listNotifications applies unreadOnly filter and clamps limit", async () => {
    const findMany = vi.fn().mockResolvedValue([record(), record({ id: "n2" })]);
    const prisma = { notification: { findMany } } as never;
    await listNotifications(prisma, {
      recipientMembershipId: "m1",
      unreadOnly: true,
      limit: 1000
    });
    const args = findMany.mock.calls[0][0];
    expect(args.where).toEqual({ recipientMembershipId: "m1", readAt: null });
    expect(args.take).toBe(101); // MAX_LIMIT (100) + 1 for next-cursor lookahead
  });

  it("listNotifications returns nextCursor when result exceeds limit", async () => {
    const rows = [record({ id: "a" }), record({ id: "b" }), record({ id: "c" })];
    const findMany = vi.fn().mockResolvedValue(rows);
    const prisma = { notification: { findMany } } as never;
    const out = await listNotifications(prisma, {
      recipientMembershipId: "m1",
      limit: 2
    });
    expect(out.items).toHaveLength(2);
    expect(out.nextCursor).toBe("c");
  });

  it("markRead is a no-op when no ids are provided", async () => {
    const updateMany = vi.fn();
    const prisma = { notification: { updateMany } } as never;
    const out = await markRead(prisma, { recipientMembershipId: "m1", notificationIds: [] });
    expect(out).toEqual({ updatedCount: 0 });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("markRead scopes the updateMany to the recipient + only-unread", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const prisma = { notification: { updateMany } } as never;
    const out = await markRead(prisma, {
      recipientMembershipId: "m1",
      notificationIds: ["a", "b"]
    });
    expect(out.updatedCount).toBe(2);
    const args = updateMany.mock.calls[0][0];
    expect(args.where).toEqual({
      recipientMembershipId: "m1",
      id: { in: ["a", "b"] },
      readAt: null
    });
    expect(args.data.readAt).toBeInstanceOf(Date);
  });

  it("markAllRead writes readAt for all recipient unread rows", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 5 });
    const prisma = { notification: { updateMany } } as never;
    const out = await markAllRead(prisma, "m1");
    expect(out.updatedCount).toBe(5);
    expect(updateMany.mock.calls[0][0].where).toEqual({
      recipientMembershipId: "m1",
      readAt: null
    });
  });

  it("unreadCount queries notifications with readAt: null for the recipient", async () => {
    const count = vi.fn().mockResolvedValue(7);
    const prisma = { notification: { count } } as never;
    expect(await unreadCount(prisma, "m1")).toBe(7);
    expect(count.mock.calls[0][0].where).toEqual({
      recipientMembershipId: "m1",
      readAt: null
    });
  });
});
