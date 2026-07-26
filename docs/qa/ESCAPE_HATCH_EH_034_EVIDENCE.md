# Escape Hatch EH-034 milestone evidence

**Status:** Accepted as a preview-only account / paywall UX path  
**Completed:** 2026-07-22  
**Master planner/reviewer:** Sol  
**Implementation builder:** Cursor Grok 4.5 High  
**Acceptance close-out:** Sol (contract + security review + best-effort browser personas)  
**Slice:** EH-034 — Account/paywall UX  
**Next dependency:** EH-040 — Creator-owned Patreon OAuth

## Scope and ownership

EH-034 ships honest account and paywall surfaces for generated kits:

- `/account` — session / provider / membership summary; POST-only sign-out.
- `PaywallOverlay` / `EntitlementStatusBanner` / reason-code CTAs without
  leaking evaluator internals.
- Locked gallery/post UI never constructs or fetches `/api/media/{id}`.
- Soft persona switch + cookie write only when identity provider is `none`;
  Path A/B hide the switch and keep EH-032 `soft_persona_blocked` / anonymous
  denial on premium delivery.
- Status advances EH-034 → EH-040; `productionSafe` remains **`false`**
  (Milestone 3 residual browser/security gate, `public_legacy`, billing, deploy).

It does **not** implement Patreon OAuth (**EH-040**), billing adapters
(**EH-050**), or verified production deploy (**EH-070/071**). Live Path A/B
signed-in / staff browser sessions were not exercised (no invented credentials).

Owned paths in this acceptance commit:

- Account: `template/app/account/page.tsx`, `template/components/AccountShell.tsx`,
  `template/components/SignOutButton.tsx`, `template/lib/account/summary.ts`
- Paywall UX: `template/components/PaywallOverlay.tsx`,
  `template/components/EntitlementStatusBanner.tsx`,
  `template/components/VisitorMedia.tsx`, `template/lib/paywall/**`,
  `template/components/PaywallTeaser.tsx`
- Visitor chrome: `template/components/{GalleryApp,PostView,PatronChrome}.tsx`,
  `template/app/preview/page.tsx`, `template/app/globals.css`,
  `template/components/ConsoleNav.tsx`
- Auth UX: `template/app/auth/{logout,callback}/route.ts`,
  `template/app/login/page.tsx`, `template/components/{LoginForm,PortableLoginForm}.tsx`
- Fill / status / manifest: `src/fill-template.ts`, `src/status.ts`,
  `template/escape-hatch.manifest.json`, `template/OPERATIONS.md`,
  `template/OWNERSHIP.md`
- Tests: `tests/escape-hatch-account-paywall.test.ts` + status/admin/theme/
  identity/portable/private-media/entitlements/generated-repo/library-truth
  expectation updates
- `docs/qa/ESCAPE_HATCH_EH_034_EVIDENCE.md`

Excluded: `README.md`, `IA.md`, `.tmp/`, disposable `.out/eh-034-browser`,
and unrelated dirty tree (web/, `src/autopost`, schedule-rail, monetization
docs, etc.).

## Delivered behavior

| Surface | Role |
|---|---|
| `/account` + `AccountShell` | Server `loadAccountSummary` — provider, session, entitlement snapshot honesty, billing-not-configured note |
| `SignOutButton` + `POST /auth/logout` | POST-only logout; GET → 405; safe relative `next` redirect |
| `PaywallOverlay` | Reason-code CTAs; never unlocks bytes |
| `GalleryApp` / `PostView` | Locked premium skips `resolveVisitorMediaSrc`; unlocked uses `/api/media` |
| `PatronChrome` | Soft persona UI only when provider `none` |
| `VisitorMedia` | Fail-closed UI on 401/403 / load error after entitled fetch |
| Status / manifest | Slice **EH-034**, next **EH-040**, `hard_paywall: true`, `productionSafe: false` |

## Automated evidence

Freeze-rerun 2026-07-22 (Sol acceptance):

| Command | Exit | Result |
|---|---:|---|
| `npm run typecheck --prefix packages/escape-hatch` | 0 | Package TypeScript passed |
| `npm run escape-hatch:test` | 0 | 15 files, **276 tests** passed |
| `npx tsx packages/escape-hatch/src/cli.ts status --json` | 0 | Slice **EH-034**; next **EH-040**; `productionSafe: false` |

(Windows note: prefer positional `status --json` via `tsx … status --json`.)

Account/paywall suite covers status/manifest stamp, evaluator + copy honesty
(anonymous / soft_persona_blocked / staff), premium visitor src API path, and
logout POST-only source contract. Fixture secret scan remains green via the
existing fixtures suite.

## Security review (mandatory gate)

Security review subagent scoped to EH-034 uncommitted `packages/escape-hatch/`
paths: **no medium/high/critical findings**. Slice strengthens EH-032/033
boundaries rather than weakening them.

| Severity | Finding | Disposition |
|---|---|---|
| Critical (closed) | Client-trusted unlock under Path A/B | Closed: gallery/post use server `allowed`; preview precomputes `evaluatePostAccess` |
| Critical (closed) | Locked UI fetching premium `/api/media` | Closed: locked branches omit `resolveVisitorMediaSrc`; browser confirmed empty `/api/media` DOM |
| High (closed) | Soft persona elevates under Path A/B | Closed: UI hidden; cookie ignored when provider configured; browser cookie probe → 401 `anonymous_denied` |
| High (closed) | GET logout mutation | Closed: GET 405 + `Allow: POST`; form POST only |
| Medium (closed) | Open redirect on logout `next` | Closed: same-origin relative paths only (`/` and not `//`) |
| Medium (residual) | Milestone 3 live signed-in / staff / entitled browser sessions | Blocked without inventing credentials; honesty proven by code + package tests |
| Medium (residual) | `public_legacy` residual leakage | Unchanged from EH-033; keeps `productionSafe` false |
| Low (residual) | Soft persona cookie non-HttpOnly when provider `none` | Intentional local preview; blocked under Path A/B |

Controls confirmed:

- No client-trusted unlock; premium bytes still gated by EH-033 `deliverMedia` →
  EH-032 `evaluateAccess`.
- Soft persona cannot elevate under supabase/portable.
- Account summary built server-side; paywall client modules are copy/types only.
- No secrets added to client bundles; fixture scan green.
- `productionSafe` stays **`false`**.

## Browser persona results

Local kit: `packages/escape-hatch/.out/eh-034-browser` on `http://localhost:3001`
(disposable; not committed).

| Persona | Result | Notes |
|---|---|---|
| Anonymous (provider `none`) | **Pass** | Public soft persona; locked premium cards; no `/api/media` in DOM; paywall CTAs |
| Soft-persona-only (provider `none`) | **Pass** | Patron unlocks member posts via `/api/media`; Silver keeps Gold locked |
| Soft-persona-blocked (provider `supabase`) | **Pass** | Persona switch hidden; soft cookie probe denied 401; locked post honesty banner |
| Signed-in-denied | **Blocked** | No real Path A/B credentials; code+tests prove server deny + denied copy |
| Entitled / unlocked (Path A/B session) | **Blocked** | Same; soft-persona unlock covered only for provider `none` |
| Staff | **Blocked** | No staff session; staff override copy honesty covered by unit tests |

Master does **not** flip `productionSafe` to true. Milestone 3 residual
(browser personas with live sessions + security gate) remains an explicit
blocker until EH-040+ / human credentialed rehearsal.

## Residual honesty

- **EH-040** — Creator-owned Patreon OAuth continuity.
- Milestone 3 residual: live signed-in / staff / entitled browser personas.
- **`public_legacy`**, billing (**EH-050+**), verified deploy (**EH-070/071**).
- Soft persona remains non-authoritative when provider is `none`.
- `productionSafe` stays **`false`**.

## Acceptance decision

EH-034 passes its applicable account/paywall gate:

- Locked vs unlocked honesty wired; reason-code CTAs without internal leaks;
- `/account` + POST-only logout;
- Soft persona UI only when provider `none`; blocked under Path A/B;
- Locked UI never fetches premium `/api/media`;
- Security review clean vs EH-032/033;
- Status EH-034 → EH-040; `productionSafe: false` justified;
- Browser personas pass where feasible; remaining Path A/B session personas
  blocked without inventing credentials and documented as residual.

This is not Patreon OAuth acceptance, billing proof, or release / golden-path
deploy acceptance.

## Rollback

Revert this EH-034 acceptance commit. Delete disposable
`packages/escape-hatch/.out/eh-034-browser` if present. Stop any local kit
`npm run dev`. No provider, credential, or external production state mutation
occurred (browser used local fixture + placeholder Supabase env names only).
