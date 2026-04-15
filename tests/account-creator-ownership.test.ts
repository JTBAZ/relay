import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { accountOwnsRelayCreatorId } from "../src/identity/account-creator-ownership.js";

describe("accountOwnsRelayCreatorId (MT-034)", () => {
  it("returns false when primaryRelayCreatorId is null", async () => {
    const prisma = {
      account: {
        findUnique: vi.fn().mockResolvedValue({
          primaryRelayCreatorId: null
        })
      }
    } as unknown as PrismaClient;
    await expect(accountOwnsRelayCreatorId(prisma, "acc1", "cr_abc")).resolves.toBe(false);
  });

  it("returns false when creator id does not match", async () => {
    const prisma = {
      account: {
        findUnique: vi.fn().mockResolvedValue({
          primaryRelayCreatorId: "cr_mine"
        })
      }
    } as unknown as PrismaClient;
    await expect(accountOwnsRelayCreatorId(prisma, "acc1", "cr_other")).resolves.toBe(false);
  });

  it("returns true when primaryRelayCreatorId matches (trimmed)", async () => {
    const prisma = {
      account: {
        findUnique: vi.fn().mockResolvedValue({
          primaryRelayCreatorId: "cr_mine"
        })
      }
    } as unknown as PrismaClient;
    await expect(accountOwnsRelayCreatorId(prisma, "acc1", "  cr_mine  ")).resolves.toBe(true);
  });

  it("returns false for empty creator id", async () => {
    const prisma = {
      account: { findUnique: vi.fn() }
    } as unknown as PrismaClient;
    await expect(accountOwnsRelayCreatorId(prisma, "acc1", "   ")).resolves.toBe(false);
    expect(prisma.account.findUnique).not.toHaveBeenCalled();
  });
});
