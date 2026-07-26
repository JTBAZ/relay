# Migration from `.relay-data/` file stores

## Current state

The Express backend can use **PostgreSQL + Prisma** per domain (`RELAY_DB_STORE_*` flags in `src/server.ts`) or **JSON files** under `.relay-data/` when a flag is off. Environment variables can override paths (see root `.env.example`).

### After M10.2 (target — DB-only path)

When milestone **M10 phase 10.2** is executed ([`M10_VERIFICATION.md`](M10_VERIFICATION.md) §10.2): **`File*Store` fallbacks for migrated domains are removed** from `server.ts`, **`RELAY_DB_STORE_*` feature flags are removed**, runtime uses **Postgres only** for those stores (with `prisma` required), and **`.relay-data` is archived** (not casually deleted) per [`relay-data-archive/README.md`](../../relay-data-archive/README.md). The table below should then be updated so the **flag** column reads **removed (DB-only)** or similar for each domain that no longer has a file fallback — and this doc’s narrative should match production.

**Prerequisite for that code change:** Vitest and any `createApp` integration tests must be updated to use **`prisma`** and Postgres-backed behavior (file-path fixtures alone are insufficient once `Db*Store` is the only path). Do not treat M10.2 as a documentation-only toggle.

### Cutover status (engineering)

| Domain | Postgres tables / store | `RELAY_DB_STORE_*` flag | Notes |
|--------|---------------------------|-------------------------|--------|
| Identity + sessions | `User`, `Session`, … / `DbIdentityStore` | `RELAY_DB_STORE_IDENTITY` | Backfill: `npm run backfill:identity` |
| Canonical ingest | `Campaign`, `Post`, … / `DbCanonicalStore` | `RELAY_DB_STORE_CANONICAL` | Large migration; see staging doc |
| Sync watermarks | `SyncCursor` / `DbSyncWatermarkStore` | `RELAY_DB_STORE_WATERMARK` | |
| Sync health | `CreatorSyncState` / `DbPatreonSyncHealthStore` | `RELAY_DB_STORE_SYNC_HEALTH` | |
| Gallery overrides | `PostOverride` / `DbGalleryOverridesStore` | `RELAY_DB_STORE_OVERRIDES` | Tags, visibility, discovery — distinct from ingest |
| Presentation overlays (`post_presentations`) | `PostPresentation` (no legacy JSON file) | — | Postgres-only Relay UI overlays; merged at read time with Patreon-ingested posts per `docs/relay-artist-metadata.md`; not part of canonical snapshot |
| Library collections | `LibraryCollection`, … / `DbCollectionsStore` | `RELAY_DB_STORE_COLLECTIONS` | |
| Saved filters | `SavedFilter` / `DbSavedFiltersStore` | `RELAY_DB_STORE_SAVED_FILTERS` | |
| Page layout | `PageLayout` / `DbPageLayoutStore` | `RELAY_DB_STORE_LAYOUT` | |
| DLQ | `JobRun` / `DbDeadLetterQueue` | `RELAY_DB_STORE_DLQ` | |
| Outbox / events | `OutboxEvent` / `DbEventBus` | `RELAY_DB_STORE_EVENTS` | |
| Analytics | `AnalyticsSnapshotRow`, … / `DbAnalyticsStore` | `RELAY_DB_STORE_ANALYTICS` | |
| Patron favorites + collections | `PatronFavorite`, … / `DbPatronFavoritesStore`, `DbPatronCollectionsStore` | `RELAY_DB_STORE_PATRON_ENGAGEMENT` | |
| Clone / payments / migration / deploy | M8 tables / `DbCloneSiteStore`, etc. | `RELAY_DB_STORE_CLONE`, `PAYMENTS`, `MIGRATION`, `DEPLOY` | Four independent flags |
| Creator OAuth tokens (`patreon_credentials.json`) | `OAuthCredential` + `ProviderAccount` / `DbPatreonTokenStore` | `RELAY_DB_STORE_CREATOR_OAUTH` | Default file-backed; DB path creates tenant/user rows on first `upsert` |
| Patreon cookies, campaign index, webhook metadata files | Files or future `WebhookEndpoint` (M9 stub) | — | Narrow tables exist for webhooks / routing where noted in schema |

**P5a pilot (append-only membership, Patreon Insights CSV, Relay engagement):** design note [`p5a-analytics-pilot-schema.md`](p5a-analytics-pilot-schema.md); tables are not in the flag matrix until migrations ship (**P5a-db-002**).

**M10 handoff:** After soak, operators may remove file fallbacks and flags per [`M10_VERIFICATION.md`](M10_VERIFICATION.md). Archive JSON: [`relay-data-archive/README.md`](../../relay-data-archive/README.md).

## File → relational mapping

| Current artifact (typical path) | Target tables / entities | Notes |
|--------------------------------|---------------------------|--------|
| `canonical.json` | `Campaign`, `Post`, `PostVersion`, `MediaAsset`, `Tier`, `PostTier`, tags (M:N or arrays) | Preserve stable IDs used by APIs and tests; ingest stays idempotent |
| `gallery_post_overrides.json` | `PostOverride` | **Do not** merge overrides into canonical rows at rest — `docs/relay-artist-metadata.md` |
| _(none — Relay presentation overlays)_ | `PostPresentation` | No legacy file; titles/order/tier previews are creator mutations against Postgres |
| `collections.json` | `LibraryCollection` + join tables | Artist-side Library collections |
| `page_layout.json` | `PageLayout` | Designer JSON; optional history table if you version layouts |
| `gallery_saved_filters.json` | `SavedFilter` (per creator) | — |
| `patreon_credentials.json` | `OAuthCredential` + `ProviderAccount` | `purpose = creator_ingest`; encrypted blob only |
| `identity.json` | `User`, `PatronProfile` / `CreatorProfile`, `ProviderAccount` | Upsert semantics aligned with patron exchange |
| `patron_favorites.json` | `Favorite` | Scoped by patron + creator |
| `patron_collections.json` | `PatronSavedCollection` (+ items) | Distinct from `LibraryCollection` |
| `analytics.json` | `AnalyticsSnapshot`, `RecommendationRecord`, outcomes | Align with `analytics-action-center-spec.md` |
| `ingest_dlq.json` | `JobRun` / dead-letter event table | Store full envelope + error; link to queue job id when applicable |
| `patreon_sync_watermarks.json` | `SyncCursor` or fields on creator sync state | Incremental ingest cursors |
| `patreon_sync_health.json` | `OAuthCredential` health + optional `CreatorSyncState` | Surfaces sync honesty for Library UI |
| `creator_campaign_display.json` | Display fields on `Campaign` or `CreatorProfile` | Patreon-sourced display snapshot |
| `patreon_campaign_creator_index.json` | Index on `CreatorProfile.patreonCampaignId` | Webhook routing |
| `patreon_webhook_metadata.json` | Small table with **encrypted** secrets | Not mixed into generic user rows |
| `patreon_cookies.json` | Transitional / operational — prefer reducing reliance; if stored, treat as sensitive credential material | |
| `clone_sites.json`, `payments.json`, `migrations.json`, `deploys.json` | Part 2 bounded tables | Payment provider adapters separate from patron OAuth |

## Suggested migration strategy

1. **Add PostgreSQL + Prisma** without removing file stores.
2. **Dual-write** behind feature flags for each domain (identity, overrides, canonical, etc.).
3. **Backfill** with deterministic ID mapping; optional `legacy_file_id` columns during transition.
4. **Switch reads** per domain after automated parity checks (counts, checksums, API contract tests).
5. **Keep JSON exports** in backup/archive until the domain is stable; maintenance scripts today (`scripts/maintenance-*.ps1`) remain useful for file-era snapshots.

## Ordering risk

Prefer migrating **identity + sessions + entitlements** early for Part 3 security tests, while **canonical** remains the largest bulk move — schedule canonical cutover after ingest idempotency proofs against Postgres.

## Dual-write / cutover (per domain)

For each domain:

- Define **read path** (file | db | both-with-merge) during transition.
- Define **write path** (write-through to both, or write-db-async-to-file for rollback).
- Add **reconciliation job** (nightly or on deploy) comparing aggregates until file path is removed.

## Not confused with

- **Airtable** Production Ledger: operational queue only — not migrated into this schema as app data.
