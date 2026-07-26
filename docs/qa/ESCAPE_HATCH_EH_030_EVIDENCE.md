# Escape Hatch EH-030 milestone evidence

**Status:** Accepted as a preview-only creator-owned Supabase identity/data path  
**Completed:** 2026-07-22  
**Master planner/reviewer:** Sol  
**Implementation builder:** Cursor Grok 4.5 High  
**Security-fix close-out:** subagent `e839418c` (fail-closed RLS + staff-gated admin reads)  
**Slice:** EH-030 — Supabase identity/data path  
**Next dependency:** EH-031 — Portable identity/data path

## Scope and ownership

EH-030 ships optional creator-owned Supabase Auth/Postgres for generated kits:
SQL schema + migrations with fail-closed RLS, typed env (URL/anon/service names),
server/client Supabase clients, login/callback/logout (POST) scaffolding, staff-gated
admin reads and mutations when identity is configured, honest Auth/DB adapter readiness,
and bootstrap docs. Soft persona remains local-preview only and never authorizes admin.

It does not implement portable Postgres/auth without Supabase Auth (**EH-031**),
entitlement SQL evaluator / grant merge (**EH-032**), visitor signed-URL private media
(**EH-033**), billing (**EH-050**), or verified production deploy (**EH-070/071**).

Owned paths in this acceptance commit (current uncommitted deltas only — scaffold
already present under `8b3c6e6` is not re-absorbed):

- Identity / Supabase: `template/lib/identity/**`, `template/lib/supabase/**`,
  `template/lib/admin/load-admin.ts`, `template/lib/admin/require-admin-page.ts`,
  `template/components/admin/AdminAccessDenied.tsx`, admin page/shell/overview wiring,
  `template/components/LoginForm.tsx`, `template/app/globals.css` (access-denied styles)
- DB: `template/db/migrations/0002_identity_rls.sql`, `template/db/schema/**`,
  `template/db/README.md` (honest fail-closed RLS summary)
- Adapters / status / package: `template/lib/adapters/index.ts`, `src/status.ts`,
  `package.json`, `package-lock.json`, `tsconfig.json`
- Fixtures / tests: `fixtures/PROVENANCE.md`, `tests/escape-hatch-identity.test.ts`
  (new) + status / admin / fixtures / theme / library-truth / generated-repo updates
- `docs/qa/ESCAPE_HATCH_EH_030_EVIDENCE.md`

Excluded: `README.md`, `IA.md`, `.out/`, and unrelated dirty tree (web/, `src/autopost`,
schedule-rail, monetization docs, etc.).

## Delivered behavior

### Schema / RLS (fail-closed after security fix)

- Migrations `0001_preview_chassis` + `0002_identity_rls`: sites, tiers, posts, media,
  profiles, memberships, entitlement snapshots; RLS **enabled + forced** on `eh_*`.
- `eh_private.is_site_member` / `is_site_staff` (`SECURITY DEFINER`) avoid policy recursion.
- **Non-staff** (`anon` + patron members) may SELECT only:
  - posts: `access_level = 'public'` **and** `published_at IS NOT NULL`
  - media metadata: `access_level = 'public'`
- Drafts and `member_only` / `tier_gated` rows are **staff-only** — membership alone
  never grants blanket SELECT on premium or unpublished rows (until EH-032 SQL evaluator).
- Patrons read only their own membership/entitlement rows; staff manage their site only.
- Service role bypasses RLS — server-only; never shipped to the browser.

### Admin read + mutation gating (when Supabase configured)

- Identity **unset** (`local_preview`): prior local-operator preview (reads + mutations
  via loopback + `x-escape-hatch-local: 1`) — labeled not authentication.
- Identity **configured**: `assertAdminReadAccess` / `assertAdminMutationAccess` require
  staff session; soft persona never unlocks inventory or writes.
- Denied reads: redirect to `/login?next=…` when unsigned; `AdminAccessDenied` when
  signed-in non-staff; loaders withhold inventory.

### CI without live Supabase

- Package typecheck + Vitest use SQL review and mocks (`eh_ci_*` synthetic env).
- Clean-directory kit `npm install && npm run build` succeeds without Supabase env
  (generated-repo test).
- Human Supabase project creation + SQL apply remains a documented gate
  (`db/README.md`, `scripts/bootstrap-identity.md`) — not automated in CI.

### Status

- Slice advances to **EH-030** with next slice **EH-031**.
- `productionSafe` remains **`false`**.

## Automated evidence

Freeze-rerun 2026-07-22 (Cursor Grok 4.5 High), after security-fix close-out:

| Command | Exit | Result |
|---|---:|---|
| `npm run typecheck --prefix packages/escape-hatch` | 0 | Package TypeScript passed |
| `npm run escape-hatch:test` | 0 | 11 files, **226 tests** passed |
| `npm run status --prefix packages/escape-hatch` | 0 | Slice **EH-030**; next **EH-031**; `productionSafe: false` |

Identity suite covers admin read gate (local_preview allow; configured deny without
staff; inventory withheld) plus env/placeholder and adapter honesty without network.

## Security findings closed (#1–#3)

Security review (scoped to EH-030 identity/RLS/admin) raised three **medium** blockers;
all closed before this acceptance:

| # | Finding | Close-out |
|---|---------|-----------|
| 1 | Patron `member` RLS granted blanket `is_site_member` SELECT on all posts/media metadata (ignored entitlements / `access_level`) | Member policies fail-closed: public published posts / public media only; staff keep full via staff policies |
| 2 | Patron members could read unpublished drafts (`published_at IS NULL`) via member SELECT | Member post SELECT requires `published_at IS NOT NULL` (or staff) |
| 3 | Admin inventory reads were world-visible when Supabase configured (mutations already gated) | `assertAdminReadAccess` + page gate / `AdminAccessDenied`; loaders empty when denied |

Controls re-confirmed: service role server-only, POST-only logout, placeholder env
rejection, cross-site `site_id` binding, soft persona never authorizes admin when
configured, secrets names-only in docs/examples.

## Residual security honesty

**Documented residuals (not solved by EH-030):**

- **EH-031** — Portable Postgres/auth adapter parity for Docker without Supabase Auth
  (migration `0002` still references `auth.users`).
- **EH-032** — Entitlement SQL evaluator / freshness / Patreon-billing-manual grant merge;
  premium metadata SELECT still staff-only at RLS until that evaluator lands.
- **EH-033** — Premium media bytes remain world-readable under `public/media` (known
  prototype leakage); no visitor signed-URL gateway.
- **Human Supabase project gate** — creators must create a project and apply SQL;
  package tests do not prove a live project.
- Soft persona gate on visitor routes remains client-only / non-authoritative.
- `productionSafe` stays **`false`**.

## Browser evidence

EH-030 is identity/schema/gating work. Master browser UX acceptance for visitor theme
and admin chrome remains covered by EH-021/EH-022 evidence. No new visitor redesign
was in scope. Package gates + SQL/admin identity tests are the acceptance surface for
this slice.

## Acceptance decision

EH-030 passes its applicable identity/data-path gate:

- creator-owned Supabase Auth/Postgres schema + fail-closed RLS (public published only
  for non-staff; staff full);
- optional session scaffolding with staff-gated admin reads and mutations when configured;
- CI green without live Supabase; clean kit build without identity env;
- security findings #1–#3 closed;
- status EH-030 → EH-031; `productionSafe: false`;
- residuals EH-031 / EH-033 / human project gate explicitly documented.

This is not portable Docker auth parity, entitlement SQL evaluator, private media
delivery, billing proof, or release / golden-path deploy acceptance.

## Rollback

Revert this EH-030 acceptance commit (scaffold under `8b3c6e6` may remain until that
commit is also reverted). Delete disposable `packages/escape-hatch/.out/eh-030-*`
directories. Stop any local kit `npm run dev`. No provider, credential, or external
production state mutation occurred (tests use mocks; live Supabase apply is human-gated).
