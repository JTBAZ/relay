# Multi-tenant run 11 — Account ↔ creator workspace schema (MT-031)

| | |
|---|---|
| **Step IDs** | `MT-031` |
| **Sort order** | 53 |
| **Precondition** | Prisma migrations deployable on Supabase Postgres (`DATABASE_URL`). Read [`../multi-tenant-option-b.md`](../multi-tenant-option-b.md). |

## Full prompt (paste into agent)

```text
You are a coding agent on Rescue / Relay. Implement **MT-031** only: **data model** to bind each `Account` to at most one creator `relay_creator_id` (artist workspace) before Patreon OAuth.

### Scope

1. **Choose one pattern** (prefer a single nullable column unless you have a strong reason for a join table):
   - **Option A (preferred):** Add `Account.primaryRelayCreatorId` (nullable, unique) — maps to `Tenant.relayCreatorId` for that artist’s studio.
   - **Option B:** New `CreatorWorkspace` (or similar) table with `accountId` + `relayCreatorId` unique on each column.

2. **Prisma:** Update `prisma/schema.prisma`, add migration under `prisma/migrations/`, run `npx prisma generate`. Document invariant: one workspace per account for v1.

3. **Backfill:** Existing rows get `NULL`; no destructive changes to existing `Tenant` / `User` rows.

4. **Tests:** Add or extend a small test that the migration applies and unique constraint behaves (use project’s test DB pattern).

### Out of scope for this run

- HTTP routes (MT-032), auth bridge (MT-033), OAuth hardening (MT-034), web UI (MT-036).

### Verify

- `npx prisma validate` / `npm run build` as appropriate for the repo.
- Summarize schema change in PR/commit message.

### Airtable

When done locally: set **Multi Tenant Changes** row **MT-031** to **Complete**; leave **Next run prompt** pointing at `mt-run-12.md` on `main`.
```
