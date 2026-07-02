# Pilot Patreon-only scope (PILOT-001)

**Work item:** `PILOT-001` — lock Patreon-only pilot scope.  
**Canonical plan:** [`pilot-build-plan.md`](pilot-build-plan.md) (Patreon-backed creators + patrons; SubscribeStar deferred).

## Intent

The pilot cohort uses **Patreon only** for creator OAuth, patron link, ingest, and tier truth. SubscribeStar integration remains in the codebase for post-pilot staging but is **not** promoted or required during the pilot window.

## Env flags

| Layer | Variable | When `1` |
| --- | --- | --- |
| **Web** (Next.js) | `NEXT_PUBLIC_RELAY_PILOT_PATREON_ONLY` | Hides SubscribeStar connect CTAs in onboarding, `/creator/connect`, and login OAuth links. Overrides `NEXT_PUBLIC_SUBSCRIBESTAR_CREATOR_CONNECT=1`. Redirects `/subscribestar/creator/*` to `/creator/connect`. |
| **API** (Express) | `RELAY_PILOT_PATREON_ONLY` | Returns `404 NOT_FOUND` on SubscribeStar OAuth, patron link, and ingest routes. |

**Local pilot default:** both flags are set to `1` in root `.env.example` and `web/.env.example`. Copy into your `.env` / `web/.env.local` for the standard pilot stack.

**SubscribeStar ingest:** leave `SUBSCRIBESTAR_INGEST_ENABLED` **unset** during the pilot. No SubscribeStar OAuth app or GraphQL query env is required for cohort onboarding.

## What stays available

- Patreon creator OAuth (`/patreon/connect`, onboarding step 2)
- Patreon patron link (`/connect/patreon/patron/connect`)
- Existing SubscribeStar code paths (disabled by flags, not deleted)

## Re-enable SubscribeStar (post-pilot / staging spike)

1. Set `RELAY_PILOT_PATREON_ONLY=0` and `NEXT_PUBLIC_RELAY_PILOT_PATREON_ONLY=0` (or remove).
2. Configure `SUBSCRIBESTAR_INGEST_ENABLED=1` and OAuth env per root `.env.example`.
3. Set `NEXT_PUBLIC_SUBSCRIBESTAR_CREATOR_CONNECT=1` in `web/.env.local` to surface connect UI.

See also [`docs/qa/subscribestar-first-link-test-run.md`](qa/subscribestar-first-link-test-run.md).

## Postgres cutover (PILOT-002)

Pilot hosts use Postgres-backed identity and canonical stores. See [`pilot-db-cutover.md`](pilot-db-cutover.md) for `RELAY_DB_STORE_*` matrix, `prisma migrate deploy`, and backfill order.

## Verification

```bash
npm run build
npx vitest run tests/pilot-patreon-only-scope.test.ts
npx vitest run tests/pilot-db-cutover.test.ts
```

With pilot flags on, confirm:

- `/onboarding?path=creator` step 2 shows Patreon only (no SubscribeStar button).
- `/creator/connect` title is “Connect your Patreon”.
- Direct visit to `/subscribestar/creator/connect` redirects to `/creator/connect`.
