# Escape Hatch EH-010 milestone evidence

**Status:** Accepted as a sanitized fixture-matrix baseline  
**Completed:** 2026-07-22  
**Master planner/reviewer:** Sol  
**Implementation builder:** Cursor Grok 4.5 High  
**Slice:** EH-010 — Sanitized golden fixtures  
**Next dependency:** EH-011 — Canonical generated-app importer

## Scope and ownership

EH-010 adds a sanitized golden fixture matrix, provenance documentation, and an
automated secret/PII scan over `packages/escape-hatch/fixtures`. It does not
implement the EH-011 importer, conflict queue, R2 migration, hard paywall, or
wizard UI.

Owned paths changed:

- `packages/escape-hatch/fixtures/MATRIX.json`
- `packages/escape-hatch/fixtures/PROVENANCE.md`
- `packages/escape-hatch/fixtures/matrix/**`
- `packages/escape-hatch/fixtures/media/*.svg` (new placeholders)
- `packages/escape-hatch/src/fixture-scan.ts`
- `packages/escape-hatch/scripts/scan-fixtures.ts`
- `packages/escape-hatch/src/status.ts`
- `packages/escape-hatch/tests/escape-hatch-fixtures.test.ts`
- `packages/escape-hatch/tests/escape-hatch-status.test.ts`

Pre-existing dirty `README.md` / `IA.md`, root Relay contracts, Prisma, web/, and
unrelated working-tree changes were not absorbed.

## Delivered behavior

- `MATRIX.json` indexes 14 present families and 4 deferred-to-EH-011 stubs with reasons.
- Present coverage includes public text-only, all-patrons with image, exact-tier,
  tier-or-higher, multi-media gallery, free-vs-paid, export-failure, Unicode/rich body,
  multi-tier floors, duplicate CDN URLs, and missing-cover attachment.
- Deferred stubs cover video/audio/embed ingest, tombstones, mature metadata, and
  legacy tier rename without claiming importer success.
- `PROVENANCE.md` documents sanitization, preserved oddities, allowlisted hosts, and
  consumers (EH-001/010/011+).
- `fixture-scan.ts` fail-closed scans the fixture tree for Bearer/Stripe/PEM/AWS/JWT,
  emails, phones, OAuth client secrets, access/refresh/token assignments, non-SVG
  binaries, and non-allowlisted URL hosts.
- Email allowlisting is match-domain-only (no same-line bleed).
- Status advances to EH-010 with next slice EH-011; `productionSafe` remains false.

## Automated evidence

| Command | Exit | Result |
|---|---:|---|
| `npm run build` | 0 | Relay root build passed |
| `npm run typecheck --prefix packages/escape-hatch` | 0 | Package TypeScript passed |
| `npm run escape-hatch:test` | 0 | 4 files, 115 tests passed |
| `npm run status --prefix packages/escape-hatch` | 0 | Slice EH-010; next EH-011; `productionSafe: false` |
| Targeted Patreon/tier/clone Vitest command | 0 | 24 passed, 1 pre-existing todo |
| Generate/install/build `eh-010-review-20260722` | 0 | Independent Next.js build passed; 7 pages |

## Security review

Scoped security review found no live secrets or patron PII in committed fixtures.
Three medium scanner gaps were identified and closed before acceptance:

1. email allowlist same-line bleed;
2. missing generic `access_token` / `refresh_token` / `token` assignment rules;
3. documented host allowlist not enforced.

Retest coverage asserts each remediations fails closed. Residual prototype risks
(public premium media, soft personas) remain documented and unchanged.

## Browser evidence

EH-010 is fixture/data work. No wizard or generated-theme UI redesign was in scope.
Existing fixture CLI generation/build remained green. No browser UX acceptance claim
is made for this slice.

## Acceptance decision

EH-010 passes its applicable gate:

- sanitized OAuth/cookie-shaped and SiteBundle/Clone matrices are wired into package tests;
- provenance and secret/PII scanning are executable and fail-closed;
- deferred importer families are honest stubs, not fake successes;
- prototype remains explicitly not production-safe.

This is not importer, media-migration, paywall, or release acceptance. EH-011 must
consume these fixtures without weakening sanitization or inventing live data.

## Rollback

Revert the EH-010 commit and delete disposable `packages/escape-hatch/.out/eh-010-*`
directories. No database, provider, credential, or external state mutation occurred.
