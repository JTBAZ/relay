import { describe, expect, it, vi } from "vitest";
import {
  addAccountFollowForAccount,
  listAccountFollowsForAccount,
  removeAccountFollowForAccount
} from "../../src/patron/account-follow-service.js";

describe("addAccountFollowForAccount", () => {
  it("returns null when follower equals followed", async () => {
    const prisma = {} as never;
    expect(await addAccountFollowForAccount(prisma, "a", "a")).toBeNull();
  });

  it("returns null when followed account missing", async () => {
    const findUnique = vi.fn().mockResolvedValueOnce(null);
    const prisma = { account: { findUnique } };
    expect(await addAccountFollowForAccount(prisma as never, "a", "b")).toBeNull();
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "b" },
      select: { id: true }
    });
  });

  it("returns created:false when already following", async () => {
    const existing = { createdAt: new Date("2020-01-01T00:00:00.000Z") };
    const findUniqueAccount = vi.fn().mockResolvedValue({ id: "b" });
    const findUniqueFollow = vi.fn().mockResolvedValueOnce(existing);
    const prisma = {
      account: { findUnique: findUniqueAccount },
      accountFollow: { findUnique: findUniqueFollow, create: vi.fn() }
    };
    const out = await addAccountFollowForAccount(prisma as never, "a", "b");
    expect(out).toEqual({
      followed_account_id: "b",
      created: false,
      created_at: existing.createdAt.toISOString()
    });
    expect(prisma.accountFollow.create).not.toHaveBeenCalled();
  });

  it("creates row when new", async () => {
    const createdAt = new Date("2021-06-15T12:00:00.000Z");
    const findUniqueAccount = vi.fn().mockResolvedValue({ id: "b" });
    const findUniqueFollow = vi.fn().mockResolvedValueOnce(null);
    const create = vi.fn().mockResolvedValue({
      followedAccountId: "b",
      createdAt
    });
    const prisma = {
      account: { findUnique: findUniqueAccount },
      accountFollow: { findUnique: findUniqueFollow, create }
    };
    const out = await addAccountFollowForAccount(prisma as never, "a", "b");
    expect(out).toEqual({
      followed_account_id: "b",
      created: true,
      created_at: createdAt.toISOString()
    });
    expect(create).toHaveBeenCalledWith({
      data: { followerAccountId: "a", followedAccountId: "b" }
    });
  });
});

describe("listAccountFollowsForAccount", () => {
  it("maps rows to API shape", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { followedAccountId: "x", createdAt: new Date("2020-01-01T00:00:00.000Z") }
    ]);
    const prisma = { accountFollow: { findMany } };
    const items = await listAccountFollowsForAccount(prisma as never, "a");
    expect(items).toEqual([
      { followed_account_id: "x", created_at: "2020-01-01T00:00:00.000Z" }
    ]);
  });
});

describe("removeAccountFollowForAccount", () => {
  it("returns false when nothing deleted", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = { accountFollow: { deleteMany } };
    expect(await removeAccountFollowForAccount(prisma as never, "a", "b")).toBe(false);
  });

  it("returns true when deleted", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = { accountFollow: { deleteMany } };
    expect(await removeAccountFollowForAccount(prisma as never, "a", "b")).toBe(true);
  });
});
