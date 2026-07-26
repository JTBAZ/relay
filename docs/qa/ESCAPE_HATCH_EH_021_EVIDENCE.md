# Escape Hatch EH-021 milestone evidence

**Status:** Accepted as a preview-only premium patron theme baseline  
**Completed:** 2026-07-22  
**Master planner/reviewer:** Sol  
**Implementation builder:** Cursor Grok 4.5 High  
**Slice:** EH-021 — Premium patron theme  
**Next dependency:** EH-022 — Native admin shell

## Scope and ownership

EH-021 ships a standalone visitor premium patron gallery theme with controlled
branding dials and no Relay-social chrome. It adapts Relay gallery hierarchy
(brand hero, media grid, post detail, soft paywall teaser) into the generated
kit without comments, favorites, or network chrome on visitor routes.

It does not implement native admin shell (EH-022), hard identity (EH-030),
visitor signed-URL delivery (EH-033), billing (EH-050), or verified production
deploy (EH-070/071).

Owned paths changed:

- `packages/escape-hatch/src/contracts.ts`, `types.ts` (branding dial fields)
- `packages/escape-hatch/src/wizard.ts`, `fill-template.ts`, `from-clone.ts`
- `packages/escape-hatch/src/status.ts` (slice EH-021 → next EH-022)
- Template theme: `PatronChrome.tsx`, `GalleryApp.tsx`, `PostView.tsx`,
  `PaywallTeaser.tsx`, `StyleStudio.tsx`, `lib/theme.ts`, `lib/access.ts`,
  `app/layout.tsx`, `globals.css`, `theme-vars.css`, `escape-hatch.manifest.json`
- Fixtures: `MATRIX.json`, `PROVENANCE.md`, `sample.bundle.json`
- Tests: `escape-hatch-theme.test.ts` (new) + status/fixtures/import/
  library-truth/generated-repo/core updates
- `docs/qa/ESCAPE_HATCH_EH_021_EVIDENCE.md`
- Screenshots: `docs/qa/screenshots/eh-021/`

Pre-existing dirty `README.md` / `IA.md`, root Relay contracts, Prisma, web/,
automation dirty tree, and unrelated working-tree changes were not absorbed.

## Delivered behavior

- Visitor routes present a premium gallery composition (hero brand, media grid,
  post detail) without Relay-social chrome.
- Controlled branding dials: logo path, display name, intro, accent, approved
  type pairings, light/dark/warm schemes, gallery density, cover crop, paywall
  message, community CTA.
- Soft persona switch remains labeled non-authoritative; paywall teaser always
  shows soft/preview honesty (`PREVIEW ONLY — NOT A HARD PAYWALL`).
- Status advances to EH-021 with next slice EH-022; `productionSafe` remains
  `false`.

## Automated evidence

Acceptance run 2026-07-22 (Cursor Grok 4.5 High):

| Command | Exit | Result |
|---|---:|---|
| `npm run typecheck --prefix packages/escape-hatch` | 0 | Package TypeScript passed |
| `npm run escape-hatch:test` | 0 | 9 files, **201 tests** passed |
| `npm run status --prefix packages/escape-hatch` | 0 | Slice **EH-021**; next **EH-022**; `productionSafe: false` |

Kit used for browser review: `packages/escape-hatch/.out/eh-021-review`
(generated from `fixtures/sample.bundle.json`; gitignored `.out/`).

## Browser evidence

Master browser-reviewed kit `eh-021-review` at `http://localhost:3001`:

### Preview (`/preview`) — desktop

- Premium gallery composition (not a dense dashboard).
- Branding / hero present: **Membership gallery**, **Elena Adler**, subtitle,
  intro bio, community CTA.
- Soft-gate banner: **SOFT-GATE PREVIEW** · “Not production security — persona
  switch is non-authoritative.”
- Persona switch (Public / Patron / Gold / Silver) labeled **PREVIEW ONLY**.
- Public post unlocks; patrons-only and Gold cards show paywall teaser with
  fixture paywall message **“Members only — unlock to view”**, **Join to unlock**,
  and **PREVIEW ONLY — NOT A HARD PAYWALL**.
- No comments, favorites, or Relay network chrome on visitor surface.
- Operator links (**Hatch Console**, **Style dials**) labeled “not visitor chrome.”

Screenshot: `docs/qa/screenshots/eh-021/eh-021-preview-desktop.png`

### Locked post (`/p/patrons-only-sketch`) — desktop

- Post detail keeps brand chrome; media plane shows soft paywall teaser with
  soft/preview labels and community CTA.

Screenshot: `docs/qa/screenshots/eh-021/eh-021-locked-post-desktop.png`

### Mobile (~390px)

- Hero brand, persona pills, and gallery remain usable; first viewport reads as
  one composition (premium gallery, not dashboard).

Screenshot: `docs/qa/screenshots/eh-021/eh-021-preview-mobile-390.png`

### Style dials (optional spot-check)

- `/style` exposes scheme, accent, type pairing, density, cover crop, paywall
  style/message, and brand copy dials.
- Live token application is **session peek on Style** (banner: persist via
  `escape-hatch:wizard`, then rebuild). Visitor `/preview` uses baked
  `theme.json` until rebuild — intentional, non-blocking.

### Non-blocking friction

- Logo path `/media/m_public.svg` renders as a muted square in hero (fixture
  SVG is a media placeholder more than a brand mark).
- Style dial session peek does not persist to visitor routes without wizard
  rebuild (documented on Style page).
- Next.js “1 Issue” overlay present in dev; not a visitor UX blocker.

No blocking UX bugs; no EH-022 admin scope entered.

## Residual security honesty (public/media + soft gate)

**HIGH residual (documented, not solved):**

- `fillTemplate` still copies premium (`member_only` / `tier_gated`) media into
  `public/media`; direct HTTP GET returns **200** with public bytes (known
  prototype security failure). Private visitor delivery belongs to **EH-033**.
- Soft persona gate is client-only and non-authoritative (**EH-030** for hard
  identity / entitlements).
- `productionSafe` stays **`false`**. Status CLI continues to warn on
  public/media leakage and soft-gate honesty.

## Acceptance decision

EH-021 passes its applicable premium patron theme gate:

- standalone visitor theme adapts gallery hierarchy without Relay-social chrome;
- branding dials are wired through contracts, wizard, fixtures, Style studio,
  and visitor theme tokens;
- soft paywall UI is explicitly labeled preview / not a hard paywall;
- package gates green (201 tests); status EH-021 → EH-022; `productionSafe: false`;
- HIGH `public/media` leakage and soft-gate residuals remain explicitly documented.

This is not native admin (EH-022), hard identity, private media delivery, billing
proof, or release / golden-path deploy acceptance.

## Rollback

Revert the EH-021 commit and delete disposable
`packages/escape-hatch/.out/eh-021-*` directories. Stop any local kit
`npm run dev`. No provider, credential, or external production state mutation
occurred.
