# Escape Hatch EH-011 milestone evidence

**Status:** Accepted as a preview-only canonical importer baseline  
**Completed:** 2026-07-22  
**Master planner/reviewer:** Sol  
**Implementation builder:** Cursor Grok 4.5 High  
**Slice:** EH-011 — Canonical generated-app importer  
**Next dependency:** EH-012 — R2 migration engine

## Scope and ownership

EH-011 adds a portable canonical → generated-app importer with versioned provenance,
local mutable state, import report, idempotent replay, and a conflict queue against
sanitized `fixtures/relay-dump/`. It does not implement private R2 copy, hard paywall,
wizard UX, or production-safe media delivery.

Owned paths changed:

- `packages/escape-hatch/src/import/**` (new)
- `packages/escape-hatch/src/cli.ts` (`import-relay-dump`, merge of prior import artifacts)
- `packages/escape-hatch/src/from-relay.ts` (minimal adapter touch for importer reuse)
- `packages/escape-hatch/src/status.ts` (slice EH-011 → next EH-012)
- `packages/escape-hatch/package.json` (`import-relay-dump` script)
- `packages/escape-hatch/fixtures/MATRIX.json`
- `packages/escape-hatch/fixtures/PROVENANCE.md`
- `packages/escape-hatch/fixtures/matrix/deferred/**` (tombstone/legacy-tier promoted; AV/mature deferred to EH-012)
- `packages/escape-hatch/fixtures/relay-dump/**`
- `packages/escape-hatch/tests/escape-hatch-import.test.ts` (new)
- `packages/escape-hatch/tests/escape-hatch-fixtures.test.ts`
- `packages/escape-hatch/tests/escape-hatch-status.test.ts`
- `docs/qa/ESCAPE_HATCH_EH_011_EVIDENCE.md`

Pre-existing dirty `README.md` / `IA.md`, root Relay contracts, Prisma, web/, and
unrelated working-tree changes were not absorbed.

## Delivered behavior

- Versioned documents: `import-provenance/1.0.0`, `import-local-state/1.0.0`,
  `import-report/1.0.0` written under generated kit `data/` (not public/).
- SiteBundle (EH-001) left stable; import state is a separate contract family.
- CLI `import-relay-dump` materializes a kit from sanitized relay-dump fixtures;
  re-import loads prior provenance/local-state/bundle unless `--fresh` / `fresh`.
- Idempotent replay + conflict queue kinds: local_edit, native_post, tombstone, tier_remap.
- Tombstone and legacy-tier-rename families promoted; video/audio/embed and mature
  enforcement beyond accounted exclusion remain deferred to EH-012+.
- Mature/legal-adult posts are excluded from the live SiteBundle with accounted
  `posts.excluded` / exclusion entries (no invented SiteBundle mature field).
- Path containment for export blob staging (`path-safety.ts`); fail-closed on
  creator/site mismatch when merging prior artifacts.
- Status advances to EH-011 with next slice EH-012; `productionSafe` remains false.

## Automated evidence

| Command | Exit | Result |
|---|---:|---|
| `npm run build` | 0 | Relay root build passed |
| `npm run typecheck --prefix packages/escape-hatch` | 0 | Package TypeScript passed |
| `npm run escape-hatch:test` | 0 | 5 files, 130 tests passed |
| `npm run status --prefix packages/escape-hatch` | 0 | Slice EH-011; next EH-012; `productionSafe: false` |
| Targeted Patreon/tier/clone Vitest | 0 | 19 passed, 1 pre-existing todo |
| `import-relay-dump` → install → build `eh-011-review-20260722` | 0 | Import report posts imported=3 excluded=1; independent Next.js build passed |

## Security review

Scoped security review found three issues that were closed before acceptance:

1. **Path traversal** on export blob staging / `relative_blob_path` — contained via
   `path-safety.ts` and validated staging paths.
2. **CLI ignored persisted state** — re-import now loads `data/provenance.json`,
   `import-state.json`, and `site.bundle.json` when present; `--fresh` skips merge;
   creator/site mismatch fails closed.
3. **Mature “exclusion” still imported** — mature-flagged posts are excluded from the
   live bundle and counted in `posts.excluded`; tests assert absence from `bundle.posts`.

Residual prototype risks (world-readable `public/media`, soft personas) remain
documented and unchanged. EH-011 provenance is not private R2 delivery.

## Browser evidence

EH-011 is importer/fixture work. No wizard or generated-theme UI redesign was in scope.
Generated kit build remained green. No browser UX acceptance claim is made for this slice.

## Acceptance decision

EH-011 passes its applicable gate:

- canonical/relay-dump → generated kit import is executable and fixture-tested;
- immutable provenance is separated from local mutable state and import report;
- idempotent replay and conflict queue are covered by package tests;
- deferred AV/mature/private-media work is honest, not fake success;
- prototype remains explicitly not production-safe.

This is not R2 migration, paywall, wizard, or release acceptance. EH-012 must not treat
prototype `public/media` as production-safe private delivery.

## Rollback

Revert the EH-011 commit and delete disposable `packages/escape-hatch/.out/eh-011-*`
directories. No database, provider, credential, or external state mutation occurred.
