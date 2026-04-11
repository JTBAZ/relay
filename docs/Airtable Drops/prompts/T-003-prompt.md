# T-003 — [Shipped] Slice 3 — Sync watermarks + Fetch newer / Re-sync access UI

## Goal

This slice is **already shipped**. Use for **targeted fixes** to sync watermark storage, `GET /api/v1/patreon/sync-state`, and Patreon sync menu UX.

## Scope / non-goals

- **In scope:** `SyncWatermarkStore`, sync-state API, Patreon sync menu behavior; watermark-related tests.
- **Non-goals:** Full redesign of sync UX; unrelated Library features.

## Validation

- Run `patreon-sync-state-watermark` (or equivalent) tests.
- `npm run test` / `npm run build` as needed for `src/` and `web/` changes.

## Handoff

After success, write **Delta Out** and follow **Runs** logging in `docs/database/AIRTABLE_AUTOPIPELINE.md`.
