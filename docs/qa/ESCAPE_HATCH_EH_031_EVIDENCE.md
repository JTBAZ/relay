# Escape Hatch EH-031 milestone evidence

**Status:** Accepted as a preview-only portable identity/data path (Path B)  
**Completed:** 2026-07-22  
**Master planner/reviewer:** Sol  
**Implementation builder:** Cursor Grok 4.5 High  
**Acceptance close-out:** Sol (contract + security review; `SET LOCAL eh.user_id` transaction wrap)  
**Slice:** EH-031 — Portable identity/data path  
**Next dependency:** EH-032 — Entitlement service

## Scope and ownership

EH-031 ships optional Path B portable Postgres + app-managed auth for generated kits:
`ESCAPE_HATCH_IDENTITY_PROVIDER=none|supabase|portable` (unknown fails closed), scrypt
password hashes, opaque httpOnly sessions (token hash at rest), migration `0003`
RLS via `current_setting('eh.user_id')` (no `auth.uid()` / `auth.users`), Docker
init on loopback `127.0.0.1:5433`, staff-gated admin reads/mutations when portable
is configured, and bootstrap/ops docs. Soft persona never authorizes admin.
Path A (`0002`) remains intact; docs forbid mixing `0002` and `0003` on one DB.

It does not implement entitlement SQL evaluator / grant merge (**EH-032**),
visitor signed-URL private media (**EH-033**), billing (**EH-050**), or verified
production deploy (**EH-070/071**).

Owned paths in this acceptance commit:

- Portable auth: `template/lib/portable-auth/**`, `template/app/auth/portable/**`,
  `template/components/PortableLoginForm.tsx`, login/logout wiring
- Identity/env/adapters/admin: `template/lib/env.ts`, `template/lib/identity/**`,
  `template/lib/adapters/index.ts`, `template/lib/admin/load-admin.ts`, admin UI copy
- DB: `template/db/migrations/0003_portable_identity.sql`, schema + `docker-init/`,
  `0002` coexistence note, `db/README.md`
- Ops: `template/OPERATIONS.md`, `OWNERSHIP.md`, `.env.example`,
  `scripts/bootstrap-identity.md`, `docker-compose.yml`, manifest
- Package: `src/status.ts`, `src/fill-template.ts`, `package.json`, fixtures provenance
- Tests: `tests/escape-hatch-portable-identity.test.ts` + status/admin/identity updates
- `docs/qa/ESCAPE_HATCH_EH_031_EVIDENCE.md`

Excluded: `README.md`, `IA.md`, `.tmp/`, and unrelated dirty tree (web/, `src/autopost`,
schedule-rail, monetization docs, etc.).

## Delivered behavior

### Provider mode matrix

| Setting | Result |
|---|---|
| unset + no Supabase env | `none` (local preview) |
| unset + real Supabase URL/anon | `supabase` (EH-030 auto-select preserved) |
| `none` | local preview even if Supabase env present |
| `portable` + `DATABASE_URL` + `ESCAPE_HATCH_SESSION_SECRET` | Path B |
| portable env without explicit `portable` | stays `none` (never auto-selected) |
| unknown string | fail closed (`IdentityProviderError` / `invalid`) |

### Schema / RLS (Path B)

- Migrations: Path B applies `0001` + `0003` (Docker init copies). Path A applies
  `0001` + `0002`. Do **not** mix `0002` and `0003` on one database.
- App-managed `eh_users` (scrypt hash column) + `eh_sessions` (token hash only).
- Membership / entitlement shapes mirror Path A; FKs reference `eh_users`.
- RLS subject: `eh_private.current_user_id()` ← `current_setting('eh.user_id')`.
- **Non-staff** may SELECT only public published posts and public media metadata
  (same fail-closed bar as EH-030 until EH-032).
- `withPortableClient` runs work inside `BEGIN`/`COMMIT` so `set_config(..., true)`
  (SET LOCAL) persists for subsequent queries in the callback.

### Auth / sessions

- Passwords: Node `scrypt` (N=16384, r=8, p=1, 64-byte key); no plaintext at rest.
- Sessions: 32-byte opaque cookie (`eh_portable_session`, httpOnly, SameSite=lax);
  SHA-256(pepper:token) stored; raw token never in Postgres / localStorage.
- Login POST-only; logout POST-only (GET returns 405, no session mutation).
- Session secret and DB URL are server-only; never shipped to the browser.

### Admin gating (when portable configured)

- `assertAdminReadAccess` / `assertAdminMutationAccess` require staff session.
- Soft persona never unlocks inventory or writes.
- When provider is `none`: prior local-operator preview (loopback +
  `x-escape-hatch-local: 1`) — labeled not authentication; rules not weakened.
- Unknown provider: deny (no local-preview fallback).

### Status

- Slice advances to **EH-031** with next slice **EH-032**.
- `productionSafe` remains **`false`**.

## Automated evidence

Freeze-rerun 2026-07-22 (Sol acceptance), after `SET LOCAL` transaction fix:

| Command | Exit | Result |
|---|---:|---|
| `npm run typecheck --prefix packages/escape-hatch` | 0 | Package TypeScript passed |
| `npm run escape-hatch:test` | 0 | 12 files, **241 tests** passed |
| `npx tsx packages/escape-hatch/src/cli.ts status --json` | 0 | Slice **EH-031**; next **EH-032**; `productionSafe: false` |

(Windows note: `npm run status -- --json` may strip flags; positional `status json`
or direct `tsx … status --json` is reliable.)

Portable suite covers SQL/RLS text review (no `auth.uid`), provider matrix, scrypt
+ session cookie flags, adapter honesty, admin deny without staff, BEGIN wrap for
`eh.user_id`, and POST-only login/logout — no live Postgres required.

## Security review (mandatory gate)

| Severity | Finding | Disposition |
|---|---|---|
| **High** (closed) | `set_config('eh.user_id', …, true)` without a transaction — claim vanished before next query, breaking RLS for `eh_app` / FORCE policies | Fixed in acceptance: `withPortableClient` wraps callback in `BEGIN`/`COMMIT`/`ROLLBACK`; test asserts BEGIN + set_config |
| Medium (residual) | Default Docker `DATABASE_URL` uses the Postgres role owner (trusted like service role); least-privilege `SET ROLE eh_app` is documented intent, not the default Node path | Documented; app-layer staff gates + SQL policy text remain the Path B honesty bar for this slice |
| Medium (residual) | Premium **bytes** still world-readable under `public/media` | Known until **EH-033**; `productionSafe: false` |
| Low | Self SELECT policy can read `password_hash` column under `eh_app` — must never serialize to browser APIs | Server login path only today; keep out of JSON responses |
| Low | scrypt params are acceptable interactive defaults; argon2id not required for accept | Noted for future hardening |

Controls confirmed:

- No plaintext passwords; session tokens hashed at rest; httpOnly cookies.
- No service-role / session secret to browser.
- Path B RLS does **not** rely on `auth.uid()`.
- Non-staff cannot SELECT premium post/media metadata (SQL policies).
- Fixture/secret scan still green; no live secrets committed (CI placeholders only).
- Local mutation loopback / `x-escape-hatch-local` not weakened.
- `productionSafe` remains false.

## Mode matrix Path A vs Path B

| | Path A (EH-030) | Path B (EH-031) |
|---|---|---|
| Provider | `supabase` (or unset + real Supabase env) | explicit `portable` only |
| Migrations | `0001` + `0002` | `0001` + `0003` |
| Subject | `auth.uid()` / `auth.users` | `eh.user_id` / `eh_users` |
| Auth UX | Supabase magic-link / session | email + password + opaque cookie |
| Compose | N/A (Supabase cloud) | `127.0.0.1:5433` profile `db` |
| Mix on one DB | **Forbidden** with 0003 | **Forbidden** with 0002 |

## Residual security honesty

**Documented residuals (not solved by EH-031):**

- **EH-032** — Entitlement SQL evaluator / freshness / Patreon-billing-manual grant
  merge; premium metadata SELECT still staff-only at RLS until that evaluator lands.
- **EH-033** — Premium media bytes remain world-readable under `public/media`.
- **Human Postgres gate** — creators must apply SQL / bootstrap operator (Docker or
  `psql`); package tests do not prove a live database.
- Soft persona gate on visitor routes remains client-only / non-authoritative.
- Privileged `DATABASE_URL` role remains the practical server connection for login
  bootstrap (like Path A service role); wire `eh_app` for least privilege later.
- `productionSafe` stays **`false`**.

## Browser evidence

EH-031 is identity/schema/gating work. Master browser UX acceptance for visitor
theme and admin chrome remains covered by EH-021/EH-022 evidence. No new visitor
redesign was in scope. Package gates + SQL/admin/portable identity tests are the
acceptance surface for this slice.

## Acceptance decision

EH-031 passes its applicable portable identity/data-path gate:

- Path B Postgres/auth adapter parity for Docker without Supabase Auth;
- provider contract (portable never auto-selected; unknown fail-closed; Path A compat);
- fail-closed RLS text (public published only for non-staff; `eh.user_id` subject);
- scrypt + httpOnly hashed sessions; staff-gated admin when portable configured;
- SET LOCAL transaction fix closed before accept;
- CI green without live DB; status EH-031 → EH-032; `productionSafe: false`;
- residuals EH-032 / EH-033 / human apply gate explicitly documented.

This is not entitlement SQL evaluator, private media delivery, billing proof, or
release / golden-path deploy acceptance.

## Rollback

Revert this EH-031 acceptance commit. Delete disposable
`packages/escape-hatch/.out/eh-031-*` directories if any. Stop any local kit
`npm run dev` and optional `docker compose --profile db`. No provider, credential,
or external production state mutation occurred (tests use mocks/SQL review; live
Postgres apply remains human-gated).
