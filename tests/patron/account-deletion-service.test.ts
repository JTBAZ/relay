import { describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_DELETION_CANCELLED_EVENT,
  ACCOUNT_DELETION_EXECUTED_EVENT,
  ACCOUNT_DELETION_REQUESTED_EVENT,
  cancelDeletion,
  executeDeletion,
  getPendingDeletion,
  listDueDeletions,
  requestDeletion
} from "../../src/patron/account-deletion-service.js";

function pendingRow(over: Record<string, unknown> = {}) {
  return {
    id: "del1",
    accountId: "acc1",
    status: "pending" as const,
    requestedAt: new Date("2026-04-22T00:00:00Z"),
    scheduledFor: new Date("2026-04-29T00:00:00Z"),
    executedAt: null,
    cancelledAt: null,
    reason: null,
    ...over
  };
}

function buildPrismaStub(overrides: Record<string, unknown> = {}) {
  return {
    accountDeletion: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      ...((overrides.accountDeletion as Record<string, unknown>) ?? {})
    },
    outboxEvent: {
      create: vi.fn().mockResolvedValue({ id: "ev1" })
    },
    tenantMembership: {
      findMany: vi.fn().mockResolvedValue([])
    },
    patronFavorite: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    patronSavedCollectionEntry: { count: vi.fn().mockResolvedValue(0) },
    patronSavedCollection: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    comment: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    commentReaction: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    contentReport: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    moderationAction: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    accountBlock: { count: vi.fn().mockResolvedValue(0) },
    accountFollow: { count: vi.fn().mockResolvedValue(0) },
    account: { delete: vi.fn().mockResolvedValue(null) },
    $transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb({} as never)
  };
}

describe("requestDeletion", () => {
  it("creates a pending row with default 7-day grace and emits the requested event", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const create = vi
      .fn()
      .mockImplementation(async (args: { data: Record<string, unknown> }) =>
        pendingRow({
          accountId: args.data.accountId as string,
          scheduledFor: args.data.scheduledFor as Date
        })
      );
    const outboxCreate = vi.fn().mockResolvedValue({ id: "ev1" });
    const prisma = {
      accountDeletion: { findFirst, create },
      outboxEvent: { create: outboxCreate }
    } as never;
    const t0 = Date.now();
    const out = await requestDeletion(prisma, { accountId: "acc1" });
    expect(out.created).toBe(true);
    expect(out.record.accountId).toBe("acc1");
    expect(out.record.status).toBe("pending");
    // Default grace = 7 days; allow a small slack window for test wall-clock drift.
    const sched = out.record.scheduledFor.getTime();
    const expected = t0 + 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(sched - expected)).toBeLessThan(5_000);
    expect(outboxCreate).toHaveBeenCalledOnce();
    expect(outboxCreate.mock.calls[0][0].data.eventName).toBe(ACCOUNT_DELETION_REQUESTED_EVENT);
  });

  it("is idempotent -- returns the existing pending row without re-emitting the event", async () => {
    const existing = pendingRow();
    const findFirst = vi.fn().mockResolvedValue(existing);
    const create = vi.fn();
    const outboxCreate = vi.fn();
    const prisma = {
      accountDeletion: { findFirst, create },
      outboxEvent: { create: outboxCreate }
    } as never;
    const out = await requestDeletion(prisma, { accountId: "acc1" });
    expect(out.created).toBe(false);
    expect(out.record.id).toBe(existing.id);
    expect(create).not.toHaveBeenCalled();
    expect(outboxCreate).not.toHaveBeenCalled();
  });

  it("honors the graceDays override", async () => {
    const create = vi
      .fn()
      .mockImplementation(async (args: { data: Record<string, unknown> }) =>
        pendingRow({ scheduledFor: args.data.scheduledFor as Date })
      );
    const prisma = {
      accountDeletion: { findFirst: vi.fn().mockResolvedValue(null), create },
      outboxEvent: { create: vi.fn().mockResolvedValue({ id: "ev1" }) }
    } as never;
    const t0 = Date.now();
    const out = await requestDeletion(prisma, { accountId: "acc1", graceDays: 1 });
    const sched = out.record.scheduledFor.getTime();
    const expected = t0 + 1 * 24 * 60 * 60 * 1000;
    expect(Math.abs(sched - expected)).toBeLessThan(5_000);
  });
});

describe("cancelDeletion", () => {
  it("returns null when no pending row exists", async () => {
    const prisma = {
      accountDeletion: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn()
      },
      outboxEvent: { create: vi.fn() }
    } as never;
    expect(await cancelDeletion(prisma, "acc1")).toBeNull();
  });

  it("flips status to cancelled and emits the cancelled event", async () => {
    const existing = pendingRow();
    const update = vi
      .fn()
      .mockResolvedValue({ ...existing, status: "cancelled", cancelledAt: new Date() });
    const outboxCreate = vi.fn().mockResolvedValue({ id: "ev1" });
    const prisma = {
      accountDeletion: { findFirst: vi.fn().mockResolvedValue(existing), update },
      outboxEvent: { create: outboxCreate }
    } as never;
    const out = await cancelDeletion(prisma, "acc1");
    expect(out?.status).toBe("cancelled");
    expect(out?.cancelledAt).toBeInstanceOf(Date);
    expect(outboxCreate.mock.calls[0][0].data.eventName).toBe(ACCOUNT_DELETION_CANCELLED_EVENT);
  });
});

describe("executeDeletion", () => {
  it("returns null when the deletion row doesn't exist", async () => {
    const prisma = buildPrismaStub({
      accountDeletion: { findUnique: vi.fn().mockResolvedValue(null) }
    });
    expect(await executeDeletion(prisma as never, "missing")).toBeNull();
  });

  it("returns the existing record + zero counts when status is not pending (idempotent)", async () => {
    const cancelled = pendingRow({ status: "cancelled", cancelledAt: new Date() });
    const prisma = buildPrismaStub({
      accountDeletion: { findUnique: vi.fn().mockResolvedValue(cancelled) }
    });
    const out = await executeDeletion(prisma as never, "del1");
    expect(out?.record.status).toBe("cancelled");
    expect(out?.counts.memberships).toBe(0);
    expect(out?.counts.favorites).toBe(0);
  });

  it("runs the soft-FK purge + Account delete + status flip + outbox emit on a pending row", async () => {
    const pending = pendingRow();
    const updateAccountDeletion = vi
      .fn()
      .mockResolvedValue({ ...pending, status: "executed", executedAt: new Date() });
    const accountDelete = vi.fn().mockResolvedValue(null);
    const favRes = vi.fn().mockResolvedValue({ count: 3 });
    const colRes = vi.fn().mockResolvedValue({ count: 2 });
    const entryCount = vi.fn().mockResolvedValue(7);
    const cmtRes = vi.fn().mockResolvedValue({ count: 4 });
    const reactRes = vi.fn().mockResolvedValue({ count: 8 });
    const reportRes = vi.fn().mockResolvedValue({ count: 1 });
    const modUpdate = vi.fn().mockResolvedValue({ count: 0 });
    const blockCount = vi.fn().mockResolvedValue(2);
    const followCount = vi.fn().mockResolvedValue(5);
    const memberships = [{ id: "m1" }, { id: "m2" }];
    const outboxCreate = vi.fn().mockResolvedValue({ id: "ev1" });

    const prisma = {
      accountDeletion: {
        findUnique: vi.fn().mockResolvedValue(pending),
        update: updateAccountDeletion
      },
      tenantMembership: { findMany: vi.fn().mockResolvedValue(memberships) },
      patronFavorite: { deleteMany: favRes },
      patronSavedCollectionEntry: { count: entryCount },
      patronSavedCollection: { deleteMany: colRes },
      comment: { deleteMany: cmtRes },
      commentReaction: { deleteMany: reactRes },
      contentReport: { deleteMany: reportRes },
      moderationAction: { updateMany: modUpdate },
      accountBlock: { count: blockCount },
      accountFollow: { count: followCount },
      account: { delete: accountDelete },
      outboxEvent: { create: outboxCreate },
      $transaction: async (cb: (tx: unknown) => Promise<unknown>) =>
        cb({
          tenantMembership: { findMany: vi.fn().mockResolvedValue(memberships) },
          patronFavorite: { deleteMany: favRes },
          patronSavedCollectionEntry: { count: entryCount },
          patronSavedCollection: { deleteMany: colRes },
          comment: { deleteMany: cmtRes },
          commentReaction: { deleteMany: reactRes },
          contentReport: { deleteMany: reportRes },
          moderationAction: { updateMany: modUpdate },
          accountBlock: { count: blockCount },
          accountFollow: { count: followCount },
          account: { delete: accountDelete },
          accountDeletion: { update: updateAccountDeletion }
        })
    } as never;

    const out = await executeDeletion(prisma, "del1");
    expect(out?.record.status).toBe("executed");
    expect(accountDelete).toHaveBeenCalledWith({ where: { id: "acc1" } });
    expect(out?.counts).toEqual({
      favorites: 3,
      collections: 2,
      collectionEntries: 7,
      comments: 4,
      commentReactions: 8,
      contentReports: 1,
      moderationActionsAuthored: 0,
      accountBlocks: 2,
      accountFollows: 5,
      memberships: 2
    });
    expect(outboxCreate).toHaveBeenCalledOnce();
    expect(outboxCreate.mock.calls[0][0].data.eventName).toBe(ACCOUNT_DELETION_EXECUTED_EVENT);
  });
});

describe("listDueDeletions", () => {
  it("queries for status=pending AND scheduledFor<=now", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "x", accountId: "acc-x" }]);
    const prisma = { accountDeletion: { findMany } } as never;
    const fixedNow = new Date("2026-04-30T00:00:00Z");
    const out = await listDueDeletions(prisma, { now: fixedNow, limit: 10 });
    expect(out).toHaveLength(1);
    const args = findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      status: "pending",
      scheduledFor: { lte: fixedNow }
    });
    expect(args.take).toBe(10);
  });
});

describe("getPendingDeletion", () => {
  it("scopes the lookup to status=pending", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const prisma = { accountDeletion: { findFirst } } as never;
    await getPendingDeletion(prisma, "acc1");
    expect(findFirst.mock.calls[0][0].where).toEqual({
      accountId: "acc1",
      status: "pending"
    });
  });
});
