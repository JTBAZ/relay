import type { PrismaClient } from "@prisma/client";

type RlsContextClient = Pick<PrismaClient, "$executeRawUnsafe">;

/**
 * Tier 0.3 — set the per-request RLS context for Postgres (`relay.account_id`).
 *
 * Call at the start of every request handler that reads or writes tenant-scoped
 * tables when using a code path that relies on `auth_account_id()` in RLS. The
 * third argument to `set_config` is `true` (transaction-local), so the setting
 * is safe with PgBouncer transaction-mode pooling.
 *
 * Prefer running queries inside `prisma.$transaction` after this call so the
 * setting applies to the same connection/transaction.
 */
export async function setSupabaseRlsContext(
  client: RlsContextClient,
  accountId: string
): Promise<void> {
  await client.$executeRawUnsafe(
    `SELECT set_config('relay.account_id', $1::text, true)`,
    accountId
  );
}

/**
 * Clear account context for routes that must run with no account (e.g. anonymous
 * public reads). Setting an empty value makes `auth_account_id()` return NULL.
 */
export async function clearSupabaseRlsContext(
  client: RlsContextClient
): Promise<void> {
  await client.$executeRawUnsafe(
    `SELECT set_config('relay.account_id', '', true)`
  );
}
