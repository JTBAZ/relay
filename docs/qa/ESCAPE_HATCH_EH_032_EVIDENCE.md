# Escape Hatch EH-032 milestone evidence

**Status:** Accepted as a preview-only entitlement evaluation service  
**Completed:** 2026-07-22  
**Master planner/reviewer:** Sol  
**Implementation builder:** Cursor Grok 4.5 High  
**Acceptance close-out:** Sol (contract + security review; soft_persona grant strip when provider configured)  
**Slice:** EH-032 — Entitlement service  
**Next dependency:** EH-033 — Private media delivery

## Scope and ownership

EH-032 ships a server-only entitlement evaluator for generated kits:
`evaluateAccess` / `evaluateCurrentAccess` with `{ allowed, reason, grants,
evaluatedAt, stale }`, Patreon **or** billing **or** manual grant merge with
freshness (stale / expired / revoked fail-closed for premium), staff override,
soft persona only when `ESCAPE_HATCH_IDENTITY_PROVIDER` resolves to `none`,
path-specific SQL `0004_entitlement_evaluator_{supabase,portable}.sql` (no
subject-helper mixing), post-page wiring that prefers server evaluation when
Path A/B is configured, and status EH-032 → EH-033 with `productionSafe: false`.

It does **not** implement private media / signed R2 delivery (**EH-033**),
billing adapters (**EH-050**), or verified production deploy (**EH-070/071**).
The evaluator complements RLS; it does not replace it and does not authorize
premium **bytes**.

Owned paths in this acceptance commit:

- Evaluator: `template/lib/entitlements/**`
- Identity snapshot fields: `template/lib/identity/{entitlements,session,types}.ts`,
  `template/lib/portable-auth/session.ts`
- DB: `template/db/migrations/0004_entitlement_evaluator_{supabase,portable}.sql`,
  matching `schema/` + Path B `docker-init/03_entitlement_evaluator.sql`,
  `db/README.md`
- Post wiring: `template/app/p/[slug]/page.tsx`, `template/components/PostView.tsx`
- Ops/docs: `template/OPERATIONS.md`, `OWNERSHIP.md`, `scripts/bootstrap-identity.md`,
  `escape-hatch.manifest.json`
- Package: `src/status.ts`, `src/fill-template.ts`
- Tests: `tests/escape-hatch-entitlements.test.ts` + status/identity/admin/theme/
  portable/generated-repo/library-truth expectation updates
- `docs/qa/ESCAPE_HATCH_EH_032_EVIDENCE.md`

Excluded: `README.md`, `IA.md`, `.tmp/`, and unrelated dirty tree (web/,
`src/autopost`, schedule-rail, monetization docs, etc.).

## Delivered behavior

### Evaluator API

| Surface | Role |
|---|---|
| `evaluateAccess` | Pure server evaluator — no I/O; returns allowed/reason/grants/evaluatedAt/stale |
| `mergeEntitlementGrants` | Union of active Patreon / billing / manual tier ids |
| `evaluateCurrentAccess` / `evaluatePostAccess` | Loads session + own snapshot; soft persona only if provider `none` |
| `evaluateAdminSurfaceAccess` | Staff-only; does **not** replace `assertAdminReadAccess` |

### Grant merge matrix

| Condition | Result |
|---|---|
| Staff subject (site-matched) | `staff_override` allow for premium metadata + admin surfaces |
| Active Patreon **or** billing **or** unexpired manual | Union tiers; allow if gate met |
| Expired / revoked / stale (premium, fail-closed) | Deny with reason codes |
| Soft persona + provider supabase/portable | `soft_persona_blocked` (subject **and** soft_persona-sourced grant rows) |
| Soft persona + provider `none` | Preview allow/deny by persona tiers (non-production) |
| Soft persona → admin surface | Always deny |
| Anonymous + provider configured | `anonymous_denied` for premium |
| Public resource | Allow without entitlement |
| Unpublished post | Deny non-staff |
| Invalid provider | Fail closed |

### SQL split (Path A vs Path B)

| | Path A | Path B |
|---|---|---|
| Apply after | `0001` + `0002` | `0001` + `0003` |
| Subject | `auth.uid()` / `auth.users` | `eh_private.current_user_id()` ← `eh.user_id` |
| Migration id | `0004_entitlement_evaluator_supabase` | `0004_entitlement_evaluator_portable` |
| Docker init | N/A | `03_entitlement_evaluator.sql` (portable copy) |

Do **not** mix Path A `0004_*_supabase` onto Path B (or vice versa).

Helpers: `eh_private.fresh_entitlement_tiers`, `eh_private.entitled_for_access`,
`expires_at` / `revoked_at` on snapshots, `eh_entitlement_grant_audit`.
Anon/public SELECT policies remain fail-closed for non-public metadata.

### Post page

When provider is supabase/portable, `PostView` unlock follows server
`evaluatePostAccess` — soft persona cannot elevate. When provider is `none`,
local soft-persona UX remains labeled non-authoritative.

### Status

- Slice advances to **EH-032** with next slice **EH-033**.
- `productionSafe` remains **`false`**.
- Capability `entitlement-evaluator` is `preview_only` and explicitly notes
  evaluator ≠ private media.

## Automated evidence

Freeze-rerun 2026-07-22 (Sol acceptance), after soft_persona grant-strip hardening:

| Command | Exit | Result |
|---|---:|---|
| `npm run typecheck --prefix packages/escape-hatch` | 0 | Package TypeScript passed |
| `npm run escape-hatch:test` | 0 | 13 files, **256 tests** passed |
| `npx tsx packages/escape-hatch/src/cli.ts status --json` | 0 | Slice **EH-032**; next **EH-033**; `productionSafe: false` |

(Windows note: `npm run status -- --json` may strip flags; positional `status json`
or direct `tsx … status --json` is reliable.)

Entitlement suite covers grant-merge allow/deny, soft-persona honesty (including
injected soft_persona-sourced grants under configured provider), freshness
helpers, and Path A/B SQL text review (portable has no `auth.uid()`) — no live
Postgres required. Fixture secret/PII scan remains green via existing EH-010 suite.

## Security review (mandatory gate)

| Severity | Finding | Disposition |
|---|---|---|
| **Medium** (closed) | Pure `evaluateAccess` could merge caller-injected `source: soft_persona` grants under a member subject when provider was configured | Fixed in acceptance: strip soft_persona-sourced grants when provider is supabase/portable; test asserts deny |
| Medium (residual) | SQL `tier_gated` uses array overlap (`&&`) — exact tier ids only; TS supports `tier_or_higher` via catalog | Documented: TS evaluator is UX/API source of truth; RLS is stricter/fail-closed complement |
| Medium (residual) | Default Docker `DATABASE_URL` uses the Postgres role owner (trusted like service role); least-privilege `SET ROLE eh_app` remains documented intent | Same residual as EH-031; app-layer gates + SQL policy text remain honesty bar |
| Medium (residual) | Premium **bytes** still world-readable under `public/media` | Known until **EH-033**; `productionSafe: false` |
| Low | `SECURITY DEFINER` helpers use `SET search_path = public` (same pattern as EH-030/031) | Acceptable for this slice; harden later if roles broaden |
| Low | Grant audit / entitlement payloads must never serialize password hashes or session secrets | Confirmed grant shapes are tier/source/timestamps/reason only |

Controls confirmed:

- Never trust client-passed “I am entitled”; post unlock under Path A/B uses server evaluation.
- Soft persona blocked when supabase/portable configured (subject + grant-source strip).
- Soft persona → admin always deny; EH-030/031 `assertAdminReadAccess` /
  `assertAdminMutationAccess` unchanged.
- No secret/hash leakage via entitlement payloads.
- Path A 0004 uses `auth.uid()` only; Path B 0004 uses `eh.user_id` path only — no mixing.
- Anon SELECT policies remain public-only; entitled SELECT is authenticated/eh_app + fresh grants.
- Fixture/secret scan still green; no live secrets committed.
- Local mutation loopback / logout POST-only unchanged.
- `productionSafe` remains false; public/media leakage acknowledged until EH-033.

## Residual security honesty

**Documented residuals (not solved by EH-032):**

- **EH-033** — Premium media bytes remain world-readable under `public/media`; no
  visitor signed-URL gateway.
- **Human Postgres gate** — creators must apply SQL / bootstrap operator; package
  tests do not prove a live database.
- Soft persona gate on visitor routes remains client-only when provider is `none`.
- Privileged `DATABASE_URL` role remains the practical server connection for
  Path B bootstrap (like Path A service role).
- SQL exact-overlap vs TS `tier_or_higher` divergence until a later catalog-aware
  SQL helper (if needed).
- `productionSafe` stays **`false`**.

## Browser evidence

EH-032 is evaluator/SQL/gating work. Master browser UX acceptance for visitor
theme and admin chrome remains covered by EH-021/EH-022 evidence. Post-page
serverAccess wiring is covered by package tests + code review. No new visitor
redesign was in scope beyond entitlement reason copy when identity is configured.

## Acceptance decision

EH-032 passes its applicable entitlement-service gate:

- Server-only `evaluateAccess` contract with reason codes, grants, evaluatedAt, stale;
- Grant merge + freshness fail-closed for premium;
- Soft persona never elevates when Path A/B configured (including grant-source strip);
- Path-specific 0004 SQL without subject-helper mixing;
- Admin staff gates from EH-030/031 not weakened;
- Post-page prefers server evaluation when identity configured;
- Docs note evaluator ≠ private media;
- CI green without live DB; status EH-032 → EH-033; `productionSafe: false`;
- Residuals EH-033 / human apply gate / privileged DB role explicitly documented.

This is not private media delivery, billing proof, or release / golden-path deploy
acceptance.

## Rollback

Revert this EH-032 acceptance commit. Delete disposable
`packages/escape-hatch/.out/eh-032-*` directories if any. Stop any local kit
`npm run dev` and optional `docker compose --profile db`. No provider, credential,
or external production state mutation occurred (tests use mocks/SQL review; live
Postgres apply remains human-gated).
