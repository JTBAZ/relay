# Supabase Auth — dashboard checklist (Relay)

Apply these in the [Supabase Dashboard](https://supabase.com/dashboard) for the project that matches `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` (same ref as `DATABASE_URL`).

## URL configuration

**Authentication → URL Configuration**

| Setting | Values |
|--------|--------|
| **Site URL** | Production: `https://relayapp.me` — Local dev can stay `http://localhost:3000` or use production Site URL with redirect URLs covering both. |
| **Redirect URLs** | Add each URL on its own line (wildcards allowed per Supabase docs): `http://localhost:3000/**`, `http://127.0.0.1:3000/**`, `https://relayapp.me/**` — ensure **`/auth/confirm`** is reachable (e.g. `https://relayapp.me/auth/confirm`). |

Email confirmation links and OAuth redirects must match an allowed redirect URL.

## Email signups

**Authentication → Providers → Email**

- Enable **Email** provider.
- **Confirm email**: If enabled, users must click the link before `signUp` returns a session. The app handles callbacks at [`web/app/auth/confirm/page.tsx`](../../web/app/auth/confirm/page.tsx). If emails are not received, check **rate limits** on the built-in mailer (very low on free tier) or configure **custom SMTP** under **Project Settings → Auth → SMTP Settings**.
- For local testing only, you may temporarily disable “Confirm email” so sign-up returns a session immediately.

## CORS / API

The Relay Express API validates Supabase JWTs using `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the **API container** env (see [`scripts/validate-relay-mt-env.mjs`](../../scripts/validate-relay-mt-env.mjs)). They must be the **same** project as the browser `NEXT_PUBLIC_SUPABASE_*` keys.

## Verification

```bash
npm run validate:mt-env
# With API running locally:
node scripts/validate-relay-mt-env.mjs --probe
```

Probe uses the merged `NEXT_PUBLIC_RELAY_API_URL` (from `web/.env.local` when present).
