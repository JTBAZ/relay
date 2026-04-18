# GR-T1-2 — Two-sided RLS policies (Creator owns / Supporter entitled)

## Context

You are building **Tier 1 primitive #2** of the Auth Guardrails plan ([`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §3 Stage C). With T0-3 in place (`auth_account_id()` SQL function) and T1-1 in place (handlers set the context), this row writes the actual Postgres RLS policies that encode the **two-sided paywall logic** the user approved:

- **Creator side:** Account may read/write rows on their own `Tenant` (i.e. the tenant whose `relayCreatorId` matches `Account.primaryRelayCreatorId`).
- **Supporter side:** Account may **read** rows that are public OR rows where they have an active `TenantMembership` whose `tier_ids[]` includes the row's required tier.

Authoring (writes by supporters — comments, likes) is a separate policy: the row's `account_id` must equal `auth_account_id()`.

## Preconditions

- [ ] `GR-T0-3-rls-context-prompt.md` shipped (`auth_account_id()` exists).
- [ ] `GR-T0-4-slug-uuid-contract-prompt.md` shipped (UUID contract locked — policies must use UUIDs only).
- [ ] `GR-T1-1-require-account-prompt.md` shipped (handlers set the context).
- [ ] `GR-T0-VERIFY-prompt.md` shipped green.

## Tier 0 invariants (always apply)

1. RLS is the **source of truth.** Application code may pre-filter for performance, but RLS must independently pass on the same data.
2. **No policy references `relay_creator_id` or `public_slug`.** Use `Tenant.id` (UUID/CUID).
3. Policies fail-closed: if `auth_account_id()` is `NULL`, no rows are visible (except where the policy explicitly allows anonymous public reads).

## Goal

After this row ships:

- RLS is enabled on every multi-tenant table.
- Two policy templates (Creator-owns / Supporter-entitled) are applied to each tenant-scoped table.
- A test fixture proves the policies behave correctly across four personas: anonymous, creator (self), creator (other), supporter (entitled / not entitled).

## Reference reading

1. [`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §3 Stage C — includes the policy template.
2. [`docs/architecture/multi-tenant-option-b.md`](../../architecture/multi-tenant-option-b.md) — `Account.primaryRelayCreatorId` semantics.
3. [`docs/architecture/url-identity-contract.md`](../../architecture/url-identity-contract.md) (from T0-4) — confirms UUIDs are the FK key.
4. `prisma/schema.prisma` — enumerate every model that has a `tenantId` column or otherwise belongs to a tenant. Likely candidates: `Post`, `MediaItem`, `Collection`, `Comment`, `Like`, `Favorite`. **Check the actual schema; the names may differ.**
5. The Supabase MCP read-check rule (`.cursor/rules/supabase-mcp-read-check.mdc`) — required before any DB change.

## Implementation steps

### Part A — Enumerate target tables (~2 hours)

1. **List every model in `prisma/schema.prisma` that is tenant-scoped.** Criteria:
   - Has a `tenantId` FK to `Tenant.id`, **or**
   - Belongs to a parent that does (e.g. a `Comment` belongs to a `Post` which belongs to a `Tenant`).

2. **For each table, classify the access pattern:**
   - **Owner-only:** Creator's own data, no supporter visibility (e.g. draft posts, private collections, ingest queues).
   - **Tier-gated read:** Creator owns + Supporters can read if entitled (e.g. published posts).
   - **Authoring:** Anyone with appropriate context may insert their own row (e.g. comments).
   - **Public read:** Anonymous reads allowed if a public flag is set (e.g. `is_public` posts, public profile data).

3. **Produce a CSV or markdown table** in the migration's accompanying note (created in step 5) listing each table and its classification. **This is the source of truth for which policies apply where.**

### Part B — Migration (~4 hours)

4. **Create migration:** `prisma/migrations/<UTC-timestamp>_tier1_rls_policies/`.

5. **`migration.sql`** — for each tenant-scoped table, generate the appropriate policies. Use these templates:

   **Template 1: Creator-owns (read + write).** Use for: tenant data the creator may freely manage.

   ```sql
   ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

   CREATE POLICY tier1_creator_full ON posts
     FOR ALL
     USING (
       tenant_id = (
         SELECT t.id FROM tenants t
         JOIN accounts a ON a.primary_relay_creator_id = t.relay_creator_id
         WHERE a.id = auth_account_id()
       )
     );
   ```

   **Template 2: Supporter read (tier-gated).** Use for: published, paywalled, or tier-gated content.

   ```sql
   CREATE POLICY tier1_supporter_read ON posts
     FOR SELECT
     USING (
       is_public
       OR EXISTS (
         SELECT 1 FROM tenant_memberships m
         WHERE m.account_id = auth_account_id()
           AND m.tenant_id  = posts.tenant_id
           AND (
             posts.required_tier_id IS NULL
             OR posts.required_tier_id = ANY(m.tier_ids)
           )
       )
     );
   ```

   **Template 3: Authoring (insert by self).** Use for: comments, likes, favorites — author must be the requesting account.

   ```sql
   CREATE POLICY tier1_self_insert ON comments
     FOR INSERT
     WITH CHECK (account_id = auth_account_id());

   CREATE POLICY tier1_read_via_parent ON comments
     FOR SELECT
     USING (
       -- Comment is visible if the parent post is visible to the account.
       EXISTS (
         SELECT 1 FROM posts p
         WHERE p.id = comments.post_id
         -- Postgres re-evaluates RLS on the join — a supporter can only see
         -- comments on posts they can themselves see.
       )
     );

   CREATE POLICY tier1_self_update_own ON comments
     FOR UPDATE
     USING (account_id = auth_account_id())
     WITH CHECK (account_id = auth_account_id());

   CREATE POLICY tier1_self_delete_own ON comments
     FOR DELETE
     USING (account_id = auth_account_id());
   ```

   **Template 4: Anonymous public read** (only if a table needs to be readable without `auth_account_id()`).

   ```sql
   CREATE POLICY tier1_anonymous_public_read ON tenants
     FOR SELECT
     USING (is_public_profile = true);
   ```

   Adjust column names to match the actual schema. **If a column referenced above (`is_public`, `required_tier_id`, `is_public_profile`) does not exist on the target table, do not invent it — open a separate row to add it before applying the supporter policy.**

6. **Idempotency:** Wrap each `CREATE POLICY` in a `DROP POLICY IF EXISTS ... ;` first so re-running the migration is safe.

7. **Pre-flight via Supabase MCP read-check:**
   - Confirm `auth_account_id()` exists (sanity).
   - Confirm none of the target tables already have conflicting policies. If they do, abort and reconcile in a separate row.

8. **Apply the migration locally first.** Run the test suite (Part C) before committing.

### Part C — Test fixtures (~3 hours)

9. **Create `tests/rls/two-sided-paywall.test.ts`** with table-driven assertions. Set up four personas in a `beforeAll`:

   - `anon` — no `auth_account_id()` set.
   - `creator_self` — Account A, owns Tenant T1.
   - `creator_other` — Account B, owns Tenant T2.
   - `supporter_entitled` — Account C, has `TenantMembership(account_id=C, tenant_id=T1, tier_ids=['gold'])`.
   - `supporter_unentitled` — Account D, has membership in T2 but not T1.

10. **For each (table, persona, expected_count) tuple, run a query and assert:**

    | Table | Persona | Expected |
    |---|---|---|
    | `posts` (T1, public) | anon | 1 visible |
    | `posts` (T1, public) | supporter_unentitled | 1 visible |
    | `posts` (T1, gold-only) | anon | 0 |
    | `posts` (T1, gold-only) | supporter_unentitled | 0 |
    | `posts` (T1, gold-only) | supporter_entitled | 1 visible |
    | `posts` (T1, gold-only) | creator_self | 1 visible (owns) |
    | `posts` (T1, gold-only) | creator_other | 0 (does not own) |
    | `posts` (T1, draft) | supporter_entitled | 0 (not public, no published flag) |
    | `posts` (T1, draft) | creator_self | 1 (owns) |
    | `comments` insert as `creator_other` claiming `account_id=A` | — | RLS rejects |
    | `comments` insert as `supporter_entitled` claiming own `account_id` | — | RLS accepts |

11. **Wrap each query in a transaction that calls `setSupabaseRlsContext` first.** Without the context, all assertions return zero rows — that's correct, but the test is then trivially passing for the wrong reason. Verify the context is set explicitly in the `beforeEach`.

## Acceptance criteria

- [ ] Every tenant-scoped table identified in Part A has RLS enabled and the appropriate policies applied.
- [ ] Migration is idempotent (`DROP POLICY IF EXISTS` precedes each `CREATE POLICY`).
- [ ] All test fixtures in `tests/rls/two-sided-paywall.test.ts` pass.
- [ ] Negative test passes: a handler that **forgets** to call `setSupabaseRlsContext` returns zero rows from any tenant-scoped query (fail-closed verified).
- [ ] `npm run test` passes at repo root.
- [ ] `npm run build` passes at repo root.
- [ ] Manual smoke via Supabase MCP: connect as the app role, run `SELECT * FROM posts` without setting context — returns zero rows.
- [ ] Manual smoke: set `relay.account_id` to a known creator's id, run `SELECT * FROM posts` — returns only their tenant's rows.

## Out of scope

- Cross-tenant admin/staff visibility — no admin role exists yet.
- Soft-delete visibility (e.g. `deleted_at IS NULL`) — open a separate row when soft-delete ships.
- Performance tuning — RLS predicates may need indexes; profile after this lands and open a row only if real queries show regression.
- Application-layer redundant filters — keep them where they exist (defense-in-depth) but RLS is the authoritative check.

## Handoff

Delta Out:
- The classification table from Part A (paste in full).
- Migration filename and timestamp.
- Any table that lacked a required column (`is_public`, `required_tier_id`, etc.) and was deferred — name the follow-up rows.
- Confirmation of fail-closed behavior.

Next claimable: nothing chained off this row directly. T1-3 / T1-4 / T1-5 / T1-7 are independent of 1.2.
