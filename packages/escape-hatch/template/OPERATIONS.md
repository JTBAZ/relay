# Operations (EH-040 creator Patreon OAuth + EH-035 visitor visual + EH-034 account / paywall UX)

## Local preview

```bash
cp .env.example .env.local   # optional — build works without it
npm install
npm run build
npm run dev
```

No `RELAY_*` or monorepo root `.env` is required. Neither Path A nor Path B must be configured for install/build.

## Creator-owned Patreon OAuth (EH-040)

Guided setup checklist (also on `/admin/patreon`):

1. Create or choose a Patreon OAuth client in the Patreon developer portal.
2. Register the exact callback URL: `{NEXT_PUBLIC_SITE_URL}/api/patreon/oauth/callback` → `PATREON_REDIRECT_URI`.
3. Set env names only (never commit secrets):
   - `ESCAPE_HATCH_PATREON_MODE=creator_oauth`
   - `PATREON_CLIENT_ID`, `PATREON_CLIENT_SECRET`
   - `PATREON_REDIRECT_URI`, `PATREON_CAMPAIGN_ID`
   - `ESCAPE_HATCH_PATREON_TOKEN_KEY` (32-byte key, base64 or hex)
   - `ESCAPE_HATCH_PATREON_OAUTH_STATE_SECRET` (min 16 chars)
4. Apply SQL `0005_patreon_oauth_supabase.sql` (Path A) or `0005_patreon_oauth_portable.sql` (Path B).
5. Sign in on the site, open `/account`, use **Connect Patreon** (POST `/api/patreon/oauth/start` only — GET returns 405).
6. Confirm redirect returns `/account?patreon=linked` with no tokens in the URL.
7. Rotate client secret + token key in the host secret store; never paste tokens into logs or diagnostics.

Rules:

- Refresh tokens are encrypted at rest with the creator-owned key; plaintext never appears in zip, browser bundle, logs, or Relay records after handoff.
- Campaign membership must match `PATREON_CAMPAIGN_ID` **and** `patron_status=active_patron` or linking fails closed.
- OAuth start is POST + same-origin only (account-linking CSRF defense).
- `ESCAPE_HATCH_PATREON_MODE=relay_managed` is **EH-041** (not implemented) — adapter stays stub with an honest reason.
- Soft persona honesty unchanged; premium bytes still require `evaluateAccess` (EH-032/033).

## Visitor visual system (EH-035)

- Cold-gallery tokens (`--eh-*`) with Outfit + Source Sans defaults and cobalt accent `#4a7fc4`.
- Sticky visitor top bar (creator name + Account); Hatch Console / Style dials stay in a demoted operator footer.
- `/account` and `/login` use **PatronChrome** (not Hatch Console tabs).
- Gallery is a media-first mosaic; locked tiles never fetch `/api/media`.

## Account / paywall UX (EH-034)

Visitor surfaces:

| Route | Role |
|-------|------|
| `/account` | Session summary, provider mode, membership/entitlement summary, POST sign-out |
| `/login` | Provider-aware sign-in (Supabase magic link or portable email/password) |
| `/preview`, `/p/[slug]` | Gallery/post with locked vs unlocked honesty |

Rules:

- Locked premium posts **do not** fetch `/api/media/{id}` — overlays show CTAs only.
- Unlocked posts use private media URLs; image load failures show a denied message (stale/401/403 race).
- Soft persona switch appears **only** when `ESCAPE_HATCH_IDENTITY_PROVIDER` is unset/`none`.
- Soft personas **never** elevate under Path A (supabase) or Path B (portable).
- Evaluator reason codes drive visitor copy (`anonymous_denied`, `soft_persona_blocked`, `entitlement_expired`, …) without leaking secrets.
- Independent billing Checkout is **not** live — Account shows an honest “billing not configured (EH-050+)” note; community CTA may still link out.
- Logout remains **POST** `/auth/logout` only.

## Identity provider

`ESCAPE_HATCH_IDENTITY_PROVIDER`:

| Value | Behavior |
|-------|----------|
| unset / `none` | Local preview — soft personas + local-operator admin. If unset **and** Supabase URL+anon are real, Path A auto-selects (EH-030 compat). |
| `supabase` | **Path A** — creator-owned Supabase Auth/Postgres (EH-030). |
| `portable` | **Path B** — creator-owned Postgres + app-managed scrypt passwords + opaque sessions (EH-031). |
| anything else | Fail closed — admin denied; adapters degraded. |

Soft personas never authorize admin or premium server-side when Path A or Path B is active.

## Entitlement evaluation (EH-032)

Server-only module: `lib/entitlements/`.

- `evaluateAccess({ subject, resource, grants, provider })` → `{ allowed, reason, grants, evaluatedAt, stale }`
- Resources: `post`, `media`, `tier_minimum`, `admin_surface`
- Subjects: `anonymous`, `member`, `staff`, `soft_persona` (preview only)
- Grant merge: active Patreon **or** billing **or** unexpired manual (union of tier ids). Staff override allows admin + premium metadata reads.
- Soft persona grants apply **only** when provider is `none` / local_preview — never when supabase/portable is configured.
- Fail closed: missing credentials with provider configured, unknown resource, revoked/expired/stale premium grants.

### Freshness / staleness

| Signal | Meaning |
|--------|---------|
| `stale_after` past | Grant is **stale**. Premium paths **hard-deny** by default (`failClosedOnStale: true`). |
| `expires_at` past | Grant **expired** — deny. |
| `revoked_at` set | Grant **revoked** — deny. |
| `observed_at` older than 12h | Soft UI warning only (`shouldWarnFreshness`) — does not itself deny. |

Default write offsets (when minting snapshots): Patreon 24h, billing 6h, bootstrap 7d, manual uses `expires_at` only.

RLS helpers `eh_private.fresh_entitlement_tiers` / `entitled_for_access` (migration `0004_*`) complement the TypeScript evaluator — they do **not** replace it. Private **bytes** are authorized only via EH-033 `/api/media`.

## Private media delivery (EH-033)

**Model:** Private R2 (or S3-compatible) objects + short-lived signed GET URLs after `evaluateAccess`, with a `local_private` authenticated proxy for kits without R2.

| Mode (`ESCAPE_HATCH_MEDIA_MODE`) | Behavior |
|----------------------------------|----------|
| unset | `private_r2` when R2 signing env is real; else `local_private` |
| `local_private` | Stream from `data/private-media` after entitlement check (CI/local default) |
| `private_r2` | Mint short-lived signed GET; fail closed if credentials missing/placeholder |
| `public_legacy` | Explicit residual leakage mode — do **not** use in production |

Visitor route: `GET /api/media/{mediaId}` → auth + soft-persona cookie (provider `none` only; persona **id**; tiers from bundle) → `evaluateAccess` → redirect/stream; deny otherwise.

### R2 / signing env (names only)

- `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, optional `R2_PUBLIC_BASE_URL`, `R2_REGION`
- `ESCAPE_HATCH_MEDIA_SIGNED_URL_TTL_SEC` (default 60, max 300)
- Bucket: deny public ACLs on premium objects; never commit secrets or long-lived signed URLs
- Rotate access keys in the host secret store; signed URLs are never embedded in client bundles
- Redirect Location hosts are allowlisted (configured R2 endpoint / public base / mock fixture host) — open redirects rejected

### Generator layout

Default fill stages **premium** bytes under `data/private-media` (not `public/media`). Public/free assets may remain under `public/media`. Gallery/post UI loads premium via `/api/media/{id}` only when unlocked.

## Path A — Supabase bootstrap

See `scripts/bootstrap-identity.md`. Apply `db/migrations/0001_preview_chassis.sql`, then `0002_identity_rls.sql`, then `0004_entitlement_evaluator_supabase.sql`.

## Path B — portable Postgres bootstrap

See `scripts/bootstrap-identity.md` and `db/README.md`. Compose profile `db` binds **127.0.0.1:5433** only. Apply `0001` + `0003` + `0004_entitlement_evaluator_portable` (or docker-init scripts). Do **not** apply Path A `0002` / `0004_*_supabase` on Path B.

### Session cookies (Path B)

| Name | Notes |
|------|-------|
| `ESCAPE_HATCH_SESSION_SECRET` | Server HMAC/pepper — rotate invalidates sessions |
| `ESCAPE_HATCH_COOKIE_SECURE` | Optional `1` to force Secure cookies |

Session cookies: httpOnly, SameSite=Lax, path `/`, Secure when `NODE_ENV=production` or `ESCAPE_HATCH_COOKIE_SECURE=1`. Never store the raw token in localStorage.

### Key / password / media rotation (names only)

- **Path A:** rotate anon + service_role in Supabase dashboard; update host secrets; revoke sessions.
- **Path B:** rotate `ESCAPE_HATCH_SESSION_SECRET` (invalidates sessions — revoke `eh_sessions`); re-hash operator passwords with scrypt; rotate `DATABASE_URL` credentials in the host secret store. Never commit secrets.
- **Media (R2):** rotate `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`; keep signed TTL short; revoke old keys after cutover.

## Deploy manifests

| Target | File | Notes |
|--------|------|-------|
| Vercel | `vercel.json` | Next App Router defaults. Golden-path verification is EH-070. |
| Docker | `Dockerfile`, `.dockerignore` | Multi-stage standalone build. Golden-path verification is EH-071. |

Adapter inventory: `escape-hatch.manifest.json` and `lib/adapters/`. Auth/DB/storage readiness is env-honest; billing/deploy remain stub until EH-050/070.

**Not production-safe:** `productionSafe` is false. Account/paywall UX is present, but Milestone 3 security review + browser personas gate, billing, and verified deploy remain open. `public_legacy` and residual public copies are explicitly non-production.

## Security honesty

- Soft gate / demo personas are not entitlements and never authorize admin.
- Soft persona preview is **local_preview only** (provider `none`) — never elevates under Path A/B.
- Entitlement evaluator is server-only — never trust client-passed tier ids or “I am entitled”.
- Default private layout does **not** stage premium originals under `public/media`; visitor premium bytes go through `/api/media` after `evaluateAccess`.
- `ESCAPE_HATCH_MEDIA_MODE=public_legacy` reintroduces world-readable premium copies — residual only; keep `productionSafe` false.
- Service role keys, R2 secrets, and session secrets must never appear in client bundles or committed files.
- Path A RLS uses `auth.uid()`; Path B RLS uses `current_setting('eh.user_id')` set by the server after session validate.
- Both paths: entitled patrons may SELECT premium **metadata** when grants are fresh; premium **bytes** require EH-033 delivery.
- Logout is **POST** `/auth/logout` only (HTTP verb hygiene). Portable login is **POST** `/auth/portable/login` only.
