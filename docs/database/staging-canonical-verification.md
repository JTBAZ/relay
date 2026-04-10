# Staging — canonical store (Postgres)

Use after **`RELAY_DB_STORE_CANONICAL=1`** (and optionally **`RELAY_DB_STORE_WATERMARK=1`**, **`RELAY_DB_STORE_SYNC_HEALTH=1`**) are set in staging and Prisma migrations through canonical content are applied.

## Preconditions

- `DATABASE_URL` points at the staging Postgres instance.
- `npm run build && npx prisma migrate deploy` (or equivalent).
- One-time from file: `npm run backfill:canonical` (or `node scripts/backfill-canonical.mjs [path/to/canonical.json]`).

## Parity

- **Vitest:** `tests/canonical-backfill-parity.test.ts` checks entity counts + sampled `PostRow` JSON equality (no live DB required for the mocked cases).
- **Manual:** After `backfill:canonical`, run a small script or SQL to compare row counts in `campaigns`, `tiers`, `posts`, `media_assets`, `ingest_idempotency_keys` to counts derived from `canonical.json` (see `countCanonicalSnapshotEntities` in `src/ingest/backfill-canonical-from-file.ts`).

## Idempotency (3.3.4)

Goal: running the **same ingest batch** twice does not duplicate canonical rows (ingest uses idempotency keys; DB store mirrors file semantics).

1. Enable **`RELAY_DB_STORE_CANONICAL=1`** (and watermark/health if testing those paths).
2. Note current counts (e.g. `posts` for a creator) via `GET /api/v1/gallery/...` or direct SQL.
3. Trigger the same Patreon scrape / ingest payload twice (e.g. `POST /api/v1/patreon/scrape` with `dry_run: false` once, then repeat with the same `creator_id` / `campaign_id` and equivalent upstream state).
4. **Expect:** second run increments **idempotent_skips** (or equivalent) and **does not** increase post/media row counts for already-seen revisions.

Document the observed counts in the DB Integration Pipeline **Notes** for step 3.3.4 when closing the gate.

## Smoke

Align ingest/gallery smoke with **`docs/qa/UX_ACCEPTANCE_GUARDRAILS.md`** and existing workstreams (e.g. **`tests/workstream-b.ingest.test.ts`**, **`tests/workstream-d.gallery-api.test.ts`**).

## Production (3.3.5)

Human-gated: see **`docs/database/promote-canonical-archive.md`** — archive `canonical.json` (do not delete); enable DB flags only after soak and owner approval.
