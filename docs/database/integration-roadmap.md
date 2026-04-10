# Database integration roadmap

**Objective:** Replace all `.relay-data/` file-backed stores with PostgreSQL + Prisma, add tables for future build structures not yet implemented, and leave open, well-typed stubs where logic is known but not yet built.

**Source of truth for product intent:** [`road map.md`](../../road%20map.md).
**Schema reference:** [`relational-model.md`](relational-model.md).
**Migration mapping:** [`migration-from-relay-data.md`](migration-from-relay-data.md).

---

## Codebase reality check (state vs roadmap)

### What is built and file-backed today

Every `File*Store` in `src/` follows the same pattern: `load → mutate in memory → save`. All are wired into `createApp()` in `src/server.ts`. The injection points are clean.

| Store class | File | Roadmap workstream |
|-------------|------|--------------------|
| `FilePatreonTokenStore` | `patreon_credentials.json` | Part 1 A (creator OAuth) |
| `FileCanonicalStore` | `canonical.json` | Part 1 B (ingest) |
| `SyncWatermarkStore` | `patreon_sync_watermarks.json` | Part 1 B |
| `PatreonSyncHealthStore` | `patreon_sync_health.json` | Part 1 B |
| `FileGalleryOverridesStore` | `gallery_post_overrides.json` | Part 1 D |
| `FileCollectionsStore` | `collections.json` | Part 1 D |
| `FileSavedFiltersStore` | `gallery_saved_filters.json` | Part 1 D |
| `FilePageLayoutStore` | `page_layout.json` | Part 1 D / Designer |
| `FileAnalyticsStore` | `analytics.json` | Part 1 E |
| `FileIdentityStore` | `identity.json` | Part 1 A / Part 2 G |
| `FileDeadLetterQueue` | `ingest_dlq.json` | Part 1 B |
| `FilePatronFavoritesStore` | `patron_favorites.json` | Part 3 O |
| `FilePatronCollectionsStore` | `patron_collections.json` | Part 3 O |
| `FilePaymentStore` | `payments.json` | Part 2 H |
| `FileMigrationStore` | `migrations.json` | Part 2 I |
| `FileDeployStore` | `deploys.json` | Part 2 J |
| `FileCloneSiteStore` | `clone_sites.json` | Part 2 F |

### What is built but NOT durable

- **`InMemoryEventBus`**: Events matching `builder-boost-pack/contracts/events.md` are published in memory and lost on restart. No persistence layer exists.

### What is NOT YET BUILT (future pipes to leave open)

| Concept | Roadmap reference | DB implication |
|---------|-------------------|----------------|
| Patron OAuth token persistence | Part 3 K — "next: optional persistence of patron refresh tokens" | Separate `OAuthCredential` row with `purpose = patron_entitlement` |
| Follow graph | Part 3 K | `Follow` table |
| Patron entitlement snapshots | Part 3 L — materialized tier access for feed | `PatronEntitlementSnapshot` table |
| Feed cursors | Part 3 L | `FeedCursor` table |
| Comments + moderation | Part 3 O | `Comment` table with soft-delete + `ModState` |
| Discovery decision log | Part 3 L, M | `DiscoveryDecisionLog` (partitioned) |
| Notification preferences | Part 3 K | `NotificationPreference` table |
| Smart Tag Assistant embeddings | Part 1 ledger | `Embedding` table, tenant-partitioned; pgvector or sidecar |
| Patron profile metadata | Part 3 K | `PatronProfile` extension on `User` |
| Webhook metadata (encrypted) | Existing `patreon_webhook_metadata.json` | Dedicated encrypted table, separate from user rows |
| Campaign creator index | `patreon_campaign_creator_index.json` | Index on `CreatorProfile.patreonCampaignId` |

---

## Integration strategy

Each `File*Store` is replaced by a `Db*Store` that satisfies **the same TypeScript interface**. Consumers in `src/server.ts` see no difference — only the concrete class injected changes. This makes cutover per-domain, testable, and reversible.

Feature flag per domain: `RELAY_DB_STORE_<DOMAIN>=1` (e.g. `RELAY_DB_STORE_IDENTITY=1`). Dual-write bridges exist during transition.

---

## Plan

Notation:
- `[FOUNDATIONAL]` — must complete before dependent milestones start
- `[SEQUENTIAL]` — items within a phase must run in order
- `[PARALLEL]` — items within a phase have no shared dependencies and may run concurrently
- `[OPEN PIPE]` — schema or stub defined now; application logic comes later

---

## Milestone 1 — Infrastructure and connectivity `[FOUNDATIONAL]`

*Everything else depends on this milestone being complete and stable.*

### Phase 1.1 — Local and CI environment `[SEQUENTIAL]`

| # | Work item | Notes |
|---|-----------|-------|
| 1.1.1 | Add `docker-compose.yml` with a Postgres service | Use `postgres:16-alpine`; expose on `5432`; mount named volume for local dev persistence |
| 1.1.2 | Add `DATABASE_URL` to `.env.example` and `.gitignore` | Pattern: `postgresql://relay:relay@localhost:5432/relay_dev` |
| 1.1.3 | Add `DATABASE_URL` to `web/.env.local.example` (if Next.js needs direct DB access) | Only if server-side DB path is added to `web/`; otherwise skip |
| 1.1.4 | Add `docker-compose` start step to `scripts/` and local dev README | `docker-compose up -d` as prerequisite for `npm start` |

### Phase 1.2 — Prisma setup `[SEQUENTIAL]`

| # | Work item | Notes |
|---|-----------|-------|
| 1.2.1 | `npm install prisma @prisma/client` at repo root | Add as `devDependency` for Prisma CLI, `dependency` for `@prisma/client` |
| 1.2.2 | `npx prisma init` — generate `prisma/schema.prisma` with `datasource db { provider = "postgresql" }` | Starting schema: just the `datasource` and `generator` blocks |
| 1.2.3 | Add `prisma/` to `.gitignore` exclusions carefully — **commit schema, exclude local lock files if any** | |
| 1.2.4 | Add `npm run db:migrate` (`prisma migrate dev`), `npm run db:push` (`prisma db push`), `npm run db:generate` (`prisma generate`) to root `package.json` | |
| 1.2.5 | Add `npx prisma generate` to `npm run build` pre-step | Ensures client is always regenerated in CI |

### Phase 1.3 — Prisma client singleton `[SEQUENTIAL]` (depends on 1.2)

| # | Work item | Notes |
|---|-----------|-------|
| 1.3.1 | Create `src/lib/db.ts` — singleton `PrismaClient` with connection logging in dev | Use `globalThis.__prisma` pattern to prevent connection pool explosion during hot-reload |
| 1.3.2 | Add graceful `$disconnect` in `src/main.ts` shutdown handler | Match existing `process.on('SIGTERM')` / `SIGINT` pattern |
| 1.3.3 | Add `src/lib/db.ts` to build output and confirm it resolves in `npm run build` | |

### Phase 1.4 — Migration CI `[SEQUENTIAL]` (depends on 1.2)

| # | Work item | Notes |
|---|-----------|-------|
| 1.4.1 | Add a `prisma migrate deploy` step to CI pipeline (runs against a test DB) | Use `DATABASE_URL` from CI env secrets |
| 1.4.2 | Document rollback procedure: `prisma migrate resolve --rolled-back <migration>` in `docs/database/operations-and-security.md` | |
| 1.4.3 | Add `scripts/db-migrate.ps1` (Windows dev helper) calling `npx prisma migrate dev` | Mirrors existing `scripts/` conventions |

---

## Milestone 2 — Identity and sessions `[SEQUENTIAL after M1]`

*Highest-priority cutover: sessions are security-sensitive, file reads are a concurrent-write risk, and patron OAuth (Part 3) builds on top of this table.*

### Phase 2.1 — Schema `[SEQUENTIAL]`

| # | Work item | Notes |
|---|-----------|-------|
| 2.1.1 | Add `Tenant`, `User`, `Session`, `ProviderAccount`, `OAuthCredential`, `CreatorProfile`, `PatronProfile` to `prisma/schema.prisma` | See `relational-model.md`; add `legacy_file_id` columns on `User` and `Session` for backfill tracing |
| 2.1.2 | `prisma migrate dev --name identity_sessions` | First real migration |
| 2.1.3 | Add indexes: `(tenantId, kind)` on `User`; `(userId, expiresAt)` on `Session`; `(provider, providerUserId)` unique on `ProviderAccount` | |

### Phase 2.2 — Db store implementations `[PARALLEL within phase]` (depends on 2.1)

| # | Work item | Notes |
|---|-----------|-------|
| 2.2.1 | Write `DbIdentityStore` in `src/identity/identity-store-db.ts` satisfying same interface as `FileIdentityStore` | Methods: `createUser`, `findByEmail`, `findByPatreonId`, `getUser`, `updateTiers`, `createSession`, `getSession`, `deleteSession` |
| 2.2.2 | Store session **token hash** only (`sha256` of raw token); keep raw token only in memory / response | Aligns with `operations-and-security.md` |
| 2.2.3 | Write `DbPatreonTokenStore` in `src/auth/token-store-db.ts` for creator OAuth credentials | `OAuthCredential.purpose = creator_ingest`; `encryptedPayload` = same AES-GCM blob as `FilePatreonTokenStore` |

### Phase 2.3 — Wiring and dual-write `[SEQUENTIAL]` (depends on 2.2)

| # | Work item | Notes |
|---|-----------|-------|
| 2.3.1 | In `src/server.ts`, inject `DbIdentityStore` when `RELAY_DB_STORE_IDENTITY=1`, else keep `FileIdentityStore` | No consumer code changes |
| 2.3.2 | Backfill via `scripts/backfill-identity.mjs` (implementation `src/identity/backfill-identity-from-file.ts`) reading `identity.json` and upserting into DB | One-time; idempotent; `npm run backfill:identity`; records `legacy_file_id` on each row |
| 2.3.3 | Add parity test: run backfill, query DB, compare to file output for all users/sessions | Gate for cutover |
| 2.3.4 | Set `RELAY_DB_STORE_IDENTITY=1` in staging; run acceptance tests per `docs/qa/UX_ACCEPTANCE_GUARDRAILS.md` | |
| 2.3.5 | Enable in production; remove `FileIdentityStore` fallback after 2-week soak | |

---

## Milestone 3 — Canonical content `[SEQUENTIAL after M1; PARALLEL with M2]`

*The largest migration. Everything in the gallery, analytics, and patron surfaces references canonical IDs. No foreign-key dependencies on M2 (IDs are strings, resolved at service layer).*

### Phase 3.1 — Schema `[SEQUENTIAL]`

| # | Work item | Notes |
|---|-----------|-------|
| 3.1.1 | Add `Campaign`, `Post`, `PostVersion`, `MediaAsset`, `Tier`, `PostTier` to `prisma/schema.prisma` | Preserve `post_id`, `media_id`, `tier_id` values from file as stable IDs — use `@id @default(cuid())` only for new rows; store `provider_post_id` for ingest idempotency |
| 3.1.2 | Add `SyncCursor` (replaces `SyncWatermarkStore`) and `CreatorSyncState` (replaces `PatreonSyncHealthStore`) | |
| 3.1.3 | Add `IngestIdempotencyKey` table — replaces the `ingest_idempotency` map inside `canonical.json` | `(creator_id, batch_key)` unique; `first_seen_at` |
| 3.1.4 | `prisma migrate dev --name canonical_content` | |
| 3.1.5 | Add indexes: `(campaignId, createdAt DESC)` on `Post`; `(postId)` on `MediaAsset`; `(creatorId, providerTierId)` unique on `Tier` | |

### Phase 3.2 — Db store implementations `[PARALLEL within phase]` (depends on 3.1)

| # | Work item | Notes |
|---|-----------|-------|
| 3.2.1 | Write `DbCanonicalStore` — `src/ingest/canonical-store-db.ts` — implementing `load()`, `save()`, `mutate()` semantics against Postgres | Consider replacing the `mutate()` pattern with explicit methods per entity to avoid full-table reload |
| 3.2.2 | Write `DbSyncWatermarkStore` — `src/ingest/sync-watermark-store-db.ts` | |
| 3.2.3 | Write `DbPatreonSyncHealthStore` — `src/patreon/patreon-sync-health-store-db.ts` | |

### Phase 3.3 — Backfill and wiring `[SEQUENTIAL]` (depends on 3.2)

| # | Work item | Notes |
|---|-----------|-------|
| 3.3.1 | Write `scripts/backfill-canonical.ts` — parse `canonical.json` and upsert all entities via Prisma | Chunked transactions (e.g. 500 posts at a time); record `legacy_file_id` on each row |
| 3.3.2 | Parity tests: count rows in DB vs counts in file; sample 100 posts and compare all fields | |
| 3.3.3 | Wire `DbCanonicalStore` behind `RELAY_DB_STORE_CANONICAL=1` in `server.ts` | Ingest service, gallery service, export service all consume `ICanonicalStore` — no consumer changes |
| 3.3.4 | Run ingest against DB in staging; verify idempotency (run same ingest batch twice — row counts identical) | Core Part 1 B exit gate |
| 3.3.5 | Promote to production; archive `canonical.json` (do not delete) | |

---

## Milestone 4 — Creator curation layer `[SEQUENTIAL after M3; items within PARALLEL]`

*All curation stores reference canonical IDs (`post_id`, `media_id`, `creator_id`). Run in parallel across stores — they have no cross-dependencies.*

### Phase 4.1 — Schema `[SEQUENTIAL]`

| # | Work item | Notes |
|---|-----------|-------|
| 4.1.1 | Add `PostOverride` to schema (replaces `gallery_post_overrides.json`) | Unique `(creator_id, post_id, media_id)` |
| 4.1.2 | Add `LibraryCollection` + `CollectionPost` join table (replaces `collections.json`) | |
| 4.1.3 | Add `SavedFilter` table (replaces `gallery_saved_filters.json`) | |
| 4.1.4 | Add `PageLayout` table (replaces `page_layout.json`) | `layoutJson` blob; add `version Int` for future history |
| 4.1.5 | `prisma migrate dev --name creator_curation` | |

### Phase 4.2 — Db store implementations `[PARALLEL]` (depends on 4.1)

| # | Work item | Notes |
|---|-----------|-------|
| 4.2.1 | `DbGalleryOverridesStore` — `src/gallery/overrides-store-db.ts` | Preserve `add_tag_ids` / `remove_tag_ids` array semantics; use Postgres `text[]` |
| 4.2.2 | `DbCollectionsStore` — `src/gallery/collections-store-db.ts` | |
| 4.2.3 | `DbSavedFiltersStore` — `src/gallery/saved-filters-store-db.ts` | |
| 4.2.4 | `DbPageLayoutStore` — `src/gallery/layout-store-db.ts` | |

### Phase 4.3 — Backfill and wiring `[PARALLEL across stores, SEQUENTIAL within each]` (depends on 4.2)

| # | Work item | Notes |
|---|-----------|-------|
| 4.3.1 | Backfill overrides; wire behind `RELAY_DB_STORE_OVERRIDES=1` | |
| 4.3.2 | Backfill collections; wire behind `RELAY_DB_STORE_COLLECTIONS=1` | Validate `post_ids` still resolve in canonical |
| 4.3.3 | Backfill saved filters; wire behind `RELAY_DB_STORE_SAVED_FILTERS=1` | |
| 4.3.4 | Backfill layouts; wire behind `RELAY_DB_STORE_LAYOUT=1` | |

---

## Milestone 5 — Operations and DLQ `[PARALLEL with M4, after M3]`

*No dependencies on curation layer. Safe to run concurrently with M4.*

### Phase 5.1 — Schema `[SEQUENTIAL]`

| # | Work item | Notes |
|---|-----------|-------|
| 5.1.1 | Add `JobRun` table (replaces `FileDeadLetterQueue` and captures ingest retry state) | Fields: `kind`, `creator_id`, `status`, `payload Json`, `started_at`, `finished_at`, `error`, `attempt_count`, `dlq_batch Json?` |
| 5.1.2 | Add `OutboxEvent` table for durable `InMemoryEventBus` replacement | `(event_name, tenant_id, primary_id, occurred_at)` unique constraint per `events.md` dedup rule |
| 5.1.3 | `prisma migrate dev --name operations_dlq` | |
| 5.1.4 | Add indexes: `(creatorId, status)` on `JobRun`; `(occurredAt)` on `OutboxEvent` | |

### Phase 5.2 — Implementations `[PARALLEL]` (depends on 5.1)

| # | Work item | Notes |
|---|-----------|-------|
| 5.2.1 | `DbDeadLetterQueue` — `src/ingest/dlq-db.ts` | `append()` writes `JobRun` row; `readAll()` queries; match existing interface |
| 5.2.2 | `DbEventBus` — `src/events/event-bus-db.ts` | `publish()` writes to `OutboxEvent`; retain in-memory `getAll()` for tests; consumers subscribe to DB table or BullMQ bridge |
| 5.2.3 | Wire `DbDeadLetterQueue` behind `RELAY_DB_STORE_DLQ=1` | |
| 5.2.4 | Wire `DbEventBus` behind `RELAY_DB_STORE_EVENTS=1` | Leaves `InMemoryEventBus` as fallback |

---

## Milestone 6 — Analytics and recommendations `[SEQUENTIAL after M2 + M3]`

*Requires stable `creator_id` and canonical `post_id` / `tier_id` references.*

### Phase 6.1 — Schema `[SEQUENTIAL]`

| # | Work item | Notes |
|---|-----------|-------|
| 6.1.1 | Add `AnalyticsSnapshot` table with `(creator_id, kind, period_start, period_end)` index | `payload Json`; add `estimated Boolean`; add `label` and `method` columns for Workstream E explainability |
| 6.1.2 | Add `RecommendationRecord` table | All fields from `src/analytics/types.ts RecommendationCard`; add `tenant_id` column |
| 6.1.3 | Add `ActionExecution` table | |
| 6.1.4 | Add `RecommendationOutcome` table | |
| 6.1.5 | `prisma migrate dev --name analytics_recommendations` | |
| 6.1.6 | Add monthly partition plan note for `AnalyticsSnapshot` in `operations-and-security.md`; implement if row projections justify it | |

### Phase 6.2 — Db store and wiring `[SEQUENTIAL]` (depends on 6.1)

| # | Work item | Notes |
|---|-----------|-------|
| 6.2.1 | `DbAnalyticsStore` — `src/analytics/analytics-store-db.ts` — same interface as `FileAnalyticsStore` | |
| 6.2.2 | Backfill existing analytics JSON into new tables | |
| 6.2.3 | Wire behind `RELAY_DB_STORE_ANALYTICS=1` | Ops: migrate deploy → `npm run backfill:analytics` → then set flag + restart (see `docs/database/README.md`) |
| 6.2.4 | Confirm `ActionCenterService` and `SnapshotGenerator` work against DB store unchanged | |

---

## Milestone 7 — Patron engagement `[PARALLEL with M6, after M2 + M3]`

*Requires user identity (M2) and canonical content IDs (M3). No dependency on analytics.*

### Phase 7.1 — Schema `[SEQUENTIAL]`

| # | Work item | Notes |
|---|-----------|-------|
| 7.1.1 | Add `Favorite` table — `(patron_user_id, creator_id, target_kind, target_id)` unique | Maps `PatronFavoriteRecord` exactly |
| 7.1.2 | Add `PatronSavedCollection` + `PatronSavedCollectionEntry` tables | Maps `PatronCollectionRecord` / `PatronCollectionEntryRecord` |
| 7.1.3 | `prisma migrate dev --name patron_engagement` | |

### Phase 7.2 — Db stores and wiring `[PARALLEL]` (depends on 7.1)

| # | Work item | Notes |
|---|-----------|-------|
| 7.2.1 | `DbPatronFavoritesStore` — `src/gallery/patron-favorites-store-db.ts` | |
| 7.2.2 | `DbPatronCollectionsStore` — `src/gallery/patron-collections-store-db.ts` | |
| 7.2.3 | Wire both behind `RELAY_DB_STORE_PATRON_ENGAGEMENT=1`; backfill from files | |

---

## Milestone 8 — Part 2 backend (clone, payments, migrations, deploys) `[PARALLEL with M6+M7, after M2 + M3]`

*All Part 2 stores reference `creator_id` (M2) and canonical content (M3). No cross-dependency among M8 work items.*

### Phase 8.1 — Schema `[SEQUENTIAL]`

| # | Work item | Notes |
|---|-----------|-------|
| 8.1.1 | Add `CloneSite` table (replaces `FileCloneSiteStore`) | |
| 8.1.2 | Add `PaymentConfig` + `CheckoutRecord` tables (replaces `FilePaymentStore`) | Never store raw provider keys in plaintext columns |
| 8.1.3 | Add `MigrationCampaign`, `MigrationAuditEntry`, `SuppressionListEntry`, `SignedLink` tables (replaces `FileMigrationStore`) | `MigrationAuditEntry` is append-only; `SignedLink` needs `expires_at` index |
| 8.1.4 | Add `Deployment` table (replaces `FileDeployStore`) | |
| 8.1.5 | `prisma migrate dev --name part2_backend` | |

### Phase 8.2 — Db stores and wiring `[PARALLEL]` (depends on 8.1)

| # | Work item | Notes |
|---|-----------|-------|
| 8.2.1 | `DbCloneSiteStore` — `src/clone/clone-store-db.ts` | |
| 8.2.2 | `DbPaymentStore` — `src/payments/payment-store-db.ts` | |
| 8.2.3 | `DbMigrationStore` — `src/migrate/migration-store-db.ts` | Validate audit log is append-only at DB level (`deletedAt` guard or insert-only role) |
| 8.2.4 | `DbDeployStore` — `src/deploy/deploy-store-db.ts` | |
| 8.2.5 | Backfill all Part 2 stores; wire behind respective `RELAY_DB_STORE_*` flags | Ops: per environment, `migrate deploy` → `npm run backfill:part2` → enable only needed flags (`CLONE`, `PAYMENTS`, `MIGRATION`, `DEPLOY`); see `docs/database/README.md` |

---

## Milestone 9 — Future-ready stubs `[OPEN PIPE — PARALLEL with M6–M8]`

*Schema defined now. Application logic not yet built. Tables exist to connect to when logic arrives — no dual-write, no backfill, no feature flags needed. Just add schema and generate migration.*

### Phase 9.1 — Part 3 patron network tables `[SEQUENTIAL within phase]`

| # | Work item | Notes |
|---|-----------|-------|
| 9.1.1 | Add `Follow` table — `(patron_user_id, creator_id)` unique | Part 3 K: follow graph |
| 9.1.2 | Add `PatronEntitlementSnapshot` table | `(patron_user_id, creator_id)` unique; `entitled_tier_ids text[]`; `active Bool`; `source EntitlementSource enum`; `as_of DateTime`; `stale_after DateTime?` — ready for scheduled refresh and webhook invalidation |
| 9.1.3 | Add `FeedCursor` table | `(patron_user_id, cursor_key)` — Part 3 L feed pagination |
| 9.1.4 | Add `NotificationPreference` table | `(patron_user_id, creator_id, preference_type)` — Part 3 K privacy controls |
| 9.1.5 | Add `PatronOAuthCredential` stub — extends `OAuthCredential` pattern with `purpose = patron_entitlement` | Separate from creator token storage; fields ready for Part 3 K "next: optional persistence of patron refresh tokens" |
| 9.1.6 | `prisma migrate dev --name part3_patron_stubs` | |

### Phase 9.2 — Part 3 engagement tables `[PARALLEL with 9.1]`

| # | Work item | Notes |
|---|-----------|-------|
| 9.2.1 | Add `Comment` table | `(creator_id, post_id, patron_user_id)`; `deleted_at DateTime?`; `moderation_state ModState enum`; soft-delete pattern |
| 9.2.2 | Add `DiscoveryDecisionLog` table | `(created_at)` index; monthly partition plan documented; `reason_codes text[]`; `inputs_json Json` — Part 3 L, M audit-friendly ranking |
| 9.2.3 | `prisma migrate dev --name part3_engagement_stubs` | |

### Phase 9.3 — Smart Tag Assistant stubs `[OPEN PIPE — PARALLEL]`

| # | Work item | Notes |
|---|-----------|-------|
| 9.3.1 | Add `Embedding` table stub: `(creator_id, entity_type, entity_id, model_version)` unique; `vector Unsupported("vector(1536)")?` | Use `@@ignore` or `Unsupported` until pgvector extension is confirmed in target DB |
| 9.3.2 | Add `TagSuggestion` table stub: `(creator_id, media_id, tag_id, confidence, source, accepted_at?, rejected_at?)` | Audit trail for Smart Tag Assistant confirmations |
| 9.3.3 | Document in `relational-model.md` that pgvector enablement requires `CREATE EXTENSION vector;` in a raw migration | |
| 9.3.4 | `prisma migrate dev --name smart_tag_stubs` | |

### Phase 9.4 — Webhook and operational extras `[PARALLEL]`

| # | Work item | Notes |
|---|-----------|-------|
| 9.4.1 | Add `WebhookEndpoint` table (replaces `patreon_webhook_metadata.json`) | `encrypted_secret Bytes`; `key_id String`; keep narrow — not mixed into user rows |
| 9.4.2 | Add `CampaignCreatorIndex` view or index on `CreatorProfile.patreon_campaign_id` | Replaces `patreon_campaign_creator_index.json`; already an indexed column if schema is followed |
| 9.4.3 | `prisma migrate dev --name operational_extras` | |

---

## Milestone 10 — Verification, cleanup, and handoff `[SEQUENTIAL after all migrations complete]`

### Phase 10.1 — Integration verification `[SEQUENTIAL]`

| # | Work item | Notes |
|---|-----------|-------|
| 10.1.1 | Run full `npm run test` and `npm run build` at repo root with all `RELAY_DB_STORE_*=1` | Zero regressions required |
| 10.1.2 | Run `npm run lint` and `npm run build` in `web/` | |
| 10.1.3 | Execute acceptance guardrails per `docs/qa/UX_ACCEPTANCE_GUARDRAILS.md` for all personas against DB-backed build | |
| 10.1.4 | Cross-tenant isolation test: create two creator accounts; verify no data bleed across `creator_id` queries | Part 3 exit gate requirement |
| 10.1.5 | Confirm zero plaintext tokens in any analytics or log paths | |

### Phase 10.2 — Remove file store fallbacks `[SEQUENTIAL after 10.1]`

| # | Work item | Notes |
|---|-----------|-------|
| 10.2.1 | Remove `File*Store` fallback branches from `src/server.ts` — DB stores are now the only path | Keep `File*Store` classes in source until M10 is stable; then delete |
| 10.2.2 | Remove `RELAY_DB_STORE_*` feature flags | |
| 10.2.3 | Archive `.relay-data/` to `.relay-data-archive/` with a README noting deprecation date | Do not delete until 30-day production soak |
| 10.2.4 | Update `docs/database/migration-from-relay-data.md` status column for each domain | |

### Phase 10.3 — Operational documentation `[PARALLEL with 10.2]`

| # | Work item | Notes |
|---|-----------|-------|
| 10.3.1 | Document connection pooling decision (PgBouncer, Prisma Accelerate, or built-in pool config) in `docs/database/operations-and-security.md` | |
| 10.3.2 | Document `prisma migrate deploy` as deployment prerequisite in deploy runbook | |
| 10.3.3 | Update `AGENTS.md` and `road map.md` to reflect completed DB integration | |

---

## Dependency graph summary

```
M1 (Infrastructure)
│
├── M2 (Identity)         ←── parallel start after M1
├── M3 (Canonical)        ←── parallel start after M1
│
├── M4 (Curation)         ←── after M3
├── M5 (Operations/DLQ)   ←── after M3 (parallel with M4)
│
├── M6 (Analytics)        ←── after M2 + M3 (parallel with M7, M8)
├── M7 (Patron engage)    ←── after M2 + M3 (parallel with M6, M8)
├── M8 (Part 2 backend)   ←── after M2 + M3 (parallel with M6, M7)
├── M9 (Future stubs)     ←── after M2 + M3 (parallel with M6–M8, open pipes)
│
└── M10 (Verification)    ←── after all of the above
```

---

## What the last work item delivers

After M10.2 completes:
- All `.relay-data/` JSON stores are replaced by Postgres
- Every existing service API is behaviorally unchanged — only storage backends swapped
- All `File*Store` classes are removable
- Schema includes open-pipe tables for every planned Part 3 feature
- Smart Tag Assistant has typed table stubs ready for vector extension
- Event bus is durable — events survive process restarts
- Cross-tenant isolation is tested and documented
- RLS + application-layer predicates are documented per `operations-and-security.md`
- New builder context: "add feature X" means writing a `Db*Store`, a migration, and wiring it in `server.ts` — not designing from scratch
