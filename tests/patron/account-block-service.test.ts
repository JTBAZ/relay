import { describe, expect, it, vi } from "vitest";
import {
  blockAccount,
  loadBlocksFor,
  unblockAccount
} from "../../src/patron/account-block-service.js";

describe("blockAccount", () => {
  it("returns created:false when blocker == blocked", async () => {
    const out = await blockAccount({} as never, {
      blockerAccountId: "a",
      blockedAccountId: "a"
    });
    expect(out).toEqual({ created: false });
  });

  it("returns created:false when block already exists", async () => {
    const prisma = {
      accountBlock: {
        findUnique: vi.fn().mockResolvedValue({ id: "edge1" }),
        create: vi.fn()
      },
      moderationAction: { create: vi.fn() }
    } as never;
    const out = await blockAccount(prisma, {
      blockerAccountId: "a",
      blockedAccountId: "b"
    });
    expect(out).toEqual({ created: false });
    expect((prisma as any).accountBlock.create).not.toHaveBeenCalled();
  });

  it("creates block + logs ModerationAction on first block", async () => {
    const create = vi.fn();
    const modCreate = vi.fn().mockResolvedValue({ id: "modA" });
    const prisma = {
      accountBlock: {
        findUnique: vi.fn().mockResolvedValue(null),
        create
      },
      moderationAction: { create: modCreate }
    } as never;
    const out = await blockAccount(prisma, {
      blockerAccountId: "a",
      blockedAccountId: "b"
    });
    expect(out).toEqual({ created: true });
    expect(create).toHaveBeenCalledWith({
      data: { blockerAccountId: "a", blockedAccountId: "b" }
    });
    expect(modCreate).toHaveBeenCalled();
    const args = modCreate.mock.calls[0][0];
    expect(args.data.kind).toBe("account_block");
    expect(args.data.targetKind).toBe("account");
    expect(args.data.targetId).toBe("b");
  });
});

describe("unblockAccount", () => {
  it("returns removed:false when no edge exists", async () => {
    const prisma = {
      accountBlock: {
        findUnique: vi.fn().mockResolvedValue(null),
        delete: vi.fn()
      },
      moderationAction: { create: vi.fn() }
    } as never;
    const out = await unblockAccount(prisma, {
      blockerAccountId: "a",
      blockedAccountId: "b"
    });
    expect(out).toEqual({ removed: false });
  });

  it("deletes edge and logs unblock action", async () => {
    const del = vi.fn();
    const modCreate = vi.fn().mockResolvedValue({ id: "mod" });
    const prisma = {
      accountBlock: {
        findUnique: vi.fn().mockResolvedValue({ id: "edge1" }),
        delete: del
      },
      moderationAction: { create: modCreate }
    } as never;
    const out = await unblockAccount(prisma, {
      blockerAccountId: "a",
      blockedAccountId: "b"
    });
    expect(out).toEqual({ removed: true });
    expect(del).toHaveBeenCalledWith({ where: { id: "edge1" } });
    expect(modCreate.mock.calls[0][0].data.kind).toBe("account_unblock");
  });
});

describe("loadBlocksFor", () => {
  it("returns block edges with timestamps for downstream future-only filtering", async () => {
    const now = new Date();
    const findMany = vi
      .fn()
      .mockResolvedValue([{ blockedAccountId: "b", createdAt: now }]);
    const prisma = { accountBlock: { findMany } } as never;
    const out = await loadBlocksFor(prisma, "a");
    expect(out).toEqual([{ blockedAccountId: "b", createdAt: now }]);
    expect(findMany).toHaveBeenCalledWith({
      where: { blockerAccountId: "a" },
      select: { blockedAccountId: true, createdAt: true }
    });
  });
});
