# SubscribeStar — first real account link (test run)

Use this checklist for the **first** end-to-end link of a real SubscribeStar creator account to a Relay studio. Assumes **manual onboarding first** (OAuth + manual import / R2 uploads); GraphQL posts sync is optional and requires Explorer query env (see root `.env.example`).

## Preconditions

- **Legal / product:** Staging or internal test only until counsel signs off on SubscribeStar API usage for your product shape. Keep `SUBSCRIBESTAR_INGEST_ENABLED` **off** in production if still gated.
- **Same browser origin** for the whole flow (see `web/.env.example` — do not mix `localhost` vs `127.0.0.1`).
- **SubscribeStar OAuth app** registered on the same realm you will use (`.adult` vs `.com`), with redirect URI exactly matching what the web app sends, e.g. `http://localhost:3000/subscribestar/creator/callback`.

## Relay API (repo root)

Set at minimum (names may use aliases from `.env.example`):

| Variable | Purpose |
|----------|---------|
| `SUBSCRIBESTAR_INGEST_ENABLED=1` | Enables prepare/exchange/refresh and ingest routes |
| `RELAY_DB_STORE_CREATOR_OAUTH=1` | Prisma-backed creator OAuth (with working `DATABASE_URL`) |
| `RELAY_TOKEN_ENCRYPTION_KEY` | Encrypts stored tokens |
| `SUBSCRIBESTAR_RELAY_CREATOR_CLIENT_ID` / `SUBSCRIBESTAR_RELAY_CREATOR_SECRET` | SubscribeStar app |
| `SUBSCRIBESTAR_API_ORIGIN` | Optional; default `https://subscribestar.adult` |
| `SUBSCRIBESTAR_RELAY_CREATOR_REDIRECT_URI` or `SUBSCRIBESTAR_CREATOR_REDIRECT_URI` | Optional lock: must match browser `redirect_uri` on exchange |
| `RELAY_SUBSCRIBESTAR_OAUTH_STATE_SECRET` (or `RELAY_SUBSCRIBESTAR_CREATOR_OAUTH_STATE_SECRET`) | Min 16 chars — required for `POST .../creator/prepare` signed `state` |
| `RELAY_ENFORCE_CREATOR_OAUTH_BIND=1` | Expected in production-like flows; exchange verifies session + state |
| R2 vars (`R2_*`, `RELAY_UPLOAD_*`) | Required for **Relay-native uploads** (`POST /api/v1/relay/upload/init` → PUT → `commit`) |

Run API with Prisma migrations applied (including SubscribeStar-related migrations).

## Web (`web/`)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_RELAY_API_URL` | Points at running Relay API |
| `NEXT_PUBLIC_SUBSCRIBESTAR_CREATOR_CONNECT=1` | Shows Patreon vs SubscribeStar entry points on `/creator/connect` and login links |
| `NEXT_PUBLIC_SUBSCRIBESTAR_CREATOR_CLIENT_ID` | Public client id for authorize URL (or set server-side vars on Next host) |
| `NEXT_PUBLIC_SUBSCRIBESTAR_CREATOR_REDIRECT_URI` | Optional; must match SubscribeStar app if set |
| `NEXT_PUBLIC_SUBSCRIBESTAR_API_ORIGIN` | Optional; must match OAuth app realm |

## Browser flow (happy path)

1. Sign in to Relay (Supabase / relay session) so `relay_signed_in` / session cookies exist.
2. Open **Create / refresh workspace** (or `POST /api/v1/creator/workspace`) so `relay_creator_id` is in `localStorage`.
3. From **`/creator/connect`** (with flag on) or **`/subscribestar/creator/connect`**: **Continue to SubscribeStar**.
4. Complete SubscribeStar authorization; land on **`/subscribestar/creator/callback`**.
5. Expect **200** from `POST /api/v1/auth/subscribestar/creator/exchange` and JSON with `subscribestar_profile_id`.
6. **Manual import:** open **`/manual-import`** — create bins, upload to R2, commit staging (per current manual import UI).

## Verification

- DB: `OAuthCredential` / `ProviderAccount` for `ProviderKind.subscribestar`; `CreatorProfile.subscribestarProfileId` set when exchange succeeds.
- API logs: no `NOT_FOUND` on ingest flag; no `503` for missing OAuth state secret or DB.
- **Do not** call `POST /api/v1/subscribestar/creator/sync/posts` until `SUBSCRIBESTAR_INGEST_POSTS_GRAPHQL_QUERY` (or `SUBSCRIBESTAR_INGEST_QUERIES_JSON.postsPage`) is populated from Explorer and tested.

## UI entry points

With `NEXT_PUBLIC_SUBSCRIBESTAR_CREATOR_CONNECT=1`:

- [`web/app/creator/connect/page.tsx`](../../web/app/creator/connect/page.tsx) — platform chooser (Patreon vs SubscribeStar).
- [`web/app/components/auth/patreon-oauth-links.tsx`](../../web/app/components/auth/patreon-oauth-links.tsx) — optional SubscribeStar row on login-adjacent flows.

Direct URL always works for testers: `/subscribestar/creator/connect`.

## Rollback

- Revoke app access in SubscribeStar account settings.
- Delete or rotate OAuth credentials in DB if needed (support / SQL — not documented here).
