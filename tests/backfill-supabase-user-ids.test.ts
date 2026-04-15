import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  backfillAccountSupabaseUserIds,
  loadAuthUsersEmailMap
} from "../src/identity/backfill-supabase-user-ids.js";

describe("loadAuthUsersEmailMap", () => {
  it("builds an email map from listUsers (skips users without email)", async () => {
    const listUsers = vi.fn().mockResolvedValue({
      data: {
        users: [
          { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", email: "A@x.com" },
          { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", email: null },
          { id: "cccccccc-cccc-cccc-cccc-cccccccccccc", email: "b@x.com" }
        ],
        aud: "authenticated"
      },
      error: null
    });

    const supabase = { auth: { admin: { listUsers } } };

    const r = await loadAuthUsersEmailMap(supabase as never);

    expect(r.totalAuthUsers).toBe(3);
    expect(r.emailToUserId.get("a@x.com")).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    expect(r.emailToUserId.get("b@x.com")).toBe("cccccccc-cccc-cccc-cccc-cccccccccccc");
    expect(listUsers).toHaveBeenCalledWith({ page: 1, perPage: 1000 });
  });

  it("warns when two Auth users normalize to the same email", async () => {
    const listUsers = vi.fn().mockResolvedValue({
      data: {
        users: [
          { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", email: "dup@x.com" },
          { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", email: "Dup@x.com" }
        ],
        aud: "authenticated"
      },
      error: null
    });

    const r = await loadAuthUsersEmailMap({ auth: { admin: { listUsers } } } as never);

    expect(r.emailToUserId.get("dup@x.com")).toBe("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    expect(r.duplicateEmailWarnings.length).toBe(1);
  });
});

describe("backfillAccountSupabaseUserIds", () => {
  it("updates accounts when email matches Auth user", async () => {
    const listUsers = vi.fn().mockResolvedValue({
      data: {
        users: [{ id: "550e8400-e29b-41d4-a716-446655440000", email: "match@example.com" }],
        aud: "authenticated"
      },
      error: null
    });

    const findMany = vi.fn().mockResolvedValue([
      { id: "acc_1", emailNorm: "match@example.com" },
      { id: "acc_2", emailNorm: null }
    ]);

    const update = vi.fn().mockResolvedValue({});

    const prisma = { account: { findMany, update } } as unknown as PrismaClient;
    const supabase = { auth: { admin: { listUsers } } };

    const r = await backfillAccountSupabaseUserIds({ prisma, supabase: supabase as never });

    expect(r.linked).toBe(1);
    expect(r.accountsWithoutEmail).toBe(1);
    expect(r.unmatchedEmails).toBe(0);
    expect(update).toHaveBeenCalledWith({
      where: { id: "acc_1" },
      data: { supabaseUserId: "550e8400-e29b-41d4-a716-446655440000" }
    });
  });

  it("dry-run does not call update", async () => {
    const listUsers = vi.fn().mockResolvedValue({
      data: {
        users: [{ id: "550e8400-e29b-41d4-a716-446655440001", email: "dry@example.com" }],
        aud: "authenticated"
      },
      error: null
    });

    const findMany = vi.fn().mockResolvedValue([{ id: "acc_x", emailNorm: "dry@example.com" }]);
    const update = vi.fn();

    const prisma = { account: { findMany, update } } as unknown as PrismaClient;
    const supabase = { auth: { admin: { listUsers } } };

    const r = await backfillAccountSupabaseUserIds({
      prisma,
      supabase: supabase as never,
      dryRun: true
    });

    expect(r.dryRunLinked).toBe(1);
    expect(r.linked).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });
});
