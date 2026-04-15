# Multi-tenant run 07 — Web: landing, onboarding, session-driven Library/Feed (MT-015–MT-017)

| | |
|---|---|
| **Step IDs** | `MT-015` · `MT-016` · `MT-017` |
| **Sort order** | 15–17 |
| **Precondition** | MT-007+ for MT-015; MT-011, MT-013 for MT-016; MT-014, MT-016 for MT-017. |

## Full prompt (paste into agent)

```text
You are a coding agent on Rescue / Relay. This batch covers Step IDs MT-015, MT-016, and MT-017 only. Work in `web/` (Next.js App Router) and `web/lib/relay-api.ts`.

### MT-015 — Public routes: sign up / log in wired to API

- Ensure `/` or dedicated routes (`/login`, `/signup` — follow existing `web/app/` structure) call the **new** auth endpoints from run 02 (`/api/v1/auth/signup`, `/api/v1/auth/login` or whatever was implemented).
- Store session per existing pattern: httpOnly cookie or `relay_session_token` in client storage — **align** with `relayFetch` in `web/lib/relay-api.ts` (read file; do not invent a second mechanism without migrating callers).
- Update `web/.env.example` only for public URLs (`NEXT_PUBLIC_RELAY_API_URL`); do not add secrets.

### MT-016 — Onboarding wizard

- Add or extend `web/app/onboarding/` (or equivalent): steps = **account** → **creator path** (Patreon creator OAuth) vs **patron path** (Patreon patron OAuth) → redirect to **Library** (creator) or **Feed** (patron) using existing layouts.
- Wire OAuth redirects to backend callbacks already defined in run 04/05. Use `state` parameters as required by backend.

### MT-017 — Remove single-tenant creator env from runtime behavior

- Find uses of `NEXT_PUBLIC_RELAY_CREATOR_ID` / `defaultCreatorId` (e.g. `web/app/GalleryView.tsx`, other gallery pages). Replace with:
  - **Creator Library:** `relay_creator_id` from **creator session** context (or route param resolved server-side).
  - **Patron Feed:** list from `GET /api/v1/me/entitled-creators` (run 06) — union requests or tabbed UI as minimal viable.
- Keep an **optional** `RELAY_LEGACY_SINGLE_TENANT` or env-only debug path only if product requires it — gated and documented in one line in `.env.example`.

Verify:
- `npm run lint --prefix web` and `npm run build --prefix web`.
- Manual: load Library without relying on a single hardcoded creator id in client bundle for multi-tenant mode.

Airtable: Complete MT-015, MT-016, MT-017 with Notes (routes changed, env vars).

Out of scope: Rate limits (run 08); rollout flags (run 09).
```

## Links

- **This run:** [mt-run-07.md](mt-run-07.md) — `https://github.com/JTBAZ/relay/blob/main/docs/architecture/multi-tenant-runs/mt-run-07.md`
- **Next run:** [mt-run-08.md](mt-run-08.md) — `https://github.com/JTBAZ/relay/blob/main/docs/architecture/multi-tenant-runs/mt-run-08.md`

## Handoff

Start **[mt-run-08.md](mt-run-08.md)** (security hardening).
