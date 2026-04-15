# Multi-tenant cloud runtime — Supabase, Prisma, Patreon, R2

This document captures the **target runtime architecture** for Relay as a **multi-tenant** platform: **cloud-hosted PostgreSQL** (e.g. **Supabase**), **Supabase Auth** for registration identity, **existing Prisma models** for application data, **Patreon** for creator ownership and fan entitlements, and **object storage** (e.g. **Cloudflare R2**) for media with **server-side** access control.

It complements **[`multi-tenant-option-b.md`](multi-tenant-option-b.md)** (identity shape) and **[`../database/relational-model.md`](../database/relational-model.md)** (relational principles).

---

## Design constraints

1. **Postgres remains the app database.** Prisma migrations apply to Supabase Postgres like any other Postgres; `DATABASE_URL` points at the Supabase project (prefer **pooler** URL for serverless / high concurrency workloads).
2. **Supabase Auth owns “who signed up.”** The app database stores **`Account`** and related rows; **`auth.users.id` (UUID)** must be **linkable** to `Account` (see [Identity linkage](#identity-linkage-supabase-auth--account)).
3. **Patreon remains upstream** for subscriptions; Relay stores **snapshots** and **credential health** so fans are not hard-locked out when Patreon is briefly unavailable.
4. **Paywall logic runs on the backend.** Clients never receive unrestricted R2 URLs for premium assets without passing entitlement checks.

---

## Flow 1 — Registration and identity

| Step | Behavior |
|------|----------|
| Action | User creates an account (email/password, OAuth, etc.). |
| Auth | **Supabase Auth** creates `auth.users` and returns a stable **UUID**. |
| App DB | Create or update **`Account`** so it references that UUID (see [Identity linkage](#identity-linkage-supabase-auth--account)). |
| Patreon | Later, patron linking uses **`Account.patronPatreonUserId`** and **`PatronOAuthCredential`** (encrypted), scoped per [`relational-model`](../database/relational-model.md) OAuth separation rules. |

### Identity linkage (Supabase Auth ↔ `Account`)

Two supported patterns (hybrid migrations are possible if requirements change):

| Pattern | Description |
|---------|-------------|
| **A — External UUID column** | Keep `Account.id` as CUID (or ULID); add **`supabaseUserId`** (UUID, unique, non-null for new users) → `auth.users.id`. |
| **B — Primary key = `auth.users.id`** | Set **`Account.id`** to the Supabase user UUID for new signups; align all FKs. Stronger coupling; cleaner joins; requires careful migration from existing CUIDs. |

**Canonical choice (MIG-00):** **Pattern A** — see [`adr/001-option-b-and-supabase-auth-linkage.md`](adr/001-option-b-and-supabase-auth-linkage.md). Pattern B remains a documented alternative, not the current implementation target.

Patron/creator rows (`TenantMembership`, `User`, etc.) continue to reference **`Account`** and **`Tenant`** as in Option B; only the **link to Supabase** is additive.

### Identity and sessions (Bearer tokens) — MIG-13

Relay uses **two Bearer schemes** that must not be confused in production. The same `Authorization: Bearer …` header is **not** interchangeable: each route family documents which validator applies.

| Scheme | Token | Server validation | Role today |
|--------|--------|-------------------|------------|
| **Supabase Auth access token** | JWT from Supabase (`auth.users`) | [`getSupabaseUserFromAccessToken`](../../src/lib/supabase-auth.ts) (`SUPABASE_URL` + `SUPABASE_ANON_KEY`) | **Only** [`POST /api/v1/auth/supabase/sync`](../../src/server.ts) (MIG-11) — upsert `Account` (`supabaseUserId`), optional patron `TenantMembership`. |
| **Relay patron session** | Opaque string; hashed row in Prisma **`Session`** | `identityService.resolveSession` → `TenantMembership` | Patron fan APIs (e.g. `/api/v1/patron/*`), legacy identity routes that issue or consume opaque sessions. Web stores the opaque token (e.g. `relay_session_token`) and sends it as Bearer. |

**Rules (no duplicate conflicting auth)**

1. Do **not** pass Supabase JWTs into handlers that call **`resolveSession`** unless you implement an explicit, ordered **bridge** (documented + tested). Today those handlers expect **only** opaque Relay sessions.
2. Do **not** pass opaque session strings into **`getSupabaseUserFromAccessToken`** — they are not JWTs and will fail validation.
3. New routes must declare which scheme they use; avoid “try both” without a defined order and error semantics.

**Optional future bridge:** One middleware could try Supabase JWT first (resolve `Account` via `supabaseUserId`), then fall back to `resolveSession`, for a single client-facing Bearer. That is **not** implemented by default; add it as a deliberate feature with tests.

---

## Flow 2 — Creator connection (ownership)

| Step | Behavior |
|------|----------|
| Action | Artist completes **Patreon OAuth** for ingest. |
| Data | Patreon returns **campaign id** and **tokens**. |
| Storage | **Creator** credentials live on **`User` → `ProviderAccount` → `OAuthCredential`** with `purpose` appropriate for creator ingest (`creator_ingest`). Tokens are **encrypted** (`encryptedPayload`, `keyId`). |
| Ownership | **`CreatorProfile.patreonCampaignId`** stores the canonical campaign id. Ingest and webhooks resolve **post → `campaign_id` → creator/tenant** so “campaign Z belongs to user A” is enforceable in application logic. |

**MIG-20 — Supabase-backed DB:** Creator ingest OAuth (`POST /api/v1/auth/patreon/exchange` with **`RELAY_DB_STORE_CREATOR_OAUTH`**) persists via **`DbPatreonTokenStore`**: **`Tenant`** → **`User`** (creator) → **`ProviderAccount`** → **`OAuthCredential`** (`purpose` **`creator_ingest`**). This path does **not** use the global **`Account`** model or **`supabaseUserId`** — Patreon registration identity and fan **`Account`** / Supabase Auth are separate concerns. Pointing **`DATABASE_URL`** at Supabase Postgres is sufficient for schema compatibility; no Supabase Auth prerequisite for creator token storage. Automated contract: `tests/creator-oauth-token-store-db.test.ts`. **Staging check:** after one successful exchange, expect a row in **`oauth_credentials`** for that flow (and encrypted payload present).

**MIG-21 — `campaign_id` → `CreatorProfile` / `Tenant`:** Patreon platform webhooks (`POST /api/v1/webhooks/patreon/platform/:opaqueToken`) extract a numeric **`campaign_id`** from the JSON:API payload and reject (**409**) if it disagrees with (a) the file-based **`patreon_campaign_creator_index.json`** map, or (b) when Prisma is configured, **`CreatorProfile.patreonCampaignId`** joined to **`Tenant.relayCreatorId`**. Incremental autosync (`runIncrementalAutosyncCycle` / `startIncrementalAutosyncWorker`) sets **`CreatorProfile.patreonCampaignId`** after a successful scrape when **`prisma`** is passed (see **`main.ts`** / **`autosync-once.ts`**). Ingest/sync continues to scope work by Relay **`creator_id`**; the DB column is an additional ownership signal for multi-tenant safety. Tests: `tests/campaign-ownership-invariants.test.ts`; webhook routing tests: `tests/patreon-platform-webhook-route.test.ts`.

---

## Flow 3 — Content ingestion (enrichment)

| Step | Behavior |
|------|----------|
| Action | Sync Patreon posts into Relay. |
| Logic | **Upsert** posts and versions via Prisma (`Campaign`, `Post`, `PostVersion`, `Tier`, `PostTier`, etc.) — same as canonical ingest direction in [`relational-model`](../database/relational-model.md). |
| Metadata | **Tier requirements** for access are stored in **`PostTier`** / version **`tierIds`** (and related tier keys), not only in free text. |
| Media | Blobs live in **R2** (or S3-compatible). **`MediaAsset`** (and version JSON) holds **storage keys**, **checksums**, **MIME**, and optionally **public base URL** policy metadata. The database does **not** need to duplicate binary data. |

**MIG-30 — R2 bucket + API tokens:** Configure **`R2_ACCOUNT_ID`**, **`R2_ACCESS_KEY_ID`**, **`R2_SECRET_ACCESS_KEY`**, **`R2_BUCKET`** (see root **`.env.example`**); optional **`R2_ENDPOINT`** / **`R2_REGION`**. Verify with **`npm run r2:smoke`** (S3 PUT + DELETE under `relay-smoke/`). Modules: **`src/storage/r2-config.ts`**, **`src/storage/r2-smoke-upload.ts`**.

**MIG-31 — Media keys + delivery policy:** **`MediaAsset.currentStorageKey`** stores the **current** version’s object key or export-relative path (column `current_storage_key`; version details also in **`versionsJson`**). After a successful **export** (`ExportService`), Relay updates the canonical snapshot via **`applyStorageKeyToCanonicalSnapshot`** so DB-backed canonical stays aligned. Do **not** return unrestricted public R2/S3-style URLs for premium assets without entitlement checks; use **`looksLikePublicDirectObjectStorageUrl`** as a lint/heuristic when reviewing responses. Implementation: **`src/ingest/media-storage-key.ts`**, **`src/storage/media-delivery-policy.ts`**, **`src/export/export-service.ts`**.

**MIG-32 — Idempotent ingest upserts:** **`applySyncBatchToSnapshot`** keys campaigns, tiers, posts, and media revisions so duplicate deliveries do not append duplicate versions or double-count work (`idempotent_skips`). See **[`patreon-ingest-canonical.md`](../patreon-ingest-canonical.md)** § *Sync batches — idempotent upsert* and tests **`ingest-idempotency-apply-batch`**, **`workstream-b.ingest`**.

---

## Flow 4 — Fan unlock (permissions)

| Step | Behavior |
|------|----------|
| Action | Fan requests content (feed, post detail, media). |
| Refresh | Backend uses **patron** Patreon token (**`PatronOAuthCredential`**) to refresh membership where needed; updates **`PatronEntitlementSnapshot`** and/or **`TenantMembership.tierIds`** / **`PatronCampaignAccess`**. |
| Matching | For a **post**, load **required tier(s)** from **`PostTier`** / **`PostVersion`**; compare to **entitled tier ids** for that patron+creator+campaign from snapshots/membership. |
| Policy | If **subscribed at tier ≥ required** (per product rules: tier ordering / “or lower” semantics), allow **high-res** delivery; else return **blurred thumbnail**, **placeholder**, or **signed short-lived URL** only where allowed. |
| Resilience | If Patreon API errors, use **last known** snapshot (`asOf`, `staleAfter`, `CredentialHealth`) with explicit degradation semantics. Clients poll **`GET /api/v1/patron/entitlements/health`** (Bearer) for **`degraded`**, human **`messaging`**, and optional header **`X-Relay-Entitlement-Degraded: 1`** when the DB snapshot is missing or past **`stale_after`**. |

**MIG-40 — Patron OAuth → snapshot + tiers:** The patron “Log in with Patreon” flow calls **`IdentityService.completePatreonPatronOAuth`** → **`DbIdentityStore`** (when **`RELAY_DB_STORE_IDENTITY=1`**). After **`TenantMembership.tierIds`** is written, Relay upserts **`PatronEntitlementSnapshot`** per `(patron_user_id, relay_creator_id)` with **`asOf`**, **`staleAfter`** (default **6h**, override **`RELAY_PATRON_ENTITLEMENT_STALE_AFTER_MS`**), **`source = oauth_exchange`**, **`entitledTierIds`**, **`active`** (true when at least one tier id), and optional **`campaignId`** from **`CreatorProfile.patreonCampaignId`**. Implementation: **`src/identity/patron-entitlement-snapshot.ts`**, wired from **`src/identity/identity-store-db.ts`**. Tests: **`tests/patron-entitlement-snapshot.test.ts`**. Patron access tokens are not persisted today — treat **`staleAfter`** as the hint to re-link or run a future refresh job.

**MIG-41 — Post permission + tier ordering:** Canonical tier rows carry **`amount_cents`**; **`checkPostAccess`** accepts optional **`tierCatalog`** so **`canAccessPost`** treats a patron as entitled when their **pledge floor ≥** the post’s required tier floor (“higher tier unlocks lower-gated posts”). **`evaluatePostPermission`** returns **`allow`**, **`deny`**, or **`locked_preview`** (authenticated patron, wrong tier). HTTP: **`GET /api/v1/patron/permission/post?creator_id=&post_id=`** (Bearer optional). Modules: **`src/gallery/post-permission.ts`**, **`src/clone/tier-rules.ts`**, **`src/identity/access-guard.ts`**, **`src/gallery/patron-media-access.ts`**.

**MIG-42 — Degraded entitlements:** **`buildPatronEntitlementHealthPayload`** ([`src/gallery/entitlement-degraded.ts`](../../src/gallery/entitlement-degraded.ts)) derives **`degraded`** when no **`PatronEntitlementSnapshot`** exists yet or **`stale_after < now`**. **`GET /api/v1/patron/entitlements/health?creator_id=`** (Bearer required, session must match creator) returns **`storage`**, **`patron_entitlement`**, **`messaging`**, and sets **`X-Relay-Entitlement-Degraded`** when degraded. File-backed identity returns **`storage: "file"`** (session-only; no snapshot rows). Tests: **`tests/entitlement-degraded.test.ts`**, **`tests/patron-entitlements-health-route.test.ts`**.

---

## Prisma mapping (quick reference)

| Your concept | Primary models / fields |
|--------------|-------------------------|
| App user ↔ Supabase | `Account` + `supabaseUserId` (pattern A) or `Account.id` (pattern B) |
| Creator owns campaign | `CreatorProfile.patreonCampaignId`, `Tenant`, `User` |
| Creator OAuth | `ProviderAccount`, `OAuthCredential` (creator) |
| Posts / tiers | `Campaign`, `Post`, `PostVersion`, `Tier`, `PostTier` |
| Media metadata / R2 | `MediaAsset` (+ version JSON); keys for signing |
| Patron OAuth | `PatronOAuthCredential` → `Account` |
| Cached entitlements | `PatronEntitlementSnapshot`, `PatronCampaignAccess`, `TenantMembership` |

Exact field names and enums: **`prisma/schema.prisma`**.

---

## Security and delivery

1. **Do not** expose raw R2 paths that bypass auth for premium content; prefer **signed URLs** generated **after** entitlement checks, or **stream through the API**.
2. **Secrets:** Only **encrypted** OAuth payloads in Postgres; encryption keys from env/KMS — see [`../database/operations-and-security.md`](../database/operations-and-security.md).
3. **Multi-tenant queries:** Scope by **`tenant_id`** / **`relay_creator_id`** / **`campaign_id`** consistently to avoid cross-tenant reads.

---

## Supabase-specific notes

- **MIG-51 — Monitoring:** **`GET /api/v1/health/platform`** aggregates DB connection pressure, unhealthy Patreon OAuth rows, stale **`PatronEntitlementSnapshot`** counts, and Supabase **`/auth/supabase/sync`** counters. Details: [`../database/operations-and-security.md`](../database/operations-and-security.md) § *Operational monitoring (MIG-51)*.

- **MIG-52 — Runbook:** Rotate **`DATABASE_URL`** (Supabase DB password), rotate **R2** API tokens, and optional restore/disaster steps — [`../database/operations-and-security.md`](../database/operations-and-security.md) § *Runbook — credentials rotation and recovery (MIG-52)*.

- **MIG-50 — Row Level Security (RLS):** **Skipped** for current architecture: only the Relay API touches **`public`** app data (Prisma + **`DATABASE_URL`**); clients do not use Supabase Data API / `supabase-js` table access for those models. Tenant isolation is **application-layer** + tests; **revisit RLS** if PostgREST, Realtime on app tables, or Edge Functions gain direct scoped access. Canonical write-up: [`../database/operations-and-security.md`](../database/operations-and-security.md) § *Tenant isolation: RLS vs application filters (MIG-50)*.
- **Connection pooling:** Use Supabase **pooler** `DATABASE_URL` for serverless; tune Prisma connection limits.
- **Auth triggers:** Optional: database webhook or Supabase function on `auth.users` insert to create `Account` — must stay **idempotent** and consistent with API-created rows.

---

## Related docs

| Doc | Role |
|-----|------|
| [`adr/001-option-b-and-supabase-auth-linkage.md`](adr/001-option-b-and-supabase-auth-linkage.md) | **MIG-00** — Option B + Pattern A (`supabaseUserId`) decision |
| [`multi-tenant-option-b.md`](multi-tenant-option-b.md) | Identity Option B (`Account`, `Tenant`, `User`, `TenantMembership`) |
| [`supabase-migration-work-items.md`](supabase-migration-work-items.md) | Phased work list for cloud + Auth migration |
| [`../database/relational-model.md`](../database/relational-model.md) | Relational principles, ERD |
| [`../database/AIRTABLE_DB_PIPELINE.md`](../database/AIRTABLE_DB_PIPELINE.md) | DB Integration Pipeline (roadmap runs) — separate from multi-tenant Airtable |
