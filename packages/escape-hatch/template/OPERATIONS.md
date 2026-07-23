# Operations (EH-052 provider policy + EH-051 Stripe adapter + EH-050 billing contract + EH-043 OAuth choice/migration + EH-042 connector billing + EH-041 Relay-managed verify + EH-040 creator Patreon OAuth + EH-035 visitor visual + EH-034 account / paywall UX)

## Local preview

```bash
cp .env.example .env.local   # optional — build works without it
npm install
npm run build
npm run dev
```

No `RELAY_*` or monorepo root `.env` is required. Neither Path A nor Path B must be configured for install/build.

## Billing provider contract (EH-050) + Stripe adapter (EH-051)

Independent-site billing uses a shared `BillingProvider` contract in `lib/adapters/types.ts` with helpers under `lib/billing/`:

| Concern | Module / behavior |
|---------|-------------------|
| Lifecycle events | `subscription.created\|updated\|canceled\|past_due\|renewed\|…` (canonical) |
| Normalize | `normalizeWebhookEvent` — requires `signatureVerified`; unsigned/malformed fail closed |
| Entitlements | `applyBillingEntitlementEvent` → snapshot upsert with `source: "billing"` (EH-032 merge) |
| Readiness / policy | `reportBillingReadiness` / capability matrix / policy declaration |
| Default adapter | `implementation: "stub"` — money paths fail closed |
| Stripe adapter | `ESCAPE_HATCH_BILLING_PROVIDER=stripe` + `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` |

### Stripe routes (EH-051)

| Route | Role |
|-------|------|
| `POST /api/billing/webhook` | Stripe-Signature verify → normalize → preview entitlement apply |
| `POST /api/billing/checkout` | Hosted Checkout Session (session required when identity configured) |
| `POST /api/billing/portal` | Customer Portal session |

Helpers: `startIndependentCheckout` / `startCustomerPortal` in `lib/billing/hooks.ts` for `/tiers`, paywalls, and `/account` (EH-054 maps tiers and duplicate-billing UX).

### Boundary honesty

- Entitlement service consumes **normalized events only** — never provider-specific client payloads as grants.
- Creator is the business the patron pays; Relay takes **no %** of independent-site subscription revenue in v1.
- Prefer **restricted API keys** (`rk_`) over secret keys when Stripe supports the needed permissions.
- Never pass `payment_method_types` on Checkout — use dynamic payment methods.
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` are server-only — never ship them in the browser bundle.
- Secrets are **not** required for `npm run build`.
- **EH-052/053/054:** content/use attestation + dated policy matrix gate independent Checkout. Admin: `/admin/billing/policy` + `/admin/tiers` map/preflight. Visitor `/tiers` uses server-resolved CTAs; duplicate Checkout blocked when equivalent access exists. Stripe-gap: NOWPayments crypto; CCBill/Segpay merchant-approval guidance. See `docs/studio/escape-hatch-build-plans/15-ALTERNATE-BILLING-RECIPES.md`.
- Webhook entitlement sink is **process-local preview memory** until durable SQL store lands; `productionSafe` stays false.

## OAuth choice and migration UX (EH-043)

Neutral Hatch Console surfaces (not visitor gallery):

| Route | Role |
|-------|------|
| `/admin/patreon/choice` | Equal-weight choice: **Own your Patreon connection** vs **Let Relay maintain it**. Neither is preselected; Continue disabled until explicit selection. |
| `/admin/patreon` | Health summary, per-mode setup checklists, billing entitlement mirror, switch-off / migration |

### Honesty rules

- Managed path **cannot** be a default selection.
- Disclosure cards always show data handled, runtime dependencies, cancellation effects, and migration path for both options.
- Managed monthly list price mirrors EH-042 product copy (`$29.00/mo` default; override with `ESCAPE_HATCH_RELAY_CONNECTOR_PRICE_CENTS`).
- Preference file `data/patreon-mode-preference.json` stores **non-secret** operator intent only (fail closed if corrupt / secret-looking keys). Runtime authority remains `ESCAPE_HATCH_PATREON_MODE`.
- Switch-off toward `creator_oauth` does **not** rebuild the kit and does **not** delete linked patrons.
- Cancellation / grace: show exact last service date when mirrored; warn before Patreon-derived entitlements go stale.
- Bounded outage: when managed is selected but kill-switched / not entitled / incomplete, health shows fail-closed copy while native accounts/media/admin continue.

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
- Soft persona honesty unchanged; premium bytes still require `evaluateAccess` (EH-032/033).

## Relay-managed Patreon verification (EH-041)

Optional monthly Relay service — replaceable with creator_oauth without rebuilding the site.

1. Set `ESCAPE_HATCH_PATREON_MODE=relay_managed` and:
   - `ESCAPE_HATCH_RELAY_VERIFY_BASE_URL` (Relay origin)
   - `ESCAPE_HATCH_RELAY_SITE_ID`
   - `ESCAPE_HATCH_RELAY_ASSERTION_AUDIENCE`
   - `ESCAPE_HATCH_RELAY_ASSERTION_ISSUER`
   - `ESCAPE_HATCH_RELAY_ASSERTION_JWKS_URL` and/or `ESCAPE_HATCH_RELAY_ASSERTION_KEYS_JSON` (overlapping public keys)
   - `ESCAPE_HATCH_RELAY_VERIFY_STATE_SECRET` (min 16 chars)
2. Register `{NEXT_PUBLIC_SITE_URL}` origin + `/api/patreon/relay/callback` on Relay (allowlist).
3. Kill switch: `ESCAPE_HATCH_RELAY_VERIFY_ENABLED=0` fails closed.
4. Relay mutating APIs (`/sites`, `/complete`, rotate, revoke) require operator token `ESCAPE_HATCH_RELAY_MANAGED_VERIFY_OPERATOR_TOKEN` (never public).
5. From `/account`, **Verify with Patreon (Relay)** → POST `/api/patreon/relay/start` (GET → 405).
6. Site verifies EdDSA (Ed25519) assertion: iss/aud/kid/exp/nbf/nonce/observation time + `patron_status=active_patron` + replay store; applies entitlement `source: patreon`.
7. Export non-secret migration metadata from `/admin/patreon` + Relay `.../migration-export`.

### Service boundary (honesty)

- Relay authenticates Patreon and returns a short-lived signed assertion scoped to the site.
- Relay does **not** serve site media, hold site billing credentials, or become the site's account database.
- Site does **not** hold Patreon refresh tokens in relay_managed mode.

### Privacy / data-processing disclosure (names only)

Relay may process: site id, allowlisted callback origin, opaque Patreon user id, mapped tier ids, entitlement observation timestamps, assertion jti (replay). Relays must **not** retain site Stripe secrets, admin passwords, or premium media. Creators remain controllers of site accounts; Relay is a processor for verification only while the add-on is active.

## Relay connector billing entitlement (EH-042)

Separate monthly add-on on the creator's **Relay** invoice (`relay_managed_patreon_connector`). The kit does **not** run Stripe Checkout for this add-on — it observes entitlement truth.

### Env names (observation / kill switch — no secrets)

| Name | Role |
|------|------|
| `ESCAPE_HATCH_RELAY_CONNECTOR_BILLING_ENABLED` | Feature flag mirror; `0`/`false`/`off` denies managed connector |
| `ESCAPE_HATCH_RELAY_CONNECTOR_ENTITLEMENT_STATUS` | `active` \| `grace` \| `cancelled` \| `past_due` \| `none` |
| `ESCAPE_HATCH_RELAY_CONNECTOR_LAST_SERVICE_DATE` | ISO last service / stale boundary |

Unset status defaults to **active** for local preview. Mirror Relay webhook state in production.

### Honesty rules

- When billing is inactive / cancelled past grace / flag off: `relay_managed` adapter health reports degraded/denied; **creator_oauth still works**.
- Cancellation copy states the exact last service date and creator-owned OAuth migration steps (`/admin/patreon`).
- Warn before Patreon-derived entitlements go stale; **do not delete linked patrons**.
- Native site accounts, Stripe subscriptions (when configured), media, and admin continue after connector cancel.
- Relay service env (operators): `ESCAPE_HATCH_MANAGED_VERIFY_BILLING_ENABLED`, `ESCAPE_HATCH_MANAGED_VERIFY_PRICE_CENTS`, `ESCAPE_HATCH_MANAGED_VERIFY_GRACE_DAYS`, `ESCAPE_HATCH_MANAGED_VERIFY_BILLING_WEBHOOK_SECRET`. Signature verification is **required by default**; unsigned only with explicit `ESCAPE_HATCH_MANAGED_VERIFY_BILLING_SIGNATURE_REQUIRED=0` or `ESCAPE_HATCH_MANAGED_VERIFY_BILLING_ALLOW_UNSIGNED=1` (CI/dev). Webhook route uses raw body + HMAC.

### Residuals (not production-safe yet)

- In-memory Relay registry / keyring / billing store in CI; production persistence + multi-tenant hard isolation remain open.
- Live Patreon OAuth inside Relay start is mocked in preview (`POST .../complete`).
- Token refresh / provider failure monitoring are stub metric hooks.
- Milestone 4 residual: live multi-tenant managed-verify outage + migration drill beyond kit/CI honesty.
- `productionSafe` remains **false**.

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
- Independent billing Checkout is available when `ESCAPE_HATCH_BILLING_PROVIDER=stripe` and Stripe secrets are configured (EH-051). Stub default remains honest “not configured”. Account notes reflect readiness. EH-054 maps tiers and duplicate-billing UX.
- Logout remains **POST** `/auth/logout` only.

## Posts/media CMS (EH-060)

Local-kit mutations only (`productionSafe: false`):

| Surface | Role |
|---------|------|
| `/admin/posts` | Create/edit/publish/draft; pin via `feature_order`; plain body; public cover media id |
| `POST` / `DELETE` `/api/admin/posts` | Upsert / delete post rows in `data/site.json` (admin mutation gate) |
| `POST` `/api/admin/media/upload` | Multipart → `data/private-media/` + attach to post |
| Gallery | Search (mosaic→feed), draft hidden from visitors, `feature_order` sort, locked public cover via `/media/…` |

Deferrals: R2 multipart upload, schedule cron, rich HTML body. Prefer plain `body_plain` until a sanitizer lands.

## Tiers/patrons CMS (EH-061)

| Surface | Role |
|---------|------|
| `/admin/tiers` | Edit benefit copy / retire tiers; persona access preview; EH-054 billing map |
| `POST /api/admin/tiers` | Upsert tier fields on `data/site.json` |
| `/admin/patrons` | Manual grants, access-reason inspect, portable session revoke |
| `GET/POST/DELETE /api/admin/grants` | Local `data/manual-grants.json` CRUD + inspect |
| `POST /api/admin/sessions/revoke` | Path B portable only — revoke all sessions for a user id |
| Visitor `/tiers` | Omits `retired: true` tiers from the public catalog |

Deferrals: Supabase staff session revoke, lawful PII export, live Stripe portal from /account.

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

Adapter inventory: `escape-hatch.manifest.json` and `lib/adapters/`. Auth/DB/storage readiness is env-honest; billing is EH-050 contract + EH-051 Stripe adapter (stub default); provider policy is EH-052; deploy verification remains EH-070.

**Not production-safe:** `productionSafe` is false. Account/paywall UX and Stripe adapter are present, but Milestone 3 security review + browser personas gate, provider policy router (EH-052), and verified deploy remain open. `public_legacy` and residual public copies are explicitly non-production.

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
