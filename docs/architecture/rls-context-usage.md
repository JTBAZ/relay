# RLS session context (`relay.account_id`)

Tier 0.3 introduces `auth_account_id()` in Postgres (see migration `tier0_rls_context`) and the helpers `setSupabaseRlsContext` / `clearSupabaseRlsContext` in `src/lib/supabase-rls-context.ts`.

## When to set context

Call `setSupabaseRlsContext(client, accountId)` at the beginning of the transactional work for any handler that touches tenant-scoped data **when** RLS policies will use `auth_account_id()` to decide row access. The client is usually the Prisma interactive transaction client (`tx`) so the setting is scoped to that transaction.

## When to clear context

Use `clearSupabaseRlsContext(client)` only for handlers that must deliberately run **without** an account on code paths that still execute SQL where RLS applies (for example, anonymous public profile reads). Clearing uses an empty `set_config` value so `auth_account_id()` evaluates to NULL (fail-closed for policies that require a user).

## Pooling and `is_local`

The helpers use `set_config(..., true)` so the GUC is **transaction-local**. That avoids leaking account identity across pooled connections when using Supabase’s transaction pooler.

## Anti-patterns

- Querying tenant-scoped tables on a Prisma client that never ran `setSupabaseRlsContext` in the same transaction: RLS will see NULL and return no rows.
- Setting context once per process instead of per transaction: unsafe with pooling; always set inside the transaction that performs the queries.

## Related

- Tier 1 guardrails add concrete RLS policies and handler wiring; this document covers only the Tier 0 plumbing.
