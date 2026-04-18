# HTTP verb hygiene

**Rule:** `GET` is side-effect-free. State changes use `POST`, `PUT`, `PATCH`, or `DELETE`.

## Why

- Browsers prefetch `GET` URLs (`rel="prefetch"`, quick-look on hover).
- Crawlers and link-preview services issue `GET`s.
- Email “click to view” links are `GET`s.
- With `SameSite=Lax` cookies, `GET`-safety removes the most common CSRF vectors without CSRF tokens.

## Allowed exceptions

- **Access logging** — recording that a request happened is acceptable on `GET`.
- **Response metadata** — `Cache-Control` and similar headers are fine.
- **Read-through / metrics** — delivery or export paths may record attempts or success/failure for observability (logging-shaped), without mutating application business state beyond that.

## Relay API audit (Tier 1)

| Area | Notes |
|------|--------|
| `src/server.ts` | **44** `app.get(...)` handlers under the main app. Classified as read-only responses, streaming downloads, or logging-shaped metrics. No `GET` performs logout, registration, or other auth/session mutations. |
| `src/dev/pipeline-parity-routes.ts` | **3** dev-only `GET`s for parity snapshots — read-only. |
| Logout | **`POST /api/v1/identity/logout`** only. **`GET /api/v1/identity/logout`** returns **405** with `Allow: POST`. |
| Web sign-out | Uses `performRelayLogout()` (`web/lib/relay-session-logout.ts`) — `fetch` with **`method: "POST"`**, not a navigational `GET`. |

## Known violations (sunset)

- None at this time.

## Verification

- `rg "app\\.get\\(" src/` — confirm new `GET`s are read-only or explicitly documented.
- Logout: only **`POST /api/v1/identity/logout`** performs logout; **`GET`** → **405**.
