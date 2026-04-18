import { describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/db.js";
import {
  clearSupabaseRlsContext,
  setSupabaseRlsContext
} from "../../src/lib/supabase-rls-context.js";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!hasDatabaseUrl)("Tier 0.3 — RLS context plumbing", () => {
  it("auth_account_id() returns NULL when no config is set", async () => {
    const result = await prisma.$queryRaw<[{ aid: string | null }]>`
      SELECT auth_account_id() AS aid
    `;
    expect(result[0]?.aid).toBeNull();
  });

  it("auth_account_id() returns the set value within a transaction", async () => {
    const result = await prisma.$transaction(async (tx) => {
      await setSupabaseRlsContext(tx, "acc_test_123");
      return tx.$queryRaw<[{ aid: string | null }]>`
        SELECT auth_account_id() AS aid
      `;
    });
    expect(result[0]?.aid).toBe("acc_test_123");
  });

  it("setting is local to the transaction (does not leak)", async () => {
    await prisma.$transaction(async (tx) => {
      await setSupabaseRlsContext(tx, "acc_leak_check");
    });
    const after = await prisma.$queryRaw<[{ aid: string | null }]>`
      SELECT auth_account_id() AS aid
    `;
    expect(after[0]?.aid).toBeNull();
  });

  it("clearSupabaseRlsContext yields NULL from auth_account_id()", async () => {
    const result = await prisma.$transaction(async (tx) => {
      await setSupabaseRlsContext(tx, "acc_should_clear");
      await clearSupabaseRlsContext(tx);
      return tx.$queryRaw<[{ aid: string | null }]>`
        SELECT auth_account_id() AS aid
      `;
    });
    expect(result[0]?.aid).toBeNull();
  });
});
