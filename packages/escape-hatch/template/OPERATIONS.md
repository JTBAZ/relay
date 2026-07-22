# Operations (EH-032 entitlement evaluation)

## Local preview

```bash
cp .env.example .env.local   # optional — build works without it
npm install
npm run build
npm run dev
```

No `RELAY_*` or monorepo root `.env` is required. Neither Path A nor Path B must be configured for install/build.

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

RLS helpers `eh_private.fresh_entitlement_tiers` / `entitled_for_access` (migration `0004_*`) complement the TypeScript evaluator — they do **not** replace it, and they do **not** authorize private media bytes (EH-033).

## Environment

Typed contract: `lib/env.ts`. Names-only example: `.env.example`.

### Path A — Supabase (optional)

| Names | Role |
|-------|------|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + user-scoped server client |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Server aliases when public vars unset |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** — bootstrap/recovery |

### Path B — portable (optional)

| Names | Role |
|-------|------|
| `ESCAPE_HATCH_IDENTITY_PROVIDER=portable` | Required (Path B is never auto-selected) |
| `DATABASE_URL` | Postgres connection string |
| `ESCAPE_HATCH_SESSION_SECRET` | Server pepper for hashing opaque session tokens |
| `ESCAPE_HATCH_COOKIE_SECURE` | Optional `1` to force Secure cookies |

Session cookies: httpOnly, SameSite=Lax, path `/`, Secure when `NODE_ENV=production` or `ESCAPE_HATCH_COOKIE_SECURE=1`. Never store the raw token in localStorage.

Bootstrap/recovery: `scripts/bootstrap-identity.md` and `db/README.md`.

## Database

SQL under `db/schema/` and `db/migrations/`:

| Order | Path A (Supabase) | Path B (portable / Docker) |
|-------|-------------------|----------------------------|
| 1 | `0001_preview_chassis.sql` | `0001_preview_chassis.sql` |
| 2 | `0002_identity_rls.sql` (`auth.users`) | `0003_portable_identity.sql` (no `auth.users`) |
| 3 | `0004_entitlement_evaluator_supabase.sql` | `0004_entitlement_evaluator_portable.sql` |

Do **not** mix `0002` and `0003` on the same database. Do **not** apply the Path A `0004_*_supabase` file on Path B (it references `auth.uid()` / `auth.users`).

### Path B Compose Postgres

Loopback bind only (`127.0.0.1:5433`), dev password — do not expose the profile DB:

```bash
docker compose --profile db up -d
```

Init applies `db/docker-init/` → chassis + portable identity + entitlement evaluator. Example `DATABASE_URL`:

`postgresql://escape_hatch:escape_hatch_dev_only@127.0.0.1:5433/escape_hatch`

### Key / password rotation (names only)

- **Path A:** rotate anon + service_role in Supabase dashboard; update host secrets; revoke sessions.
- **Path B:** rotate `ESCAPE_HATCH_SESSION_SECRET` (invalidates sessions — revoke `eh_sessions`); re-hash operator passwords with scrypt; rotate `DATABASE_URL` credentials in the host secret store. Never commit secrets.

## Deploy manifests

| Target | File | Notes |
|--------|------|-------|
| Vercel | `vercel.json` | Next App Router defaults. Golden-path verification is EH-070. |
| Docker | `Dockerfile`, `.dockerignore` | Multi-stage standalone build. Golden-path verification is EH-071. |

Adapter inventory: `escape-hatch.manifest.json` and `lib/adapters/`. Auth/DB readiness is env-honest; storage/billing/deploy remain degraded/stub until EH-033/050/070.

**Not production-safe:** `productionSafe` is false. Docker images that `COPY public/` ship `public/media` when present — prototype leakage until EH-033 private delivery.

## Security honesty

- Soft gate / demo personas are not entitlements and never authorize admin.
- Entitlement evaluator is server-only — never trust client-passed tier ids or “I am entitled”.
- Premium media may still be world-readable under `public/media` until EH-033 (including inside Docker images that copy `public/`).
- Service role keys and session secrets must never appear in client bundles or committed files.
- Path A RLS uses `auth.uid()`; Path B RLS uses `current_setting('eh.user_id')` set by the server after session validate.
- Both paths: entitled patrons may SELECT premium **metadata** when grants are fresh; private **bytes** remain EH-033.
- Logout is **POST** `/auth/logout` only (HTTP verb hygiene). Portable login is **POST** `/auth/portable/login` only.
