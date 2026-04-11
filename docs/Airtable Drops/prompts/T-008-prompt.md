# T-008 — P1 — Fallback sync cadence (webhook safety net)

## Goal

Add a **scheduled** pull / sync that catches missed or delayed Patreon webhooks, using **idempotency** and **watermarks** so work is not duplicated. This **complements** webhooks (T-006), not a substitute.

## Scope / non-goals

- **In scope:** Cron or scheduler integration, backoff, dedupe keys, alignment with existing sync pipeline.
- **Non-goals:** Replacing webhook-first design; patron-scale entitlement refresh (separate track).

## Validation

- Tests for idempotent runs where feasible; `npm run test` / `npm run build` for changes.

## Handoff

After success, write **Delta Out** and follow **Runs** logging in `docs/database/AIRTABLE_AUTOPIPELINE.md`.
