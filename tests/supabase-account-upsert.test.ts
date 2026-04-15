import { describe, expect, it, vi } from "vitest";
import { IdentityAuthProvider } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { upsertAccountForSupabaseUser } from "../src/identity/supabase-account.js";

describe("upsertAccountForSupabaseUser", () => {
  it("creates account when no row matches supabase id or email", async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const create = vi.fn().mockResolvedValue({
      id: "acc_new",
      emailNorm: "user@example.com",
      supabaseUserId: "550e8400-e29b-41d4-a716-446655440000",
      identityAuthProvider: IdentityAuthProvider.independent,
      passwordHash: null
    });
    const prisma = { account: { findUnique, update: vi.fn(), create } } as unknown as PrismaClient;

    const r = await upsertAccountForSupabaseUser(prisma, {
      supabaseUserId: "550e8400-e29b-41d4-a716-446655440000",
      email: "User@Example.com"
    });

    expect(r.created).toBe(true);
    expect(r.account.id).toBe("acc_new");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          emailNorm: "user@example.com",
          supabaseUserId: "550e8400-e29b-41d4-a716-446655440000",
          identityAuthProvider: IdentityAuthProvider.independent
        })
      })
    );
  });

  it("returns existing row when supabase id matches", async () => {
    const existing = {
      id: "acc_1",
      emailNorm: "a@b.com",
      supabaseUserId: "550e8400-e29b-41d4-a716-446655440001",
      identityAuthProvider: IdentityAuthProvider.independent,
      passwordHash: null
    };
    const findUnique = vi.fn().mockResolvedValueOnce(existing);
    const prisma = {
      account: { findUnique, update: vi.fn(), create: vi.fn() }
    } as unknown as PrismaClient;

    const r = await upsertAccountForSupabaseUser(prisma, {
      supabaseUserId: "550e8400-e29b-41d4-a716-446655440001",
      email: "a@b.com"
    });

    expect(r.created).toBe(false);
    expect(r.account).toEqual(existing);
    expect(findUnique).toHaveBeenCalledWith({
      where: { supabaseUserId: "550e8400-e29b-41d4-a716-446655440001" }
    });
  });

  it("links email-only account to supabase id when no conflict", async () => {
    const byEmail = {
      id: "acc_email",
      emailNorm: "legacy@example.com",
      supabaseUserId: null,
      identityAuthProvider: IdentityAuthProvider.independent,
      passwordHash: null
    };
    const linked = { ...byEmail, supabaseUserId: "550e8400-e29b-41d4-a716-446655440002" };
    const findUnique = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(byEmail);
    const update = vi.fn().mockResolvedValue(linked);
    const prisma = { account: { findUnique, update, create: vi.fn() } } as unknown as PrismaClient;

    const r = await upsertAccountForSupabaseUser(prisma, {
      supabaseUserId: "550e8400-e29b-41d4-a716-446655440002",
      email: "legacy@example.com"
    });

    expect(r.created).toBe(false);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "acc_email" },
        data: expect.objectContaining({
          supabaseUserId: "550e8400-e29b-41d4-a716-446655440002",
          identityAuthProvider: IdentityAuthProvider.independent
        })
      })
    );
  });

  it("throws when email maps to an account with a different supabase id", async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "acc_x",
        emailNorm: "taken@example.com",
        supabaseUserId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        identityAuthProvider: IdentityAuthProvider.independent,
        passwordHash: null
      });
    const prisma = { account: { findUnique, update: vi.fn(), create: vi.fn() } } as unknown as PrismaClient;

    await expect(
      upsertAccountForSupabaseUser(prisma, {
        supabaseUserId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        email: "taken@example.com"
      })
    ).rejects.toThrow(/another Supabase user/);
  });
});
