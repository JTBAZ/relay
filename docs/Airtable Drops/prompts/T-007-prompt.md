# T-007 — P0 — Unattended incremental sync (autosync core)

## Goal

Implement or complete a **background job / worker** that performs **watermark-aware incremental** scrape/sync **without** requiring manual Library action, aligned with `docs/part1-sync-hardening-ledger.md` and the road map for incremental jobs.

## Scope / non-goals

- **In scope:** Job scheduling or worker loop, safe concurrency, integration with existing sync and watermarks; coordination with T-005 (refresh) and T-006 (webhooks).
- **Non-goals:** Full Fan Relay entitlement refresh at scale (deferred elsewhere); large unrelated refactors.

## Validation

- `npm run test`, `npm run build` for backend (`src/`).
- Local or staging run of the job with realistic flags (document commands in Notes).

## Handoff

After success, write **Delta Out** (operational knobs, failure modes) and follow **Runs** logging in `docs/database/AIRTABLE_AUTOPIPELINE.md`.
