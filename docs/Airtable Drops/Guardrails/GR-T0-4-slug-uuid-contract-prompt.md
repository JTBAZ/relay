# GR-T0-4 — Slug ↔ `relay_creator_id` ↔ UUID contract audit

## Context

You are building **Tier 0 primitive #4** of the Auth Guardrails plan ([`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §1 Tier 0 row 0.4). Relay has three identifiers floating around for a creator workspace:

| Identifier | Source | Mutability | Audience |
|---|---|---|---|
| `Tenant.id` (CUID) | Prisma | **Immutable** | Internal — FKs, RLS policies, joins |
| `Tenant.relayCreatorId` (`cr_*` string) | Application — see `multi-tenant-option-b.md` | **Immutable** | Cross-system correlation (Patreon ingest, logs, webhook payloads) |
| `public_slug` | User-chosen handle | **Mutable** | URLs (`/patron/c/<slug>`), display |

This row **audits and locks** the rule: every FK and every RLS policy uses `Tenant.id` (UUID-style CUID). The `cr_*` string is for external correlation only. The `public_slug` is for URLs only and resolves to a UUID once per request.

This is **mostly an audit row** — no schema migration unless the audit finds a violation. The deliverable is a contract document plus a single `resolveTenantBySlug` helper that becomes the canonical slug→UUID resolver.

## Preconditions

- None on the code side. Independent of T0-1, T0-2, T0-3.
- Read access to the schema and the URL routes.

## Tier 0 invariants (always apply)

1. **No FK references `public_slug` or `relay_creator_id`.** UUID/CUID `Tenant.id` is the only safe key for joins.
2. **No RLS policy references `public_slug` or `relay_creator_id`.** Same reason.
3. **Slug resolution happens once per request**, at the edge or at the top of the handler — never deep inside business logic.
4. **`relay_creator_id` is immutable.** Once minted on creator workspace provisioning, it never changes. (`public_slug` may change.)

## Goal

After this row ships:

- An audit doc enumerates every place the codebase uses `relay_creator_id` and `public_slug` and confirms each use is one of: (a) external correlation, (b) URL handling, (c) one-time resolution. **No FK or RLS use.**
- A single `resolveTenantBySlug` helper is the canonical resolver. All routes that take a slug call it once and pass the resulting UUID downstream.
- The contract is written into `docs/architecture/url-identity-contract.md` so future PRs can be reviewed against it.

## Reference reading

1. [`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §1 row 0.4.
2. [`docs/architecture/multi-tenant-option-b.md`](../../architecture/multi-tenant-option-b.md) — confirms `Tenant.id`, `Tenant.relayCreatorId`, `Account.primaryRelayCreatorId` semantics.
3. `prisma/schema.prisma` — the source of truth for FKs.
4. `web/app/patron/c/[handle]/page.tsx` — the existing slug-keyed public route.
5. `web/lib/relay-api.ts` and `web/lib/relay-auth-bootstrap.ts` — note the localStorage keys `RELAY_CREATOR_ID_STORAGE_KEY` and `RELAY_PUBLIC_SLUG_STORAGE_KEY`.

## Implementation steps

### Part A — Audit (~3 hours, mostly read-only)

1. **Run these greps and record results in the audit doc** (created in step 4):

   ```bash
   rg "relay_creator_id|relayCreatorId" --type ts --type prisma -n
   rg "public_slug|publicSlug" --type ts --type prisma -n
   ```

2. **Classify every hit** into one of these categories:
   - ✅ **External correlation** — Patreon webhook payloads, ingest scripts, log lines, env defaults.
   - ✅ **URL handling** — slug appears in a Next.js route param, `Link` href, or redirect.
   - ✅ **One-time resolution** — slug → UUID (or `cr_*` → UUID) lookup at the top of a handler or page.
   - ✅ **API surface** — return value to the client (e.g. `bootstrapStudioAfterSupabase` response). Acceptable.
   - ❌ **FK definition** — any `@relation` or `references` clause keyed on `relayCreatorId` or `publicSlug`. **Violation.**
   - ❌ **RLS policy** (none should exist yet pre-1.2, but check) — any policy referencing these columns. **Violation.**
   - ❌ **Deep business logic** — a function multiple call frames deep that takes `relay_creator_id` as an argument when it could take the UUID. **Refactor recommended but not required for this row.**

3. **For every ❌, decide:**
   - If it's a true FK/RLS violation: **stop.** Open a separate ledger row to migrate it. Do not migrate inside this prompt.
   - If it's deep-logic noise: log it in the "Recommended follow-ups" section of the audit doc; do not refactor here.

### Part B — Canonical resolver (~2 hours)

4. **Create `docs/architecture/url-identity-contract.md`** (~80 lines):
   - The three-identifier table from this prompt's Context section.
   - Audit results (counts per category, list any ❌).
   - The contract: "All slug → UUID resolution goes through `resolveTenantBySlug`. All `cr_*` → UUID resolution goes through `resolveTenantByRelayCreatorId`. Once resolved, business logic uses only the UUID."
   - PR review checklist (paste-ready):
     - [ ] No new FK references `relayCreatorId` or `publicSlug`.
     - [ ] No new RLS policy references `relayCreatorId` or `publicSlug`.
     - [ ] Any new route that takes a slug calls `resolveTenantBySlug` once at the top.
     - [ ] `cr_*` strings appear only in external correlation, env defaults, or API surfaces — never in joins.

5. **Create `src/identity/resolve-tenant.ts`** (or extend an existing identity helper if a natural home exists — note the choice in Delta Out):

   ```ts
   import { prisma } from "../prisma-client"; // adjust import path

   export type TenantRef = {
     /** Immutable UUID/CUID — use this for FKs, RLS context, joins. */
     id: string;
     /** Immutable cross-system correlation key (cr_*). */
     relayCreatorId: string;
     /** Mutable URL slug. */
     publicSlug: string | null;
   };

   /** Slug → TenantRef (or null when no such tenant). Cache-friendly: pure read. */
   export async function resolveTenantBySlug(slug: string): Promise<TenantRef | null> {
     const trimmed = slug.trim();
     if (!trimmed) return null;
     // Adjust the where clause to match the actual public_slug column location.
     // If public_slug lives on CreatorProfile, join through Tenant.users -> CreatorProfile.
     const row = await prisma.tenant.findFirst({
       where: { /* publicSlug-equivalent filter */ },
       select: { id: true, relayCreatorId: true /*, publicSlug: true */ }
     });
     return row ? { id: row.id, relayCreatorId: row.relayCreatorId ?? "", publicSlug: slug } : null;
   }

   /** cr_* → TenantRef. */
   export async function resolveTenantByRelayCreatorId(crId: string): Promise<TenantRef | null> {
     const trimmed = crId.trim();
     if (!trimmed) return null;
     const row = await prisma.tenant.findUnique({
       where: { relayCreatorId: trimmed },
       select: { id: true, relayCreatorId: true }
     });
     return row ? { id: row.id, relayCreatorId: row.relayCreatorId ?? "", publicSlug: null } : null;
   }
   ```

   **Implementation note:** the exact `publicSlug` column may live on `CreatorProfile` or on a future `Tenant.publicSlug` field. Inspect the schema and adjust. If no `publicSlug` column exists yet, this row is **partially blocked** — open a sub-row to add the column, then resume.

6. **Audit existing slug-resolving sites and migrate them to call `resolveTenantBySlug`.** Likely sites:
   - `web/app/patron/c/[handle]/page.tsx` (if it does its own DB lookup) — note: this is server-rendered Next.js, may call the API rather than Prisma directly. If it goes through `/api/v1/...`, the API endpoint is what should call `resolveTenantBySlug`.
   - Any handler in `src/server.ts` whose route is `/api/v1/.../slug/:slug` or similar.

   **Do not** refactor slug-resolution sites that are already correctly one-shot — only consolidate ones that are duplicating the lookup logic inline.

## Acceptance criteria

- [ ] `docs/architecture/url-identity-contract.md` exists with the audit table, the contract, and the PR review checklist.
- [ ] Audit findings show **zero ❌ FK violations** and **zero ❌ RLS violations**. Any found are opened as separate rows and named in Delta Out.
- [ ] `src/identity/resolve-tenant.ts` exists and exports `resolveTenantBySlug` and `resolveTenantByRelayCreatorId`.
- [ ] Existing slug-resolution sites either already use the helper or have been consolidated to use it.
- [ ] Unit tests for the helper: returns `null` on empty/whitespace, returns the correct `TenantRef` on a known slug, returns `null` on an unknown slug.
- [ ] `npm run test` passes at repo root.
- [ ] `npm run build` passes at repo root and in `web/`.

## Out of scope

- **Adding** a `publicSlug` column if none exists — open a separate row.
- Renaming `relayCreatorId` or changing its shape — its immutability is the point of this row.
- URL routing changes — slugs in URLs continue to look the same.
- Caching the resolver result — premature; revisit when slug resolution shows up in profiling.
- Adding RLS policies — that's row 1.2.

## Handoff

Delta Out:
- Audit table summary (counts per category).
- Any ❌ violations found and the row IDs opened to fix them.
- Where the helper landed (`src/identity/resolve-tenant.ts` or alternative location).

Next claimable: `GR-T0-VERIFY-prompt.md` once 0.1, 0.2, 0.3 are also merged.
