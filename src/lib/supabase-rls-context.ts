import type { PrismaClient } from "@prisma/client";

/**
 * @fileoverview Postgres `set_config('relay.account_id', ...)` helpers for Supabase-compatible RLS.
 * @description Transaction-local session variables consumed by `auth_account_id()` in policies.
 * @see prisma/migrations RLS policy definitions using `relay.account_id`
 * @todo Add integration tests proving mismatch between JWT and `account_id` fails closed.
 */

type RlsContextClient = Pick<PrismaClient, "$executeRawUnsafe">;

/**
 * @async
 * @description Sets the per-request RLS context for Postgres (`relay.account_id`).
 * @param {RlsContextClient} client Prisma (or compatible) client with `$executeRawUnsafe`.
 * @param {string} accountId Relay account uuid string bound to the authenticated user.
 * @returns {Promise<void>}
 * @throws {Error} When raw SQL execution fails (connection, permissions, invalid id encoding).
 * @security-audit-required Must match authenticated session; calling code must not allow cross-tenant `accountId` injection.
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
 * @async
 * @description Clears account context for anonymous/public reads where RLS must see NULL `auth_account_id()`.
 * @param {RlsContextClient} client Prisma client.
 * @returns {Promise<void>}
 * @throws {Error} On SQL execution failure.
 */
export async function clearSupabaseRlsContext(
  client: RlsContextClient
): Promise<void> {
  await client.$executeRawUnsafe(
    `SELECT set_config('relay.account_id', '', true)`
  );
}
