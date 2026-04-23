import { describe, expect, it, vi } from "vitest";
import { PublicSlugSource, type PrismaClient } from "@prisma/client";
import { provisionCreatorWorkspace } from "../src/creator/provision-creator-workspace.js";

describe("provisionCreatorWorkspace (MT-032)", () => {
  it("returns existing relay_creator_id without starting a transaction when already set", async () => {
    const prisma = {
      account: {
        findUnique: vi.fn().mockResolvedValue({
          id: "acc_1",
          primaryRelayCreatorId: "cr_already",
          emailNorm: "a@b.com"
        })
      },
      creatorProfile: {
        findFirst: vi.fn().mockResolvedValue({ publicSlug: "existing-slug" })
      },
      $transaction: vi.fn()
    } as unknown as PrismaClient;

    const r = await provisionCreatorWorkspace(prisma, "acc_1");
    expect(r).toEqual({
      relay_creator_id: "cr_already",
      account_id: "acc_1",
      created: false,
      public_slug: "existing-slug"
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("creates tenant, user, profile, and account link on first run", async () => {
    const tenantCreate = vi.fn().mockImplementation(async (args: { data: { relayCreatorId: string } }) => ({
      id: "ten_1",
      relayCreatorId: args.data.relayCreatorId
    }));
    const userCreate = vi.fn().mockResolvedValue({ id: "usr_1" });
    const profileCreate = vi.fn().mockResolvedValue({});
    const accountUpdate = vi.fn().mockResolvedValue({});

    const prisma = {
      account: {
        findUnique: vi.fn().mockResolvedValue({
          id: "acc_1",
          primaryRelayCreatorId: null,
          emailNorm: "artist@example.com"
        })
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          account: {
            findUnique: vi.fn().mockResolvedValue({
              id: "acc_1",
              primaryRelayCreatorId: null,
              emailNorm: "artist@example.com"
            }),
            update: accountUpdate
          },
          tenant: { create: tenantCreate },
          user: { create: userCreate },
          creatorProfile: {
            create: profileCreate,
            findUnique: vi.fn().mockResolvedValue(null)
          }
        };
        return fn(tx);
      })
    } as unknown as PrismaClient;

    const r = await provisionCreatorWorkspace(prisma, "acc_1");
    expect(r.created).toBe(true);
    expect(r.account_id).toBe("acc_1");
    expect(r.relay_creator_id).toMatch(/^cr_[a-f0-9]{32}$/);
    expect(r.public_slug).toBe("studio");
    expect(tenantCreate).toHaveBeenCalledWith({
      data: { relayCreatorId: r.relay_creator_id }
    });
    expect(userCreate).toHaveBeenCalled();
    expect(profileCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        publicSlug: "studio",
        slugSource: PublicSlugSource.allocated
      })
    });
    expect(accountUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "acc_1" },
        data: { primaryRelayCreatorId: r.relay_creator_id }
      })
    );
  });

  it("throws when account id does not exist", async () => {
    const prisma = {
      account: {
        findUnique: vi.fn().mockResolvedValue(null)
      }
    } as unknown as PrismaClient;
    await expect(provisionCreatorWorkspace(prisma, "missing")).rejects.toThrow("Account not found");
  });
});
