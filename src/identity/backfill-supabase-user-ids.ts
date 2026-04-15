import type { SupabaseClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";

function normEmail(email: string | null | undefined): string | null {
  if (typeof email !== "string") return null;
  const t = email.trim();
  if (t.length === 0) return null;
  return t.toLowerCase();
}

/**
 * Paginates through all Auth users and builds a map: normalized email → `auth.users.id`.
 * If multiple users share the same email (unexpected), the last one wins and earlier ids are reported in `duplicateEmailWarnings`.
 */
export async function loadAuthUsersEmailMap(supabase: SupabaseClient): Promise<{
  emailToUserId: Map<string, string>;
  duplicateEmailWarnings: string[];
  totalAuthUsers: number;
}> {
  const emailToUserId = new Map<string, string>();
  const duplicateEmailWarnings: string[] = [];
  const perPage = 1000;
  let page = 1;
  let totalAuthUsers = 0;

  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Supabase auth.admin.listUsers failed: ${error.message}`);
    }
    const users = data.users;
    totalAuthUsers += users.length;

    for (const u of users) {
      const key = normEmail(u.email);
      if (!key) continue;
      const prev = emailToUserId.get(key);
      if (prev && prev !== u.id) {
        duplicateEmailWarnings.push(
          `email ${key}: keeping user ${u.id}, also had ${prev} (resolve in Supabase dashboard)`
        );
      }
      emailToUserId.set(key, u.id);
    }

    if (users.length < perPage) break;
    page += 1;
  }

  return { emailToUserId, duplicateEmailWarnings, totalAuthUsers };
}

export type BackfillSupabaseUserIdsResult = {
  totalAuthUsers: number;
  accountsWithNullSupabase: number;
  accountsWithoutEmail: number;
  linked: number;
  dryRunLinked: number;
  unmatchedEmails: number;
  duplicateEmailWarnings: string[];
  /** Prisma / invariant failures (e.g. unique constraint) */
  errors: string[];
};

/**
 * MIG-12: set `Account.supabaseUserId` for rows that have `emailNorm` matching an Auth user, using admin `listUsers`.
 * Idempotent: safe to re-run; skips rows that already have `supabaseUserId`.
 */
export async function backfillAccountSupabaseUserIds(args: {
  prisma: PrismaClient;
  supabase: SupabaseClient;
  dryRun?: boolean;
}): Promise<BackfillSupabaseUserIdsResult> {
  const dryRun = Boolean(args.dryRun);
  const { emailToUserId, duplicateEmailWarnings, totalAuthUsers } =
    await loadAuthUsersEmailMap(args.supabase);

  const accounts = await args.prisma.account.findMany({
    where: { supabaseUserId: null },
    select: { id: true, emailNorm: true }
  });

  let accountsWithoutEmail = 0;
  let linked = 0;
  let dryRunLinked = 0;
  let unmatchedEmails = 0;
  const errors: string[] = [];

  for (const row of accounts) {
    const en = row.emailNorm;
    if (!en || en.trim().length === 0) {
      accountsWithoutEmail += 1;
      continue;
    }
    const key = normEmail(en);
    if (!key) {
      accountsWithoutEmail += 1;
      continue;
    }

    const supaId = emailToUserId.get(key);
    if (!supaId) {
      unmatchedEmails += 1;
      continue;
    }

    if (dryRun) {
      dryRunLinked += 1;
      continue;
    }

    try {
      await args.prisma.account.update({
        where: { id: row.id },
        data: { supabaseUserId: supaId }
      });
      linked += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`account ${row.id} (${key}): ${msg}`);
    }
  }

  return {
    totalAuthUsers,
    accountsWithNullSupabase: accounts.length,
    accountsWithoutEmail,
    linked,
    dryRunLinked,
    unmatchedEmails,
    duplicateEmailWarnings,
    errors
  };
}
