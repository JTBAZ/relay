# Escape Hatch EH-012 milestone evidence

**Status:** Accepted as a preview-only R2/object migration engine baseline  
**Completed:** 2026-07-22  
**Master planner/reviewer:** Sol  
**Implementation builder:** Cursor Grok 4.5 High  
**Slice:** EH-012 — R2 migration engine  
**Next dependency:** EH-013 — Library truth wizard

## Scope and ownership

EH-012 adds a portable media migration engine with opaque creator/site object keys,
SHA-256/byte-length checks, a resumable retry ledger, and private-read verification
that requires authenticated success plus anonymous denial. It does not implement
visitor signed-URL delivery (EH-033), hard paywall, wizard UI, or production-safe
media serving.

Owned paths changed:

- `packages/escape-hatch/src/migrate/**` (new)
- `packages/escape-hatch/src/cli.ts` (`migrate-media` / `migrate-r2`)
- `packages/escape-hatch/src/status.ts` (slice EH-012 → next EH-013)
- `packages/escape-hatch/src/import/importer.ts` (honesty notes only)
- `packages/escape-hatch/package.json` + `package-lock.json` (`@aws-sdk/client-s3`, script)
- `packages/escape-hatch/fixtures/MATRIX.json`, `PROVENANCE.md`
- `packages/escape-hatch/fixtures/matrix/deferred/video-audio-embed.stub.json`
- `packages/escape-hatch/fixtures/matrix/deferred/mature-metadata.stub.json`
- `packages/escape-hatch/fixtures/relay-dump/**` (checksums + tiny AV/embed text stubs)
- `packages/escape-hatch/tests/escape-hatch-migrate.test.ts` (new)
- updates to fixtures/status/import tests
- `docs/qa/ESCAPE_HATCH_EH_012_EVIDENCE.md`

Pre-existing dirty `README.md` / `IA.md`, root Relay contracts, Prisma, web/, and
unrelated working-tree changes were not absorbed.

## Delivered behavior

- Versioned documents: `media-migration-ledger/1.0.0`, `media-migration-report/1.0.0`
  under kit `data/` (not `public/`); both force `production_safe: false`.
- Object keys: `eh/{creator_id}/{site_id}/media/{media_id}/object`.
- `ObjectStoragePort` with in-memory default (CI) and optional injected R2 adapter.
- Stream/file hash copy with fail-closed checksum mismatch when SHA-256 present.
- Idempotent resume that **re-runs live `assertPrivateRead`** — ledger `verified`
  alone is never success; wiped/tampered storage fails closed.
- `private_read_verified` requires `anonymous_denied: true`. Memory proves both sides;
  R2 requires `publicBaseUrl` + `allowPublicProbe` (auth GET alone insufficient).
- `public/media` and guessable `media/{n}` keys rejected as private verification.
- Status advances to EH-012 with next slice EH-013; `productionSafe` remains false.

## Automated evidence

| Command | Exit | Result |
|---|---:|---|
| `npm run build` | 0 | Relay root build passed |
| `npm run typecheck --prefix packages/escape-hatch` | 0 | Package TypeScript passed |
| `npm run escape-hatch:test` | 0 | 6 files, 156 tests passed |
| `npm run status --prefix packages/escape-hatch` | 0 | Slice EH-012; next EH-013; `productionSafe: false` |
| Targeted Patreon/tier/clone Vitest | 0 | 19 passed, 1 pre-existing todo |
| `import-relay-dump` → `migrate-media` `eh-012-review-20260722` | 0 | Report expected=2 verified=2 failed=0; ledger under `data/` |

## Security review

Scoped security review found two medium issues that were closed before acceptance:

1. **Resume trusted ledger without live private-read** — fixed via `confirmLiveVerified()`
   on every resume/idempotent skip; wiped bucket and digest tamper fail closed with tests.
2. **R2 auth GET alone claimed private_read_verified** — fixed: require anonymous probe
   (`publicBaseUrl` + `allowPublicProbe`); without probe, R2 cannot claim
   `private_read_verified`. Memory adapter fully proves anonymous denial.

Residual prototype risks (`fillTemplate` → world-readable `public/media`, soft personas,
no visitor signed URLs) remain documented and unchanged. EH-012 private object copy is
not EH-033 delivery.

## Browser evidence

EH-012 is engine/data work. No wizard or generated-theme UI redesign was in scope.
No browser UX acceptance claim is made for this slice.

## Acceptance decision

EH-012 passes its applicable gate:

- portable migration engine with fake storage is executable and fixture-tested;
- checksum/byte-length and path containment fail closed;
- resume proves live private-read, not ledger assertion alone;
- anonymous denial is required for `private_read_verified`;
- prototype remains explicitly not production-safe.

This is not library-truth wizard, paywall, visitor delivery, or release acceptance.
EH-013 owns parity/accounted-for reporting; EH-033 owns signed-URL visitor delivery.

## Rollback

Revert the EH-012 commit and delete disposable `packages/escape-hatch/.out/eh-012-*`
directories. No database, provider, credential, or external state mutation occurred
(smoke used in-memory storage only).
