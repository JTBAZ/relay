# ADR 001 — Option B identity + Supabase Auth ↔ `Account` linkage

**Status:** Accepted  
**Date:** 2026-04-12  
**Context:** [`MIG-00`](../supabase-migration-work-items.md) (Supabase migration Phase 0 baseline)

## Context

Relay’s multi-tenant model is documented in [`multi-tenant-option-b.md`](../multi-tenant-option-b.md). Supabase Auth issues stable UUIDs in `auth.users`; the application database must link those UUIDs to the Prisma `Account` model without breaking existing rows or FK graphs.

[`multi-tenant-cloud-runtime.md`](../multi-tenant-cloud-runtime.md) describes two linkage patterns (A: external UUID column; B: `Account.id` = `auth.users.id`).

## Decision

1. **Canonical identity pattern:** **Option B** — global `Account`, `Tenant`, `TenantMembership`, creator `User` under `Tenant`, etc., as already modeled in `prisma/schema.prisma` and the architecture docs.

2. **Canonical Supabase Auth linkage pattern:** **Pattern A — external UUID column** — keep `Account.id` as the existing string primary key (CUID today); add **`supabaseUserId`** (UUID, unique, required for new signups once implemented) mapping to `auth.users.id`.

## Rationale

- **Pattern A** avoids retargeting every foreign key that references `Account.id` (patron sessions, memberships, OAuth rows, snapshots, etc.).
- Existing and backfilled accounts can gain a `supabaseUserId` in migration steps (**MIG-10**, **MIG-12**) without rewriting primary keys.
- **Pattern B** (UUID PK on `Account`) remains documented as an alternative in `multi-tenant-cloud-runtime.md` but is **not** the chosen path unless explicitly revisited.

## Consequences

- Implementation work follows **MIG-10** (add column + migration) rather than a wholesale PK migration.
- APIs and signup/login flows must treat `supabaseUserId` as the bridge to Supabase JWT `sub` after Auth integration.

## Related

- [`../supabase-migration-work-items.md`](../supabase-migration-work-items.md)
- [`../multi-tenant-cloud-runtime.md`](../multi-tenant-cloud-runtime.md) § Identity linkage
- [`../multi-tenant-option-b.md`](../multi-tenant-option-b.md)
