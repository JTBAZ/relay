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

## Tenant isolation: RLS vs application filters

**Use both:**

1. **Application layer:** Every query includes explicit `tenant_id` / `creator_id` predicates in NestJS services (defense in depth + clarity).
2. **PostgreSQL RLS (recommended for Part 3):** Policies on patron-scoped tables (`PatronEntitlementSnapshot`, `Favorite`, `Comment`, `Follow`, etc.) using session variables set per request, e.g. `current_setting('app.patron_user_id', true)` or `app.tenant_id`.

**Document** which tables enforce RLS and which connection middleware sets session context. Cross-tenant isolation tests (`road map.md` Part 3 exit gates) should cover RLS + service layer.

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

## External systems

- **Other products** (e.g. separate storefront on Supabase): integrate via **APIs**, not shared database credentials — Relay Postgres stays a **bounded context**.

## Product flags / non-contradictions

- **`tenant_id` vs `creator_id`:** Event contracts require both in the security model. Even single-creator tenants should carry `tenant_id` explicitly to avoid refactors later.
- **Preflight / design archive** (`road map.md`): not production — database design must anchor on **stable Library + entitlement** contracts, not preflight-only routes.
- **No silent conflict with `docs/pattern-library.md`:** viewer-facing queries must use the same semantic pipeline (canonical + overrides + entitlement + layout) as documented there.
