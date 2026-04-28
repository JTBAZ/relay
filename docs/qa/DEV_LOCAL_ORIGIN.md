# Local dev: one browser origin (Phase 0)

**Why:** Mixing `http://localhost:3000` and `http://127.0.0.1:3000` splits cookies, Supabase email links (`emailRedirectTo`), and session behavior. Relay’s dev defaults use **`localhost`** for the web app and API ([`web/.env.example`](../../web/.env.example) → `NEXT_PUBLIC_RELAY_API_URL`).

## Production web service (`relayapp.me`) — nothing moves off your DB

Phase 0 does **not** ask you to change **`DATABASE_URL`**, **`SUPABASE_URL`**, or **`NEXT_PUBLIC_SUPABASE_URL`**. Those stay pointed at your **Supabase project** (typically `*.supabase.co` or the host Supabase shows in the dashboard)—the same project in prod and local dev if you share one database.

- **`https://relayapp.me`** is the **deployed Next app** (and cookies, Patreon callbacks, extension expectations). Keep **Auth → Site URL** at `https://relayapp.me` in production.
- **Local dev** only standardizes **which origin you type in the browser** (`http://localhost:3000`). Add that origin to **Redirect URLs** *alongside* `https://relayapp.me/**` so email links work in both places.

So: optimize the signup flow as a normal web app on `relayapp.me`; use `localhost` only as a **parallel dev surface**, not a replacement for production URLs or the database host.

## Canonical choice for this repo

| Surface | Recommended dev URL |
|--------|----------------------|
| Next.js app | `http://localhost:3000` |
| Relay API | `http://localhost:8787` (matches `NEXT_PUBLIC_RELAY_API_URL`) |

Always open the app at **`localhost:3000`**, not `127.0.0.1:3000`, unless you duplicate every redirect allowlist entry below.

## Supabase Dashboard (Auth → URL Configuration)

1. **Site URL:** `http://localhost:3000` (or your single chosen origin).
2. **Redirect URLs** — add at least:
   - `http://localhost:3000/**`
   - `http://localhost:3000/auth/confirm`
   - If you still use `127.0.0.1` for testing, add parallel entries for `http://127.0.0.1:3000/**` and `http://127.0.0.1:3000/auth/confirm` (not recommended long term).

Sign-up `emailRedirectTo` URLs are built with [`getWebAppOrigin()`](../../web/lib/site-origin.ts): set `NEXT_PUBLIC_SITE_URL=http://localhost:3000` so Supabase allowlists and the tab you use stay aligned.

## Optional: Next metadata

Set in `web/.env.local`:

```bash
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

So `metadataBase` in [`web/app/layout.tsx`](../../web/app/layout.tsx) matches the tab you use.

## Patreon OAuth (dev)

Register redirect URIs in the Patreon developer app for the same canonical host as Next (local dev: **`http://localhost:3000/...`**). [`patronPatronOAuthRedirectUri`](../../web/lib/patron-patron-redirect-uri.ts) uses [`getWebAppOrigin()`](../../web/lib/site-origin.ts) + `/patreon/patron/callback` unless `NEXT_PUBLIC_PATREON_PATRON_REDIRECT_URI` is set.

## See also

- [`SUPPORTER_CREATOR_SIGNUP_FLOW_INCREMENTAL_PLAN.md`](SUPPORTER_CREATOR_SIGNUP_FLOW_INCREMENTAL_PLAN.md) — Phase 1+ signup routing.
- [`web/lib/relay-auth-bootstrap.ts`](../../web/lib/relay-auth-bootstrap.ts) — comment on cross-site cookies when UI and API hosts differ.
