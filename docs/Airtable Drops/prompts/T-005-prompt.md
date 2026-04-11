# T-005 — P0 — Proactive OAuth token refresh before automated scrape/sync

## Goal

Ensure **automated** scrape/sync paths (jobs, workers, or background triggers) call **`POST /api/v1/auth/patreon/refresh`** (or equivalent internal `refreshAndRotate`) **before** relying on Patreon access, so silent failures from stale tokens are reduced. Align with existing `refresh_failed` hints.

## Scope / non-goals

- **In scope:** Wire refresh into the right automation entry points; `src/auth/auth-service.ts` (`refreshAndRotate`), route in `src/server.ts` (`/api/v1/auth/patreon/refresh`); minimal logging for failures.
- **Non-goals:** Changing OAuth UX flows for humans; storing secrets in Airtable; Patreon webhook HMAC (see T-006).

## Validation

- `npm run test` and `npm run build` at repo root for `src/` changes.
- Manually or via tests: verify automated path invokes refresh when token is near expiry or before scrape (per implementation).

## Handoff

After success, write **Delta Out** (files touched, behavior, any env assumptions) and follow **Runs** logging in `docs/database/AIRTABLE_AUTOPIPELINE.md`. Promote **T-006** to **Ready** in Airtable when deps are satisfied.
