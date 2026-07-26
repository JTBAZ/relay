# Escape Hatch EH-022 milestone evidence

**Status:** Accepted as a preview-only native admin shell baseline  
**Completed:** 2026-07-22  
**Master planner/reviewer:** Sol  
**Implementation builder:** Cursor Grok 4.5 High  
**Claim:** `4b1bda71`  
**Slice:** EH-022 — Native admin shell  
**Next dependency:** EH-030 — Supabase identity/data path

## Scope and ownership

EH-022 ships a native operator admin shell under `/admin` (overview health,
posts, media, tiers) with Hatch Console **Admin** tab, local-operator attention
API, and honest stub health framing (`ok: false`). It operates against fixture /
kit `data/` only and does not claim authentication, private media verification,
or production safety.

It does not implement hard identity / RLS (**EH-030**), visitor signed-URL
private media (**EH-033**), billing (**EH-050**), or verified production deploy
(**EH-070/071**).

Owned paths changed:

- Template admin: `app/admin/**`, `app/api/admin/attention/route.ts`,
  `components/admin/**`, `lib/admin/**`, `components/ConsoleNav.tsx`,
  `app/globals.css` (admin shell styles)
- Shared local-operator gate rename/export: `src/library-truth/local-operator.ts`,
  `src/library-truth/index.ts`, `template/lib/library-truth/index.ts`
- `src/status.ts`, `src/fill-template.ts`, `template/escape-hatch.manifest.json`,
  `template/OPERATIONS.md`
- Fixtures: `MATRIX.json`, `PROVENANCE.md`
- Tests: `escape-hatch-admin.test.ts` (new) + status / fixtures / theme /
  import / library-truth / generated-repo slice expectation updates
- `docs/qa/ESCAPE_HATCH_EH_022_EVIDENCE.md`
- Screenshots: `docs/qa/screenshots/eh-022/`

Excluded from this commit: `README.md`, `IA.md`, `.out/`, and unrelated dirty
tree (automation evidence, Relay root, etc.).

## Delivered behavior

- `/admin` overview surfaces **degraded** site health; every stub adapter
  reports `ok: false`; `productionSafe: false` is visible in the admin chrome.
- `/admin/posts` lists fixture posts and supports mark / clear attention via
  `POST /api/admin/attention` (requires `x-escape-hatch-local: 1` + loopback —
  not authentication).
- `/admin/media` inventories bundle media and never treats `public/media` as
  private-verified (`public/media only` badges; ledger honesty).
- `/admin/tiers` shows tier catalog plus mapping warnings (e.g. unused Silver).
- Console nav includes **Admin · Operate site**; visitor `/preview` remains a
  premium gallery without admin chrome in the hero.
- Status advances to EH-022 with next slice EH-030; `productionSafe` remains
  `false`.

## Automated evidence

Acceptance run 2026-07-22 (Cursor Grok 4.5 High):

| Command | Exit | Result |
|---|---:|---|
| `npm run typecheck --prefix packages/escape-hatch` | 0 | Package TypeScript passed |
| `npm run escape-hatch:test` | 0 | 10 files, **208 tests** passed |
| `npm run status --prefix packages/escape-hatch` | 0 | Slice **EH-022**; next **EH-030**; `productionSafe: false` |

Kit used for browser review: `packages/escape-hatch/.out/eh-022-review`
(gitignored `.out/`), served at `http://localhost:3002`.

## Browser evidence

Master browser-reviewed kit `eh-022-review` at `http://localhost:3002`
(cursor-ide-browser).

### Admin overview (`/admin`) — desktop

- Hatch Console **Admin** tab active; subnav Overview / Posts / Media / Tiers.
- Banner: **Site health: degraded (preview stubs) — every adapter reports
  ok: false**. Expected until EH-030/033/050.
- `productionSafe: false · stub adapters · local-operator mutations only (not
  authentication)` visible under the Admin hero.
- Kit inventory: 3 posts / 3 media / 2 tiers / 0 attention marks.
- Adapter health cards all **degraded stub** (auth, database, storage, billing,
  patreon, email, deployment) — not false-green.
- Known blockers list EH-030 / EH-033 / EH-050 and local-operator honesty.

Screenshot: `docs/qa/screenshots/eh-022/eh-022-admin-overview-desktop.png`

### Admin posts (`/admin/posts`) — desktop

- Lists Welcome (Public), Patrons-Only Sketch, Gold Exclusive Piece with access
  labels and Structure / visitor links.
- **Mark attention** on `p_public` succeeded (status: “Marked p_public for
  attention (local only).”); button flipped to **Clear attention**.
- **Clear attention** restored unmarked state (overview attention count back
  to 0).

Screenshot: `docs/qa/screenshots/eh-022/eh-022-admin-posts-desktop.png`

### Admin media (`/admin/media`) — desktop

- Honesty copy: **Never treat public/media as private-verified** /
  `public/media paths are never treated as private-read verification.`
- Table marks each asset **public/media only** under Private Verified; ledger
  `n/a`; `production_safe: false`.

Screenshot: `docs/qa/screenshots/eh-022/eh-022-admin-media-desktop.png`

### Admin tiers (`/admin/tiers`) — desktop

- Gold (`t_gold`, 1 post) and Silver (`t_silver`, 0 posts).
- Warning on Silver: **No posts currently map to this tier (preview catalog
  only).** Adjust-in-Structure CTAs present.

Screenshot: `docs/qa/screenshots/eh-022/eh-022-admin-tiers-desktop.png`

### Mobile (~390px)

- Admin overview remains usable at ~390px width: Console tabs, Admin hero,
  degraded health banner, and inventory cards stack without horizontal
  overflow of primary content.

Screenshot: `docs/qa/screenshots/eh-022/eh-022-admin-overview-mobile-390.png`

### Visitor preview (`/preview`) — desktop + mobile

- Premium gallery composition (Elena Adler brand hero, persona soft-gate,
  media grid with soft paywall teasers).
- **No admin chrome in the hero** — no Admin subnav, health cards, or operate
  shell leaking into the visitor first viewport.
- Footer operator links (**Hatch Console**, **Style dials**) remain labeled
  “not visitor chrome” (EH-021 pattern).

Screenshots:
- `docs/qa/screenshots/eh-022/eh-022-preview-desktop.png`
- `docs/qa/screenshots/eh-022/eh-022-preview-mobile-390.png`

### Non-blocking friction

- Next.js “1 Issue” overlay present in dev; not an admin or visitor UX blocker.
- Kit `package.json` default port is 3001; review instance was on **3002**
  (ports 3000/3001 already occupied) — functional, not a product defect.

No blocking UX bugs. No medium+ security findings arrived mid-flight that
required owned-file fixes before commit.

## Residual security honesty

**Documented residuals (not solved by EH-022):**

- **EH-030** — No hard patron identity, session, entitlements, or RLS; admin
  mutations remain local-operator gating only (header + loopback), not auth.
- **EH-033** — Premium media still world-readable under `public/media`; admin
  inventory honestly refuses private-verified claims but does not fix delivery.
- **EH-050** — Billing adapter remains stub-only (`ok: false`).
- Soft persona gate on visitor routes remains client-only / non-authoritative.
- `productionSafe` stays **`false`**.

## Acceptance decision

EH-022 passes its applicable native admin shell gate:

- `/admin` overview/health/posts/media/tiers against fixture data;
- Console Admin tab wired; attention mark/clear via local-operator API;
- stub health stays degraded (`ok: false`); media inventory does not claim
  `public/media` as private-verified;
- visitor `/preview` remains premium gallery without admin chrome in hero;
- package gates green (208 tests); status EH-022 → EH-030;
  `productionSafe: false`;
- residuals EH-030 / EH-033 / EH-050 explicitly documented.

This is not hard identity, private media delivery, billing proof, or release /
golden-path deploy acceptance.

## Rollback

Revert the EH-022 commit and delete disposable
`packages/escape-hatch/.out/eh-022-*` directories. Stop any local kit
`npm run dev`. No provider, credential, or external production state mutation
occurred.
