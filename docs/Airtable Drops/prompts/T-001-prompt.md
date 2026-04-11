# T-001 — [Shipped] Slice 1 — Export fetch retries + Library retry UI

## Goal

This slice is **already shipped**. Use this task only for **regression fixes** or small follow-ups tied to export fetch retries and Library retry UI, aligned with `docs/part1-sync-hardening-ledger.md` and export media paths.

## Scope / non-goals

- **In scope:** Targeted fixes to export index / `POST /api/v1/export/media`, `RELAY_EXPORT_*` behavior, and related tests.
- **Non-goals:** New product features unrelated to export retry; refactors outside touched files unless required for the fix.

## Validation

- Run tests that cover export media retry (e.g. `export-media-retry` or the suite named in project docs).
- `npm run build` and `npm run test` at repo root for backend changes under `src/`.

## Handoff

After success, write **Delta Out** (delta-only: what changed, risks, next hint) and follow **Runs** logging in `docs/database/AIRTABLE_AUTOPIPELINE.md`. Update the **Tasks** row in Airtable: **Status**, **Delta Out**, **Notes** as appropriate.
