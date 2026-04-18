import type { PrismaClient } from "@prisma/client";
import type { Request } from "express";
import { describe, expect, it, vi } from "vitest";
import type { IdentityService } from "../../src/identity/identity-service.js";
import {
  loadAccountContextForSession,
  requireAccount,
  requireAccountWithRole,
  sendRelayAuthError
} from "../../src/identity/require-account.js";
import { RelayAuthError } from "../../src/identity/relay-auth-error.js";
import type { SessionToken } from "../../src/identity/types.js";

function mockReq(cookie?: string, bearer?: string): Request {
  const headers: Record<string, string> = {};
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  return {
    headers,
    header(name: string) {
      return headers[name.toLowerCase()] ?? headers[name];
    }
  } as unknown as Request;
}

describe("require-account", () => {
  const session: SessionToken = {
    token: "sess_x",
    user_id: "tm_1",
    creator_id: "cr_1",
    tier_ids: [],
    expires_at: "2099-01-01T00:00:00.000Z"
  };

  it("requireAccount returns 401 when no cookie and no Bearer", async () => {
    const req = mockReq();
    const identityService = {
      resolveSession: vi.fn()
    } as unknown as IdentityService;
    const prisma = {} as PrismaClient;
    await expect(requireAccount(req, { prisma, identityService })).rejects.toMatchObject({
      code: "AUTH_ERROR",
      status: 401
    });
    expect(identityService.resolveSession).not.toHaveBeenCalled();
  });

  it("requireAccount returns 401 when token is invalid", async () => {
    const req = mockReq(undefined, "bad");
    const identityService = {
      resolveSession: vi.fn().mockResolvedValue(null)
    } as unknown as IdentityService;
    const prisma = {} as PrismaClient;
    await expect(requireAccount(req, { prisma, identityService })).rejects.toMatchObject({
      status: 401
    });
  });

  it("requireAccount returns 401 when session not linked to account", async () => {
    const req = mockReq(undefined, "tok");
    const identityService = {
      resolveSession: vi.fn().mockResolvedValue(session)
    } as unknown as IdentityService;
    const prisma = {
      tenantMembership: {
        findUnique: vi.fn().mockResolvedValue(null)
      }
    } as unknown as PrismaClient;
    await expect(requireAccount(req, { prisma, identityService })).rejects.toMatchObject({
      code: "account_missing",
      status: 401
    });
  });

  it("loadAccountContextForSession returns creator + supporter flags", async () => {
    const prisma = {
      tenantMembership: {
        findUnique: vi.fn().mockResolvedValue({ accountId: "acc_1" }),
        count: vi.fn().mockResolvedValue(2)
      },
      account: {
        findUnique: vi.fn().mockResolvedValue({
          id: "acc_1",
          supabaseUserId: "uuid",
          primaryRelayCreatorId: "cr_x"
        })
      },
      $executeRawUnsafe: vi.fn().mockResolvedValue(0)
    } as unknown as PrismaClient;
    const ctx = await loadAccountContextForSession(prisma, session);
    expect(ctx).toEqual({
      accountId: "acc_1",
      supabaseUserId: "uuid",
      primaryRelayCreatorId: "cr_x",
      hasSupporterMemberships: true
    });
  });

  it("requireAccountWithRole creator returns 403 for supporter-only account", async () => {
    const req = mockReq(undefined, "tok");
    const identityService = {
      resolveSession: vi.fn().mockResolvedValue(session)
    } as unknown as IdentityService;
    const prisma = {
      tenantMembership: {
        findUnique: vi.fn().mockResolvedValue({ accountId: "acc_1" }),
        count: vi.fn().mockResolvedValue(0)
      },
      account: {
        findUnique: vi.fn().mockResolvedValue({
          id: "acc_1",
          supabaseUserId: null,
          primaryRelayCreatorId: null
        })
      },
      $executeRawUnsafe: vi.fn().mockResolvedValue(0)
    } as unknown as PrismaClient;
    await expect(
      requireAccountWithRole(req, { prisma, identityService }, "creator")
    ).rejects.toMatchObject({ status: 403 });
  });

  it("requireAccountWithRole supporter returns 403 when no patron memberships", async () => {
    const req = mockReq(undefined, "tok");
    const identityService = {
      resolveSession: vi.fn().mockResolvedValue(session)
    } as unknown as IdentityService;
    const prisma = {
      tenantMembership: {
        findUnique: vi.fn().mockResolvedValue({ accountId: "acc_1" }),
        count: vi.fn().mockResolvedValue(0)
      },
      account: {
        findUnique: vi.fn().mockResolvedValue({
          id: "acc_1",
          supabaseUserId: null,
          primaryRelayCreatorId: "cr_x"
        })
      },
      $executeRawUnsafe: vi.fn().mockResolvedValue(0)
    } as unknown as PrismaClient;
    await expect(
      requireAccountWithRole(req, { prisma, identityService }, "supporter")
    ).rejects.toMatchObject({ status: 403 });
  });

  it("sendRelayAuthError returns true for RelayAuthError", () => {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const ok = sendRelayAuthError(res as never, new RelayAuthError(401, "X", "m"), "t1");
    expect(ok).toBe(true);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalled();
  });

  it("sendRelayAuthError returns false for other errors", () => {
    const ok = sendRelayAuthError({} as never, new Error("x"), "t1");
    expect(ok).toBe(false);
  });
});
