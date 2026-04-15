# Indexes, security, RLS, and analytics alignment

## Prisma Migrate (CI and rollback)

- **CI:** `.github/workflows/ci.yml` runs `npx prisma migrate deploy` after `npm ci` and `npm run db:generate`, using an **ephemeral Postgres 16** service (connection string matches the host port in root `.env.example`). For pipelines that target a **shared hosted** database, inject `DATABASE_URL` from your platform’s **secret store** (e.g. GitHub Actions **repository secrets**) and point the migrate step at that URL instead of the job-local service.
- **Local Windows:** `.\scripts\db-migrate.ps1` wraps `prisma migrate dev` from the repo root (see `scripts/README.md`).
- **Rollback / failed migration state:** If a migration fails partway and leaves the database out of sync with `_prisma_migrations`, do **not** re-run the same migration blindly. After you have manually reverted the database to a known-good state (or restored from backup), mark the migration as rolled back so Prisma Migrate can proceed:

  ```bash
  npx prisma migrate resolve --rolled-back MIGRATION_DIR_NAME
  ```

  Use **`MIGRATION_DIR_NAME`** exactly as the folder under `prisma/migrations/` (e.g. `20250410182900_baseline_init`). Use this when the migration **did not** complete successfully and you have undone its effects (or abandoned that attempt). For a migration that **succeeded** but should be treated as reverted in history only in exceptional cases, prefer restoring from backup or adding a corrective forward migration; `migrate resolve` is for fixing **migration history** vs reality after operator intervention.

## Connection pooling (deployment)

The Node process uses **`pg`** with Prisma’s connection pool (see `src/lib/db.ts`). For **serverless** or **very high** connection churn, add a pooler in front of Postgres:

| Option | When to use |
|--------|-------------|
| **Built-in Prisma + `pg` pool** | Default for long-lived API processes (`npm start`); tune `DATABASE_URL` query params if your host documents them (e.g. `connection_limit`, `pool_timeout` — follow Prisma + driver docs for your version). |
| **PgBouncer** (transaction or session mode) | Multiple app instances or serverless workers; **transaction mode** is common for Prisma if [documented constraints](https://www.prisma.io/docs/guides/performance-and-optimization/connection-management) are met. |
| **Prisma Accelerate** | Managed connection pooling + caching; paid Prisma Data Platform. |

**Rule of thumb:** one pool per deployable API service; avoid opening a new `PrismaClient` per request. Document the chosen approach in your runbook next to **`npx prisma migrate deploy`** (required on each release before traffic).

### Supabase (`DATABASE_URL`) — pooler vs direct (MIG-02)

Relay uses a single **`DATABASE_URL`** for Prisma (`prisma.config.ts`) and the API (`src/lib/db.ts` + `@prisma/adapter-pg`). For Supabase-hosted Postgres, pick **one** connection mode per environment and paste the URI from the Supabase dashboard (**Connect**).

| Mode | When to use | Typical shape |
|------|----------------|---------------|
| **Transaction pooler** (Shared pooler / port **6543**) | **Default** for the Relay API and for **`npx prisma migrate deploy`** against Supabase. Matches stateless / many-short-connections workloads. | Host like `aws-0-REGION.pooler.supabase.com`; user often `postgres.<project-ref>`. |
| **Direct** (port **5432**) | Long-lived tools, troubleshooting, or if migrations fail against the pooler (uncommon). | Host `db.<project-ref>.supabase.co`; user `postgres`. |

**Password:** Use the **database** password from **Project Settings → Database** in Supabase (not the anon JWT or `sb_secret` API keys). The URI from **Connect** usually contains `[YOUR-PASSWORD]` — replace it with that password.

**SSL:** Connections require TLS. Prefer the URI exactly as Supabase shows it; if `pg` / Prisma errors on SSL, append query params per [Prisma Postgres connection URLs](https://www.prisma.io/docs/orm/reference/connection-urls#postgresql) (e.g. `?sslmode=require`).

**Staging vs production:** Use separate Supabase projects; set **`DATABASE_URL`** on each deploy to that project’s pooler URI (see root `.env.example`).

**CI:** `.github/workflows/ci.yml` runs **`prisma migrate deploy`** against **ephemeral Postgres**, not Supabase. Hosted staging/prod pipelines should inject **`DATABASE_URL`** from a secret store (see comment at top of `ci.yml`).

**Verify after first Supabase apply (MIG-03):** `npx prisma migrate status` should report the database in sync with `prisma/migrations`. Optional smoke: `echo SELECT 1 | npx prisma db execute --stdin` (or run the same in the Supabase SQL Editor).

## Indexes (initial targets)

- **Posts / timelines:** `(campaign_id, created_at DESC)` or `(creator_id, published_at DESC)` depending on final shape; support cursor pagination.
- **Patron feed:** consider `FeedCursor` (`patron_user_id`, cursor key, `last_seen_at`) and/or fan-out tables if scale requires — document chosen strategy when implemented.
- **Entitlements:** unique `(patron_user_id, creator_id)` on `PatronEntitlementSnapshot`; partial index on `active = true` if useful for hot paths.
- **Engagement:** `(creator_id, post_id)` on `Comment` for moderation; `(patron_user_id, created_at DESC)` on `Favorite`.
- **Discovery audit:** `DiscoveryDecisionLog(created_at DESC)` — see partitioning below.

## Partitioning (scale)

- **Discovery decision logs:** insert-heavy, audit-focused → monthly partitions on `created_at`.
- **Analytics snapshots (`analytics_snapshots`):** insert volume is typically modest per creator; **no partition DDL is shipped in M6**. Revisit **monthly partitions on `period_start` or `generated_at`** (or hash by `creator_id`) when row counts or retention policy justify the operational overhead. Until then, the compound index `(creator_id, kind, period_start, period_end)` supports listing by creator and period. Document actual partition DDL in a forward migration when introduced (Prisma may require `@@ignore` + raw SQL for declarative partitioning).
- **Event/outbox tables** (if used): time-based partitions for retention rolloff.

Document actual partition DDL in migrations when introduced — Prisma may need `@@ignore` or raw SQL for declarative partitioning.

## Tenant isolation: RLS vs application filters (MIG-50)

**Decision:** Relay’s **`public`** schema is read and written **only** by the Relay API via Prisma, using the PostgreSQL user embedded in **`DATABASE_URL`** (Supabase **pooler** or direct — see § *Supabase* above). Browsers and other clients use **HTTP** to `/api/v1/...` only; they **do not** query Postgres through Supabase **PostgREST**, **Realtime** subscriptions on app tables, or **`supabase-js` `.from()`** against Relay models. In-repo **`@supabase/supabase-js`** usage is limited to **Supabase Auth** (JWT validation) and **operator scripts** (service role for `auth.users` backfill), not CRUD on Prisma-backed tables.

**Row Level Security (RLS) is intentionally not enabled** on Relay application tables for this deployment model. Isolation is enforced in **application code** (explicit `tenant_id` / `creator_id` / patron scoping in services) plus tests such as **`tests/m10-cross-tenant-isolation.test.ts`**, and by keeping **`DATABASE_URL`** out of client bundles.

**Revisit RLS** if you later expose **`public`** data to the **anon** / **authenticated** roles (Data API), attach **Realtime** to app tables, or add **Edge Functions** that use a non–superuser role subject to JWT claims — in those cases, add policies (often duplicating app rules) and document the **Prisma** database role vs migration role.

**Optional hardening (not required for MIG-50):** A restricted PostgreSQL role with only needed DML on selected tables, or session-variable RLS, if compliance demands defense-in-depth beyond the API.

## Encryption and PII

- **OAuth:** Store only **encrypted** material in `OAuthCredential.encryptedPayload` (or KMS equivalent) with **`keyId`** for rotation. Align with `RELAY_TOKEN_ENCRYPTION_KEY` / `src/lib/crypto.ts` patterns in `.env.example` — never log plaintext tokens (`docs/qa/UX_ACCEPTANCE_GUARDRAILS.md`).
- **Sessions:** Store **hashes** of opaque session tokens, not raw tokens. Follow `docs/cookie-auth-legal-rationale.md` and builder-boost standards where referenced.
- **Email / PII:** Minimize columns; prefer hashed identifiers where sufficient for correlation.
- **Webhooks / API secrets:** Dedicated narrow tables with envelope encryption — not duplicated in analytics.

## Retention

- Define TTL policies for **logs**, **discovery decision rows**, and **raw analytics events** (if stored) separately from **authoritative** business entities. Legal holds and export/deletion flows should reference stable user/creator IDs.

## Analytics and Action Center alignment

- **Minimum data model** per `analytics-action-center-spec.md`: snapshots, cohort/content metrics, recommendations, actions, outcomes — map to `AnalyticsSnapshot`, `RecommendationRecord`, and related action/outcome tables as you add them.
- **Event contracts** (`builder-boost-pack/contracts/events.md`): envelope includes `tenant_id`, `event_name`, `occurred_at`, `primary_id` for idempotency. Consider an **outbox** table:

  - Unique on `(event_name, tenant_id, primary_id, occurred_at)` or the dedup rule from the contract doc.

- **Growth analytics** long-term vision: `docs/growth-analytics-features.md` — aggregated/pseudonymous tables first; no tokens in analytics paths.

- **Estimated metrics:** store **label + methodology** on snapshot rows so Workstream E “estimated” figures remain explainable in-product (`road map.md`).

## Cloudflare R2 (object storage, MIG-30)

- **Purpose:** Media blobs and export artifacts target **S3-compatible** storage; Relay Postgres holds **keys** and metadata (`MediaAsset`, etc.) — see [`relational-model.md`](relational-model.md) and [`../architecture/multi-tenant-cloud-runtime.md`](../architecture/multi-tenant-cloud-runtime.md).
- **Credentials:** Create an **R2 API token** (S3 access key + secret) in the Cloudflare dashboard; store values only in the deployment **secrets manager**, not in git.
- **Env names** (root `.env.example`): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, optional `R2_ENDPOINT` (override) and `R2_REGION` (default `auto`).
- **Endpoint:** `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com` unless `R2_ENDPOINT` is set.
- **Smoke test:** `npm run r2:smoke` — uploads then deletes a tiny object under `relay-smoke/` using `@aws-sdk/client-s3` ([`src/storage/r2-smoke-upload.ts`](../../src/storage/r2-smoke-upload.ts)).

## Operational monitoring (MIG-51)

- **`GET /api/v1/health/platform`** — scrape-friendly JSON (`successEnvelope`) for alerts/dashboards: **PostgreSQL** connectivity, **`pg_stat_activity`** count for this database vs **`max_connections`** (alert if ≥ ~90% use), **creator** and **patron** **`OAuthCredential`** rows with `health_status` not `healthy`, **`patron_entitlement_snapshots`** row count + count past **`stale_after`** + oldest **`as_of`**, and in-process counters for **`POST /api/v1/auth/supabase/sync`** (success / auth error / other error; **reset on process restart**).
- Use **`GET /api/v1/health`** for simple liveness; keep **Workstream** health routes (`/api/v1/health/ingest`, `part1a`, `export`, `analytics`) for domain metrics.
- **Durable** auth failure auditing: forward API access logs to your observability stack; in-memory counters complement but do not replace log-based alerts.

## Runbook — credentials rotation and recovery (MIG-52)

Use this for **staging** first, then **production**. Keep secrets only in your host’s **secret store** or vault — never in git, Airtable cells, or chat logs.

### 1. Rotate PostgreSQL password (Supabase / `DATABASE_URL`)

1. In **Supabase** → **Project Settings** → **Database**, generate or set a **new database password** (this is the password embedded in the Postgres URI, not the Supabase **service role** JWT).
2. Build a new **`DATABASE_URL`** using **Connect** in the dashboard (pooler **6543** recommended for the API — see § *Supabase (`DATABASE_URL`)* above). Replace `[YOUR-PASSWORD]` with the new password; keep **`sslmode=require`** (or equivalent) if your client requires it.
3. Update the secret in your deployment platform (Coolify, Railway, etc.) and **redeploy** the Relay API so all instances pick up the new URI.
4. **Verify:** `npx prisma migrate status` against the new URL (should show *up to date*); `GET /api/v1/health/platform` should show `database.connectivity_ok: true`; smoke-test a read path (e.g. `GET /api/v1/health`).
5. **Rollback:** If the app cannot connect, revert the secret to the previous password in the host (short window) or restore from Supabase backup (see below) — document who is on-call.

### 2. Rotate Cloudflare R2 API keys (`R2_*`)

1. In **Cloudflare** → **R2** → your bucket → **Manage R2 API Tokens**, create a **new** token with the same permissions the app needs (S3-compatible read/write for the bucket used by Relay).
2. Update **`R2_ACCESS_KEY_ID`** and **`R2_SECRET_ACCESS_KEY`** in the deployment secret store. **`R2_ACCOUNT_ID`**, **`R2_BUCKET`**, and optional **`R2_ENDPOINT`** usually stay unchanged unless you moved buckets.
3. **Redeploy** (or rolling restart) so all workers use the new keys.
4. Run **`npm run r2:smoke`** from an environment with the new env vars (see § *Cloudflare R2* above).
5. **Revoke** the old API token in Cloudflare once traffic is healthy.

### 3. Optional — Supabase restore / disaster drill

Use this as a **tabletop or staging drill**; production restores should follow your org’s incident process.

| Scenario | Actions |
|----------|---------|
| **Bad migration / bad deploy** | Restore DB to a known-good snapshot if available (Supabase **Backups** / PITR on supported plans), or create a **new** Supabase project and restore a logical dump. Re-run **`npx prisma migrate deploy`** only if the restored DB is empty or history matches; otherwise use **`prisma migrate resolve`** per § *Prisma Migrate* above. |
| **Lost `DATABASE_URL` secret** | Reset DB password in Supabase (step 1) and re-inject `DATABASE_URL`. |
| **Full project loss** | Create a new Supabase project, set **`DATABASE_URL`** and Auth env (`SUPABASE_URL`, keys per `.env.example`), run **`npx prisma migrate deploy`**, restore data from backup or ETL, then cut over DNS / env on the API. |

**After any restore:** confirm **`GET /api/v1/health/platform`**, **`GET /api/v1/health`**, and a minimal patron/creator flow in **staging** before promoting.

## Account-first onboarding — staging checklist (MT-037)

Human gate before promoting **staging → production** for the Option B web + API path: one artist completes **Supabase sign-in → workspace → Patreon prepare → OAuth exchange → scrape** without relying on a mismatched **`NEXT_PUBLIC_RELAY_CREATOR_ID`**.

**API / secrets (host secret store — names only in git):**

| Variable | Role |
|----------|------|
| `RELAY_ENFORCE_CREATOR_OAUTH_BIND` | When enabled, creator Patreon OAuth exchange requires signed `state` + Bearer session + owned `relay_creator_id`. |
| `RELAY_PATREON_OAUTH_STATE_SECRET` | Signs `prepare` OAuth `state` (min 16 chars). |
| `RELAY_DB_STORE_CREATOR_OAUTH` | Persist creator Patreon tokens (with encryption key below). |
| `RELAY_TOKEN_ENCRYPTION_KEY` (or project-specific name in `.env.example`) | Encrypts OAuth payloads at rest. |
| `SUPABASE_URL` / JWT verification env (see root `.env.example`) | API validates Supabase access tokens on sync / relay-session. |
| `NEXT_PUBLIC_RELAY_API_URL` | Next.js browser → Relay API base (no trailing slash). |

**Web (Coolify / Vercel-style):** `NEXT_PUBLIC_SUPABASE_*` (URL + anon key), optional `NEXT_PUBLIC_RELAY_STUDIO_AUTH_DISABLED` **off** in staging when testing real sign-in.

**Regression:** `npm run test` (root); `npm run lint` / `npm run build` in `web/` when the Next app changes. Integration smoke: `tests/account-first-onboarding-smoke.test.ts` (MT-037).

## External systems

- **Other products** (e.g. separate storefront on Supabase): integrate via **APIs**, not shared database credentials — Relay Postgres stays a **bounded context**.

## Product flags / non-contradictions

- **`tenant_id` vs `creator_id`:** Event contracts require both in the security model. Even single-creator tenants should carry `tenant_id` explicitly to avoid refactors later.
- **Preflight / design archive** (`road map.md`): not production — database design must anchor on **stable Library + entitlement** contracts, not preflight-only routes.
- **No silent conflict with `docs/pattern-library.md`:** viewer-facing queries must use the same semantic pipeline (canonical + overrides + entitlement + layout) as documented there.
