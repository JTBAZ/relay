# Migration from `.relay-data/` file stores

## Current state

The Nest/Express backend wires many concerns to JSON files under `.relay-data/` (defaults shown in `src/server.ts`). Environment variables can override paths (see root `.env.example`).

## File → relational mapping

| Current artifact (typical path) | Target tables / entities | Notes |
|--------------------------------|---------------------------|--------|
| `canonical.json` | `Campaign`, `Post`, `PostVersion`, `MediaAsset`, `Tier`, `PostTier`, tags (M:N or arrays) | Preserve stable IDs used by APIs and tests; ingest stays idempotent |
| `gallery_post_overrides.json` | `PostOverride` | **Do not** merge overrides into canonical rows at rest — `docs/relay-artist-metadata.md` |
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
