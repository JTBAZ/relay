# Work items — Supabase cloud + multi-tenant runtime migration

**Agents executing these steps in Airtable:** read **[`MULTI_TENANT_AGENT_ORIENTATION.md`](MULTI_TENANT_AGENT_ORIENTATION.md)** first (queue rules + pasteable preamble).

Phased checklist derived from **[`multi-tenant-cloud-runtime.md`](multi-tenant-cloud-runtime.md)** and **[`multi-tenant-option-b.md`](multi-tenant-option-b.md)**. Use for planning and tracking; adjust IDs if your tracker uses another scheme.

---

## Phase 0 — Baseline

| ID | Work item | Done when |
|----|-----------|-----------|
| **MIG-00** | Confirm **canonical identity pattern** (Option B) and **Supabase Auth linkage pattern** (A: `supabaseUserId` vs B: UUID PK on `Account`) in a short ADR or team decision. | **Done:** [`adr/001-option-b-and-supabase-auth-linkage.md`](adr/001-option-b-and-supabase-auth-linkage.md) — Option B + Pattern A (`supabaseUserId`). |

---

## Phase 1 — Cloud database

| ID | Work item | Done when |
|----|-----------|-----------|
| **MIG-01** | Create **Supabase project** (prod + staging); document project refs (no secrets in repo). | URLs and env **names** in `.env.example`. |
| **MIG-02** | Configure **`DATABASE_URL`** (pooler vs direct) for API and Prisma; document in [`../database/operations-and-security.md`](../database/operations-and-security.md) or architecture README. | **Done:** Supabase § in [`../database/operations-and-security.md`](../database/operations-and-security.md) (pooler vs direct, password, SSL, CI). **Verify:** `npx prisma migrate deploy` with `DATABASE_URL` = staging pooler after DB password in URI matches Supabase **Settings → Database**. |
| **MIG-03** | Run **full migration chain** on Supabase empty DB; verify schema matches `prisma/schema.prisma`. | **Done:** `npx prisma migrate deploy` applied 12 migrations to staging; `prisma migrate status` → schema up to date; `prisma db execute` smoke `SELECT 1` OK. |
| **MIG-04** | **Data migration** from existing Postgres (if any): dump/restore or ETL; validate row counts and FKs for `Account`, `Tenant`, canonical tables. | **Done (N/A):** No legacy Postgres dataset to bulk-move; staging/prod begin empty after migrations. **Rollback posture:** re-point `DATABASE_URL` or restore Supabase backup / new project if a bad cutover ever occurs. |
| **MIG-05** | Update **deployment** (Railway, Fly, etc.) to inject Supabase `DATABASE_URL`; remove reliance on **local-only** DB for production. | **Done:** Coolify prod `DATABASE_URL` → production Supabase pooler; `GET /api/v1/health` → `{"data":{"status":"ok"}}`. |

---

## Phase 2 — Supabase Auth ↔ Prisma `Account`

| ID | Work item | Done when |
|----|-----------|-----------|
| **MIG-10** | Add **schema**: `supabaseUserId` (if pattern A) or migration to UUID PK (if pattern B) + Prisma migration. | **Done:** `Account.supabaseUserId` (`@db.Uuid`, nullable, unique) — migration [`20260412200000_account_supabase_user_id`](../../prisma/migrations/20260412200000_account_supabase_user_id/migration.sql). **Apply:** `npx prisma migrate deploy` on staging + prod. |
| **MIG-11** | Implement **signup / login** path: Supabase Auth creates user → API ensures **`Account`** row (idempotent). | **Done:** `POST /api/v1/auth/supabase/sync` (Bearer or body `access_token`) → `getSupabaseUserFromAccessToken` + `upsertAccountForSupabaseUser`; optional `creator_id` / `tier_ids` for patron `TenantMembership`. Tests: `tests/supabase-account-upsert.test.ts`, `tests/supabase-auth-sync-route.test.ts`. Staging E2E still recommended. |
| **MIG-12** | **Backfill** existing `Account` rows with `auth.users` mapping (admin API or one-time script). | **Done:** `npm run backfill:supabase-user-ids` (needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`); `--dry-run` first. JSON summary: `linked`, `unmatchedEmails` (no Auth user for that email), `accountsWithoutEmail`. Reconcile stragglers manually. |
| **MIG-13** | Unify **session strategy**: Supabase JWT validation in API **or** bridge to existing `Session` model — document single approach in `multi-tenant-cloud-runtime.md` § Identity. | **Done:** [`multi-tenant-cloud-runtime.md`](multi-tenant-cloud-runtime.md) § **Identity and sessions (Bearer tokens) — MIG-13** — two schemes (Supabase JWT vs opaque `Session`); rules for which routes use which; optional future bridge called out as not default. |

---

## Phase 3 — Creator Patreon + ownership

| ID | Work item | Done when |
|----|-----------|-----------|
| **MIG-20** | Verify **OAuth** storage path for creators (`OAuthCredential`, `creator_ingest`) works against Supabase-backed identity (no regressions). | **Done:** Creator ingest uses **`Tenant` / `User` / `OAuthCredential` only** — not `Account` / Supabase Auth (see [`multi-tenant-cloud-runtime.md`](multi-tenant-cloud-runtime.md) Flow 2, MIG-20 note). Tests: `tests/creator-oauth-token-store-db.test.ts`. **Staging:** `RELAY_DB_STORE_CREATOR_OAUTH=1`, valid `RELAY_TOKEN_ENCRYPTION_KEY`, then Patreon OAuth exchange → row in `oauth_credentials`. |
| **MIG-21** | **Webhook + ingest** resolve `campaign_id` → `CreatorProfile` / `Tenant` (ownership invariant tests). | **Done:** [`resolvePatreonWebhookCampaignOwnership`](../../src/patreon/campaign-tenant-resolve.ts) + [`ensureCreatorProfilePatreonCampaignId`](../../src/patreon/campaign-tenant-resolve.ts) (autosync when `prisma` passed). Docs: [`multi-tenant-cloud-runtime.md`](multi-tenant-cloud-runtime.md) Flow 2 (MIG-21). Tests: `tests/campaign-ownership-invariants.test.ts`, `tests/patreon-platform-webhook-route.test.ts`. |

---

## Phase 4 — Ingestion + R2

| ID | Work item | Done when |
|----|-----------|-----------|
| **MIG-30** | **R2** bucket(s) and IAM/API tokens in secrets manager; env names in `.env.example`. | **Done:** `.env.example` documents `R2_*` vars; [`src/storage/r2-config.ts`](../../src/storage/r2-config.ts), [`src/storage/r2-smoke-upload.ts`](../../src/storage/r2-smoke-upload.ts); **`npm run r2:smoke`** (PUT+DELETE). Ops: [`docs/database/operations-and-security.md`](../database/operations-and-security.md) § Cloudflare R2. |
| **MIG-31** | **Media pipeline**: persist **keys / URLs** on `MediaAsset` (and versions) per relational model; no premium **direct public** R2 URLs without checks. | **Done:** `MediaAsset.currentStorageKey` (`current_storage_key`); ingest + `DbCanonicalStore` round-trip; export calls [`applyStorageKeyToCanonicalSnapshot`](../../src/ingest/media-storage-key.ts) after blob write. Policy helper [`looksLikePublicDirectObjectStorageUrl`](../../src/storage/media-delivery-policy.ts). Tests: `tests/media-delivery-policy.test.ts`, `tests/media-storage-key.test.ts`. **Apply:** `npx prisma migrate deploy` (migration `20260412213000_media_asset_current_storage_key`). |
| **MIG-32** | **Upsert** path for posts/tiers validated under load (idempotent ingest). | **Done:** Idempotency keys + behavior documented in [`patreon-ingest-canonical.md`](../../patreon-ingest-canonical.md) § *Sync batches — idempotent upsert*. Tests: [`tests/ingest-idempotency-apply-batch.test.ts`](../../tests/ingest-idempotency-apply-batch.test.ts) (unit), [`tests/workstream-b.ingest.test.ts`](../../tests/workstream-b.ingest.test.ts) (HTTP). |

---

## Phase 5 — Fan entitlements + paywall

| ID | Work item | Done when |
|----|-----------|-----------|
| **MIG-40** | **Patron OAuth refresh** writes **`PatronEntitlementSnapshot`** / membership tier fields with `asOf` / `staleAfter`. | **Done:** **`DbIdentityStore`** upserts **`PatronEntitlementSnapshot`** on create/update of **`TenantMembership.tierIds`** from patron OAuth (`source = oauth_exchange`). **`RELAY_PATRON_ENTITLEMENT_STALE_AFTER_MS`** (optional, default 6h). Code: [`src/identity/patron-entitlement-snapshot.ts`](../../src/identity/patron-entitlement-snapshot.ts), [`src/identity/identity-store-db.ts`](../../src/identity/identity-store-db.ts). Tests: [`tests/patron-entitlement-snapshot.test.ts`](../../tests/patron-entitlement-snapshot.test.ts). **Staging:** `RELAY_DB_STORE_IDENTITY=1`, complete patron OAuth → row in **`patron_entitlement_snapshots`**. |
| **MIG-41** | **Permission API**: given `Account` + post, enforce tier rule (including “tier or lower” product semantics). | **Done:** Pledge ordering in [`canAccessPost`](../../src/clone/tier-rules.ts) + `tierCatalog`; [`evaluatePostPermission`](../../src/gallery/post-permission.ts); **`GET /api/v1/patron/permission/post`**. Tests: [`tests/tier-rules-ordering.test.ts`](../../tests/tier-rules-ordering.test.ts), [`tests/post-permission.test.ts`](../../tests/post-permission.test.ts), [`tests/patron-media-export-access.test.ts`](../../tests/patron-media-export-access.test.ts), [`tests/patron-permission-route.test.ts`](../../tests/patron-permission-route.test.ts). |
| **MIG-42** | **Degraded mode**: Patreon API down → use last snapshot + explicit client messaging / logging. | **Done:** [`buildPatronEntitlementHealthPayload`](../../src/gallery/entitlement-degraded.ts); **`GET /api/v1/patron/entitlements/health`** + **`X-Relay-Entitlement-Degraded`**; Flow 4 **Resilience** row in [`multi-tenant-cloud-runtime.md`](multi-tenant-cloud-runtime.md). Tests: [`tests/entitlement-degraded.test.ts`](../../tests/entitlement-degraded.test.ts), [`tests/patron-entitlements-health-route.test.ts`](../../tests/patron-entitlements-health-route.test.ts). |

---

## Phase 6 — Hardening

| ID | Work item | Done when |
|----|-----------|-----------|
| **MIG-50** | **RLS** decision: skip (API-only) vs add policies for any direct Supabase access; if RLS, policies + Prisma role strategy documented. | **Done:** **API-only** — no PostgREST / browser `supabase-js` CRUD on Prisma tables; RLS not deployed. [`../database/operations-and-security.md`](../database/operations-and-security.md) § *Tenant isolation: RLS vs application filters (MIG-50)*; [`multi-tenant-cloud-runtime.md`](multi-tenant-cloud-runtime.md) § *Supabase-specific notes* (MIG-50). Formal security review optional before exposing Data API / Realtime on app data. |
| **MIG-51** | **Monitoring**: DB connections, Auth errors, Patreon credential health, snapshot age. | **Done:** **`GET /api/v1/health/platform`** ([`src/health/platform-operations-metrics.ts`](../../src/health/platform-operations-metrics.ts), [`src/health/auth-route-metrics.ts`](../../src/health/auth-route-metrics.ts)); Supabase sync route records outcomes. Ops: [`../database/operations-and-security.md`](../database/operations-and-security.md) § Operational monitoring. Tests: [`tests/platform-operations-metrics.test.ts`](../../tests/platform-operations-metrics.test.ts), [`tests/health-platform-route.test.ts`](../../tests/health-platform-route.test.ts). |
| **MIG-52** | **Runbook**: rotate DB password, rotate R2 keys, Supabase project restore drill (optional). | **Done:** [`../database/operations-and-security.md`](../database/operations-and-security.md) § *Runbook — credentials rotation and recovery (MIG-52)*. |

---

## Dependency hints

- **MIG-01–03** before **MIG-10** (need cloud DB for Auth-linked data).
- **MIG-10–12** before relying on Supabase-only login in production.
- **MIG-40–41** can proceed in parallel with **MIG-30–31** once creators exist on staging.

---

## Related implementation batches

- **Airtable — Multi Tenant Changes** (Relay Database Tracker, base `appDbIOVX38X6U8Sf`, table `tbl9PWH9Q0tvKOmKa`): each **MIG-** step above is a row (**Sort order** 1–21 at top of queue); **Doc reference** points at this file on `main`. See [`AIRTABLE_MULTI_TENANT_CHANGES.md`](AIRTABLE_MULTI_TENANT_CHANGES.md).
- **Multi-tenant runs (MT-001…):** [`multi-tenant-runs/README.md`](multi-tenant-runs/README.md) — identity and schema alignment in-repo (follows MT-* rows in the same table after MIG rows).
- **DB Integration Pipeline** (Postgres integration roadmap): separate table in Relay Database Tracker — [`../database/AIRTABLE_DB_PIPELINE.md`](../database/AIRTABLE_DB_PIPELINE.md).
