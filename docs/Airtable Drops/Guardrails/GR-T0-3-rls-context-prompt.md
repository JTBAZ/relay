# GR-T0-3 — RLS context plumbing: `auth_account_id()` + server helper

## Context

You are building **Tier 0 primitive #3** of the Auth Guardrails plan ([`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §3 Stage C foundation). The Tier 1 RLS policies (row 1.2) need a way to read "who is the current Account?" from inside Postgres. This row creates that plumbing: a SQL function `auth_account_id()` plus a server-side helper that sets the relevant session config at the start of every request handler.

This row ships **only the plumbing.** No actual RLS policies are added here — those are row 1.2.

## Preconditions

- None on the code side. This is independent of T0-1 and T0-2.
- **Required:** Read access to the linked Supabase project. Confirm with `user-supabase` MCP that you can run a `select 1` and that you know which DB the migrations target.
- Confirm by: read `.cursor/rules/supabase-mcp-read-check.mdc` and follow its read-check protocol before proposing any migration.

## Tier 0 invariants (always apply)

1. RLS is the **source of truth** for tenant authz. Application code may pre-filter for performance, but RLS must always pass on the same data.
2. The session config key is `relay.account_id` (a string holding the `Account.id` value, which is a CUID today — see [`adr/001`](../../architecture/adr/001-option-b-and-supabase-auth-linkage.md), Pattern A).
3. `auth_account_id()` returns `NULL` when the config is unset. Policies that need a logged-in user must include `auth_account_id() IS NOT NULL`.
4. The helper that sets the config must be called **at the top of every request handler that reads or writes a tenant-scoped table.** Forgetting it means RLS sees `NULL` and (correctly) returns zero rows — fail-closed.

## Goal

After this row ships:

- A SQL function `auth_account_id() RETURNS text` exists in the application schema and is granted `EXECUTE` to the app role.
- A server helper `setSupabaseRlsContext(client, accountId)` is the canonical way to set `relay.account_id` for the lifetime of a request.
- A test fixture proves both halves wire up: setting the config via the helper makes `auth_account_id()` return the value; clearing it makes it return `NULL`.

## Reference reading

1. [`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §3 Stage C (the upstream plan for RLS policies).
2. [`docs/architecture/multi-tenant-cloud-runtime.md`](../../architecture/multi-tenant-cloud-runtime.md) — confirms Supabase Postgres is the runtime target.
3. [`docs/database/operations-and-security.md`](../../database/operations-and-security.md) (if present) — pooling and security context.
4. `prisma/schema.prisma` — note how the Prisma client is configured; if the project uses a connection pooler (PgBouncer transaction mode), the helper must use `set_config(..., is_local := true)` so the setting is scoped to the transaction.
5. `.cursor/rules/supabase-mcp-read-check.mdc` — required protocol before any DB change.

## Implementation steps

### Part A — Migration (~2 hours)

1. **Create migration directory:** `prisma/migrations/<UTC-timestamp>_tier0_rls_context/`.

2. **`migration.sql`** — minimal, idempotent. Example (adjust schema name if not `public`):

   ```sql
   -- Tier 0.3: RLS context plumbing.
   -- Defines auth_account_id() which reads the per-request config 'relay.account_id'.
   -- Returns NULL when unset, so policies fail-closed for unauthenticated requests.

   CREATE OR REPLACE FUNCTION public.auth_account_id() RETURNS text
     LANGUAGE sql STABLE
     AS $$
       SELECT NULLIF(current_setting('relay.account_id', true), '')
     $$;

   -- Grant EXECUTE to the app role(s). Replace <app_role> with the actual role
   -- used by the Prisma DATABASE_URL (commonly `authenticated` on Supabase, or a
   -- custom role per environment). Run `\du` against the target DB to confirm.
   GRANT EXECUTE ON FUNCTION public.auth_account_id() TO PUBLIC;
   -- (PUBLIC is acceptable here because the function only reads a per-session
   -- config that the caller already controls. Tighten if your security review
   -- requires a narrower grant.)

   COMMENT ON FUNCTION public.auth_account_id() IS
     'Tier 0 RLS plumbing. Reads relay.account_id session config. Returns NULL when unset (fail-closed).';
   ```

3. **Pre-flight via MCP:** Use `user-supabase` MCP to confirm:
   - The function does not already exist (`\df auth_account_id` or equivalent query). If it does, abort and open a row to reconcile.
   - The migration applies cleanly against a scratch schema (do not apply against production until reviewed).

4. **Update `prisma/migrations/migration_lock.toml`** if needed (Prisma manages this — usually no manual edit).

### Part B — Server helper (~2 hours)

5. **Create `src/lib/supabase-rls-context.ts`**:

   ```ts
   import type { PrismaClient } from "@prisma/client";

   /**
    * Tier 0.3 — set the per-request RLS context.
    *
    * Call this at the top of every request handler that reads or writes a
    * tenant-scoped table. The setting is transaction-local (is_local := true),
    * so it's safe with PgBouncer transaction-mode pooling.
    *
    * Usage:
    *   await prisma.$transaction(async (tx) => {
    *     await setSupabaseRlsContext(tx, accountId);
    *     return tx.post.findMany({ where: { tenantId } });
    *   });
    */
   export async function setSupabaseRlsContext(
     client: Pick<PrismaClient, "$executeRawUnsafe">,
     accountId: string
   ): Promise<void> {
     // set_config returns a row; we don't care about the value.
     // Parameterize via $executeRaw to avoid SQL injection on accountId.
     await client.$executeRawUnsafe(
       `SELECT set_config('relay.account_id', $1, true)`,
       accountId
     );
   }

   /**
    * Sentinel for routes that must run with NO account context (e.g. anonymous
    * public-profile reads). Setting an empty string makes auth_account_id() return NULL.
    */
   export async function clearSupabaseRlsContext(
     client: Pick<PrismaClient, "$executeRawUnsafe">
   ): Promise<void> {
     await client.$executeRawUnsafe(
       `SELECT set_config('relay.account_id', '', true)`
     );
   }
   ```

   **Important:** `$executeRawUnsafe` accepts positional params via the second arg in Prisma 5+. If your Prisma version requires a different invocation, prefer `client.$queryRaw` with `Prisma.sql` template tags. Verify the Prisma version in `package.json` before finalizing.

6. **Add a usage convention doc** at `docs/architecture/rls-context-usage.md` (~30 lines):
   - When to call `setSupabaseRlsContext` (every handler that touches tenant-scoped tables).
   - When to call `clearSupabaseRlsContext` (anonymous-only handlers — e.g. public profile read).
   - Why transaction-local (`is_local := true`): pooler safety.
   - Forbidden pattern: querying tenant-scoped data outside a transaction that set the context.

### Part C — Tests (~2 hours)

7. **Create `tests/identity/rls-context.test.ts`** (or wherever the project's integration tests live — match existing conventions):

   ```ts
   describe("Tier 0.3 — RLS context plumbing", () => {
     it("auth_account_id() returns NULL when no config is set", async () => {
       const result = await prisma.$queryRaw<[{ aid: string | null }]>`
         SELECT auth_account_id() AS aid
       `;
       expect(result[0].aid).toBeNull();
     });

     it("auth_account_id() returns the set value within a transaction", async () => {
       const result = await prisma.$transaction(async (tx) => {
         await setSupabaseRlsContext(tx, "acc_test_123");
         return tx.$queryRaw<[{ aid: string | null }]>`
           SELECT auth_account_id() AS aid
         `;
       });
       expect(result[0].aid).toBe("acc_test_123");
     });

     it("setting is local to the transaction (does not leak)", async () => {
       await prisma.$transaction(async (tx) => {
         await setSupabaseRlsContext(tx, "acc_leak_check");
       });
       const after = await prisma.$queryRaw<[{ aid: string | null }]>`
         SELECT auth_account_id() AS aid
       `;
       expect(after[0].aid).toBeNull();
     });
   });
   ```

## Acceptance criteria

- [ ] Migration file exists under `prisma/migrations/<ts>_tier0_rls_context/migration.sql` and is committed.
- [ ] `prisma migrate status` reports it as applied against the dev DB.
- [ ] Supabase MCP read-check confirms the function exists and has the expected `pg_proc.prosrc`.
- [ ] All three tests in `tests/identity/rls-context.test.ts` pass.
- [ ] `docs/architecture/rls-context-usage.md` exists.
- [ ] No new RLS policies added in this row — verify with `rg "CREATE POLICY" prisma/migrations/<ts>_tier0_rls_context/`.
- [ ] `npm run test` passes at repo root.
- [ ] `npm run build` passes at repo root.

## Out of scope

- Adding the actual RLS policies — that is row **1.2**.
- Wiring `setSupabaseRlsContext` into existing handlers — that is row **1.1** (handlers will adopt it as part of the `requireAccount` middleware).
- Multi-tenant context (e.g. `relay.tenant_id`) — not needed for the two-sided policies in 1.2; defer until a use case appears.
- Switching from Pattern A (CUID + `supabaseUserId`) to Pattern B (UUID PK) — separate decision; do not alter ID shape here.

## Handoff

Delta Out:
- Migration filename + UTC timestamp.
- Confirmation the function returns `NULL` fail-closed.
- Note on which app role received the `EXECUTE` grant (depends on environment).

Next claimable: `GR-T0-VERIFY-prompt.md` once 0.1, 0.2, and 0.4 are also merged.
