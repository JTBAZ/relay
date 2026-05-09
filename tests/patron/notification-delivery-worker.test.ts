import { describe, expect, it, vi } from "vitest";
import {
  InProcessNotificationDeliveryRunner,
  notificationDeliveryRepeatEveryMsFromEnv,
  processNotificationOutboxOnce
} from "../../src/patron/notification-delivery-worker.js";
import { PEG_EVENT_NAMES } from "../../src/patron/notification-mapper.js";

/**
 * The worker's `processOnce` glues together: cursor read -> outbox findMany -> mapper ->
 * createOrCluster -> cursor write. We assert the orchestration without spinning up Postgres.
 */

interface OutboxRow {
  id: string;
  eventId: string;
  eventName: string;
  tenantId: string;
  primaryId: string;
  occurredAt: Date;
  payload: unknown;
}

function buildPrismaStub(rows: OutboxRow[], existingNotifications: unknown[] = []) {
  const findManyOutbox = vi.fn().mockResolvedValue(rows);
  const findFirstOutbox = vi.fn().mockResolvedValue(null);
  const findFirstNotification = vi.fn().mockResolvedValue(null); // no clustering
  const findFirstSourceMatch = vi.fn().mockResolvedValue(null); // not yet delivered
  const createNotification = vi.fn().mockImplementation(async (args: { data: unknown }) => ({
    id: `n-${Math.random().toString(36).slice(2, 8)}`,
    ...(args.data as Record<string, unknown>),
    payloadJson: (args.data as Record<string, unknown>).payloadJson,
    clusterCount: 1,
    readAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  }));
  const cursorUpsert = vi.fn();
  const cursorFindUnique = vi
    .fn()
    .mockResolvedValue({ lastOccurredAt: new Date(0), lastEventId: null });
  const cursorUpdate = vi.fn();
  const findUniqueComment = vi.fn();
  const findManyMembership = vi.fn();

  // notification.findFirst is called by both clustering AND the alreadyDelivered check; the
  // worker uses it to dedupe non-clustered (sourceEventId) writes. Use a single mock that
  // returns null -- there's nothing pre-existing in this test.
  const notificationFindFirst = vi.fn().mockImplementation(async (args: { where: Record<string, unknown> }) => {
    if ("sourceEventId" in args.where) return findFirstSourceMatch(args);
    return findFirstNotification(args);
  });

  const prisma = {
    outboxEvent: { findMany: findManyOutbox, findFirst: findFirstOutbox },
    notification: {
      create: createNotification,
      findFirst: notificationFindFirst,
      update: vi.fn()
    },
    notificationDeliveryCursor: {
      upsert: cursorUpsert,
      findUnique: cursorFindUnique,
      update: cursorUpdate
    },
    comment: { findUnique: findUniqueComment },
    tenantMembership: { findMany: findManyMembership },
    notificationPreference: { findUnique: vi.fn().mockResolvedValue(null) }
  };
  return {
    prisma,
    findManyOutbox,
    findFirstOutbox,
    createNotification,
    cursorUpdate,
    findUniqueComment,
    findManyMembership
  };
}

describe("InProcessNotificationDeliveryRunner.processOnce", () => {
  it("returns zero stats and does not write the cursor when no events are pending", async () => {
    const stubs = buildPrismaStub([]);
    const runner = new InProcessNotificationDeliveryRunner({
      prisma: stubs.prisma as never,
      pollIntervalMs: 1_000_000 // never fires; we drive processOnce manually
    });
    const stats = await runner.processOnce();
    expect(stats).toEqual({ scanned: 0, written: 0, cursorAdvancedTo: null });
    expect(stubs.cursorUpdate).not.toHaveBeenCalled();
  });

  it("writes a notification per tier_changed event and advances the cursor to the latest", async () => {
    const t1 = new Date("2026-04-22T10:00:00Z");
    const t2 = new Date("2026-04-22T10:00:01Z");
    const rows: OutboxRow[] = [
      {
        id: "row1",
        eventId: "ev1",
        eventName: PEG_EVENT_NAMES.TIER_CHANGED,
        tenantId: "creator-1",
        primaryId: "membership-A",
        occurredAt: t1,
        payload: { prior_tier_ids: [], next_tier_ids: ["t1"], next_active: true }
      },
      {
        id: "row2",
        eventId: "ev2",
        eventName: PEG_EVENT_NAMES.TIER_CHANGED,
        tenantId: "creator-1",
        primaryId: "membership-B",
        occurredAt: t2,
        payload: { prior_tier_ids: ["t1"], next_tier_ids: [], next_active: false }
      }
    ];
    const stubs = buildPrismaStub(rows);
    const runner = new InProcessNotificationDeliveryRunner({
      prisma: stubs.prisma as never,
      pollIntervalMs: 1_000_000
    });
    const stats = await runner.processOnce();
    expect(stats.scanned).toBe(2);
    expect(stats.written).toBe(2);
    expect(stats.cursorAdvancedTo).toEqual(t2);
    expect(stubs.createNotification).toHaveBeenCalledTimes(2);
    expect(stubs.cursorUpdate).toHaveBeenCalledOnce();
    expect(stubs.cursorUpdate.mock.calls[0][0].data).toEqual({
      lastOccurredAt: t2,
      lastEventId: "ev2"
    });
  });

  it("continues processing the batch when one event throws (no whole-batch stall)", async () => {
    const rows: OutboxRow[] = [
      {
        id: "row-good",
        eventId: "ev-good",
        eventName: PEG_EVENT_NAMES.TIER_CHANGED,
        tenantId: "c",
        primaryId: "m",
        occurredAt: new Date(),
        payload: {}
      },
      {
        id: "row-bad",
        eventId: "ev-bad",
        eventName: PEG_EVENT_NAMES.COMMENT_REACTION_ADDED,
        tenantId: "c",
        primaryId: "cmt",
        occurredAt: new Date(),
        payload: { comment_id: "cmt", account_id: "acc", kind: "like" }
      }
    ];
    const stubs = buildPrismaStub(rows);
    // Force the COMMENT_REACTION_ADDED branch to throw by making comment.findUnique reject.
    stubs.findUniqueComment.mockRejectedValue(new Error("simulated db blip"));
    const log = vi.fn();
    const runner = new InProcessNotificationDeliveryRunner({
      prisma: stubs.prisma as never,
      pollIntervalMs: 1_000_000,
      log
    });
    const stats = await runner.processOnce();
    expect(stats.scanned).toBe(2);
    expect(stats.written).toBe(1); // only the tier_changed succeeded
    expect(log).toHaveBeenCalledWith(
      "notification-delivery: event failed",
      expect.objectContaining({ eventId: "ev-bad" })
    );
    // Cursor still advances past the failed row so we don't get stuck on it forever.
    expect(stubs.cursorUpdate).toHaveBeenCalledOnce();
  });

  it("forwards the cursor to the outbox query so old events aren't re-scanned", async () => {
    const stubs = buildPrismaStub([]);
    stubs.prisma.notificationDeliveryCursor.findUnique = vi.fn().mockResolvedValue({
      lastOccurredAt: new Date("2026-04-22T09:00:00Z"),
      lastEventId: "ev-prev"
    });
    const runner = new InProcessNotificationDeliveryRunner({
      prisma: stubs.prisma as never,
      pollIntervalMs: 1_000_000
    });
    await runner.processOnce();
    const where = stubs.findManyOutbox.mock.calls[0][0].where;
    // Either the gt-on-occurredAt branch or the tie-breaker on eventId branch must be present.
    const orBranches = (where.OR as Array<Record<string, unknown>>) ?? [];
    const hasGtBranch = orBranches.some(
      (b) => "occurredAt" in b && (b.occurredAt as { gt?: unknown })?.gt !== undefined
    );
    const hasTieBreaker = orBranches.some(
      (b) => "eventId" in b && (b.eventId as { gt?: unknown })?.gt === "ev-prev"
    );
    expect(hasGtBranch).toBe(true);
    expect(hasTieBreaker).toBe(true);
  });
});

describe("notificationDeliveryRepeatEveryMsFromEnv", () => {
  it("returns null when disabled with 0", () => {
    expect(
      notificationDeliveryRepeatEveryMsFromEnv({
        RELAY_NOTIFICATION_DELIVERY_MS: "0"
      })
    ).toBe(null);
  });

  it("applies poll floor like in-process runner", () => {
    expect(
      notificationDeliveryRepeatEveryMsFromEnv({
        RELAY_NOTIFICATION_DELIVERY_MS: "100"
      })
    ).toBe(250);
  });
});

describe("processNotificationOutboxOnce", () => {
  it("idempotent with empty outbox (zero stats, no cursor update)", async () => {
    const stubs = buildPrismaStub([]);
    const a = await processNotificationOutboxOnce(stubs.prisma as never);
    const b = await processNotificationOutboxOnce(stubs.prisma as never);
    expect(a).toEqual({ scanned: 0, written: 0, cursorAdvancedTo: null });
    expect(b).toEqual(a);
    expect(stubs.cursorUpdate).not.toHaveBeenCalled();
    expect(stubs.findManyOutbox).toHaveBeenCalledTimes(2);
  });
});
