# Escape Hatch EH-033 milestone evidence

**Status:** Accepted as a preview-only private media delivery path  
**Completed:** 2026-07-22  
**Master planner/reviewer:** Sol  
**Implementation builder:** Cursor Grok 4.5 High  
**Acceptance close-out:** Sol (contract + mandatory private-media security review)  
**Slice:** EH-033 — Private media delivery  
**Next dependency:** EH-034 — Account/paywall UX

## Scope and ownership

EH-033 ships server-enforced visitor media delivery for generated kits:

- Default fill stages **premium** (`member_only` / `tier_gated`) bytes under
  `data/private-media` (not world-readable `public/media`); public/free assets
  may remain under `public/media`.
- `GET /api/media/{mediaId}` → session / soft-persona cookie (provider `none`
  only) → EH-032 `evaluateAccess` on the media resource → `local_private`
  authenticated stream **or** short-lived signed R2 GET redirect.
- Soft persona cookie carries **persona id only**; tiers resolve server-side
  from the bundle and are blocked when identity provider is supabase/portable.
- Fail closed when `ESCAPE_HATCH_MEDIA_MODE=private_r2` lacks real
  non-placeholder signing credentials; signed redirect hosts are allowlisted.
- Status advances EH-033 → EH-034; `productionSafe` remains **`false`**
  (Milestone 3 UX/browser gate, `public_legacy` residual, billing, deploy open).

It does **not** implement account/paywall UX polish (**EH-034**), billing
adapters (**EH-050**), or verified production deploy (**EH-070/071**). No live
R2 is required for CI — mock signer only.

Owned paths in this acceptance commit:

- Delivery: `template/lib/media/**`, `template/app/api/media/[mediaId]/route.ts`
- Fill / status: `src/fill-template.ts`, `src/status.ts`
- Adapters / env: `template/lib/adapters/{index,types}.ts`, `template/lib/env.ts`,
  `template/.env.example`, `template/package.json`, root `package.json` +
  `package-lock.json` (`@aws-sdk/s3-request-presigner`)
- UI wiring: `template/components/{GalleryApp,PostView,PatronChrome}.tsx`,
  `template/components/admin/AdminOverview.tsx`
- Ops/docs: `template/OPERATIONS.md`, `OWNERSHIP.md`, `Dockerfile`,
  `escape-hatch.manifest.json`, `scripts/bootstrap-identity.md`
- Entitlement comment touch: `template/lib/entitlements/{evaluate,index}.ts`
- Tests: `tests/escape-hatch-private-media.test.ts` + status/identity/admin/
  theme/portable/generated-repo/library-truth/entitlements expectation updates
- `docs/qa/ESCAPE_HATCH_EH_033_EVIDENCE.md`

Excluded: `README.md`, `IA.md`, `.tmp/`, and unrelated dirty tree (web/,
`src/autopost`, schedule-rail, monetization docs, etc.).

## Delivered behavior

### Delivery model

| Mode (`ESCAPE_HATCH_MEDIA_MODE`) | Behavior |
|---|---|
| unset | `private_r2` when R2 signing env is real; else `local_private` |
| `local_private` | Stream bytes from `data/private-media` after `evaluateAccess` |
| `private_r2` | Mint short-lived signed GET; fail closed without credentials |
| `public_legacy` | Explicit residual leakage — premium may copy to `public/media` |

| Surface | Role |
|---|---|
| `deliverMedia` | Server gate: lookup → evaluate → stream / redirect / deny |
| `GET /api/media/[mediaId]` | Route wrapper; `Cache-Control: private, no-store` on deny/bytes |
| `createMockMediaSigner` / `createR2MediaSigner` | CI mock vs live R2 presign |
| `isSafeSignedRedirectUrl` | Host allowlist (endpoint / public base / fixture host) |
| `resolveVisitorMediaSrc` | Client-safe path helper — premium → `/api/media/{id}` |
| `stageMediaForKit` | Default private layout closes premium `public/media` staging |

### How default premium `public/media` leakage is closed

1. `fillTemplate` default `mediaLayout=private` copies premium originals only to
   `data/private-media`.
2. Gallery/post UI loads unlocked premium via `/api/media/{id}` and does **not**
   fetch bytes when locked (blur teaser only).
3. Anonymous `/api/media/{premiumId}` is denied (`anonymous_denied` / 401).
4. `ESCAPE_HATCH_MEDIA_MODE=public_legacy` remains an **explicit** residual and
   keeps `productionSafe: false`.

### Status

- Slice advances to **EH-033** with next slice **EH-034**.
- `productionSafe` remains **`false`** (justified: Milestone 3 UX/security/
  browser gate, `public_legacy` residual, no live R2 proof in CI, billing/deploy
  open).
- Capability `private-media-delivery` is `preview_only`.

## Automated evidence

Freeze-rerun 2026-07-22 (Sol acceptance):

| Command | Exit | Result |
|---|---:|---|
| `npm run typecheck --prefix packages/escape-hatch` | 0 | Package TypeScript passed |
| `npm run escape-hatch:test` | 0 | 14 files, **269 tests** passed |
| `npx tsx packages/escape-hatch/src/cli.ts status --json` | 0 | Slice **EH-033**; next **EH-034**; `productionSafe: false` |

(Windows note: `npm run status -- --json` may strip flags; positional
`status --json` via `tsx … status --json` is reliable.)

Private-media suite covers anonymous denial, soft-persona allow (provider
`none`) / block (supabase), expired entitlement via `evaluateAccess`, mock
signed redirect + open-redirect reject, fill private layout (no premium under
`public/media`), env-name docs, and fixture secret scan — no live R2 required.

## Security review (mandatory gate)

| Severity | Finding | Disposition |
|---|---|---|
| Critical (closed) | Premium bytes staged under `public/media` by default | Closed: default private layout + API gate; fill test asserts absence |
| Critical (closed) | Anonymous premium fetch | Closed: `deliverMedia` → `evaluateAccess` deny; test asserts 401 |
| High (closed) | Soft persona elevates under Path A/B | Closed: cookie id only; `evaluateCurrentAccess` honors soft persona only when provider `none`; test blocks supabase |
| High (closed) | `private_r2` with placeholder credentials | Closed: `assertPrivateR2Ready` / `isPlaceholderSecret` fail closed |
| High (closed) | Open redirect via signed Location | Closed: host allowlist; non-allowlisted hosts rejected |
| Medium (closed) | Long-lived signed URLs | Closed: default TTL 60s, max 300s; `private, no-store` |
| Medium (residual) | `public_legacy` can reintroduce world-readable premium copies | Documented residual; never production; keeps `productionSafe` false |
| Medium (residual) | No live R2 anonymous-probe proof in CI | Mock signer only; live bucket ops remain human/EH-012 migration path |
| Medium (residual) | Docker image does not bake `data/private-media` | Runtime mount/ops for `local_private` in containers — EH-071 |
| Low (residual) | Soft persona cookie is non-HttpOnly client cookie | Intentional for provider `none` preview; blocked under configured identity |
| Low (residual) | Signed URL usable until TTL without edge re-eval | Inherent to presign; keep TTL short |

Controls confirmed:

- Delivery only after EH-032 `evaluateAccess` allows the media resource.
- Soft persona blocked when supabase/portable; entitlement soft_persona grant
  strip under Path A/B still present (EH-032 tests green).
- Path A/B identity and admin/mutation loopback rules not weakened.
- No storage secrets / long-lived credentials in client bundles or fixtures;
  fixture/secret scan green.
- Path traversal safe for `local_private` (`assertSafeMediaId` +
  `assertContainedMediaFileName`).
- Docs: env **names** only; `public_legacy` documented as non-production residual.
- Do **not** claim `productionSafe: true` while `public_legacy` or Milestone 3
  gates remain open.

## Residual security honesty

**Documented residuals (not solved by EH-033):**

- **EH-034** — Account/paywall UX (login/link/locked states, access-source
  clarity) and Milestone 3 browser personas gate.
- **`public_legacy`** — Explicit opt-in residual leakage path.
- **Live R2** — CI uses mock signer; creators must configure real credentials
  and private bucket ACLs for production intent.
- **Billing / deploy** — EH-050/051 and EH-070/071 remain open.
- Soft persona remains non-authoritative when provider is `none`.
- `productionSafe` stays **`false`**.

## Browser evidence

EH-033 is delivery/security work. Package tests cover the access matrix and fill
layout. Master browser persona pass against private media + paywall UX is
deferred to **EH-034** / Milestone 3 gate. No claim of browser UX acceptance
beyond UI wiring that avoids fetching locked premium bytes.

## Acceptance decision

EH-033 passes its applicable private-media gate:

- Default private layout closes premium `public/media` staging;
- Visitor premium bytes require `/api/media` after `evaluateAccess`;
- Anonymous premium denied; soft persona honest under configured providers;
- Short-lived signed redirects with host allowlist; `private_r2` fail-closed
  without credentials;
- Path traversal safe for local private store;
- CI green without live R2; status EH-033 → EH-034; `productionSafe: false`;
- Residuals (`public_legacy`, no live R2 in CI, EH-034 UX/browser gate)
  explicitly documented.

This is not account/paywall UX acceptance, billing proof, or release / golden-path
deploy acceptance.

## Rollback

Revert this EH-033 acceptance commit. Delete disposable
`packages/escape-hatch/.out/eh-033-*` directories if any. Stop any local kit
`npm run dev`. No provider, credential, or external production state mutation
occurred (tests use mock signer + local temp dirs only).
