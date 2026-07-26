# Escape Hatch EH-020 milestone evidence

**Status:** Accepted as a preview-only generated-repository chassis baseline  
**Completed:** 2026-07-22  
**Master planner/reviewer:** Sol  
**Implementation builder:** Cursor Grok 4.5 High  
**Slice:** EH-020 — Generated repository  
**Next dependency:** EH-021 — Premium patron theme

## Scope and ownership

EH-020 ships a standalone Next.js generated-site chassis: typed fail-closed env,
portable SQL schema/migrations, typed adapter stubs, Vercel/Docker manifests, and
a clean-directory install/build contract that does not require Relay runtime
credentials. It does not implement premium theme (EH-021), hard identity (EH-030),
visitor signed-URL delivery (EH-033), billing (EH-050), or verified production
deploy (EH-070/071).

Owned paths changed:

- `packages/escape-hatch/src/fill-template.ts` (chassis materialization honesty)
- `packages/escape-hatch/src/status.ts` (slice EH-020 → next EH-021)
- `packages/escape-hatch/src/library-truth/index.ts`, `local-operator.ts`
  (loopback-only operator gating; no remote env override)
- `packages/escape-hatch/.gitignore` (`.tmp-clean-build/`)
- Template chassis: `lib/env.ts`, `lib/adapters/**`, `db/**`, `.env.example`,
  `escape-hatch.manifest.json`, `vercel.json`, `Dockerfile`, `.dockerignore`,
  `docker-compose.yml`, `deploy/**`, `OPERATIONS.md`, `OWNERSHIP.md`,
  `next.config.mjs`, `.gitignore`, `app/api/library-truth/route.ts`,
  `lib/library-truth/index.ts`
- Fixtures `MATRIX.json`, `PROVENANCE.md`
- Tests: `escape-hatch-generated-repo.test.ts` (new) + status/fixtures/import/
  library-truth updates
- `docs/qa/ESCAPE_HATCH_EH_020_EVIDENCE.md`

Pre-existing dirty `README.md` / `IA.md`, root Relay contracts, Prisma, web/,
automation dirty tree, and unrelated working-tree changes were not absorbed.
Next 15.5.21 pin and prior EH-013 UI commits (`00c6987` / `3015d0a`) were not
re-committed.

## Delivered behavior

- Standalone kit installs and builds from a clean directory without `RELAY_*` /
  monorepo root `.env`.
- Typed `lib/env.ts` + `.env.example`; `requireEnv` rejects placeholder secrets.
- Portable SQL under `db/schema/` + `db/migrations/` (no live DB required for
  `next build`).
- Typed adapter stubs report health `ok: false` / degraded until later slices.
- Deploy surfaces: `vercel.json`, `Dockerfile` / `.dockerignore`, optional
  Compose Postgres bound to `127.0.0.1:5433`, `escape-hatch.manifest.json`,
  `OPERATIONS.md`, `OWNERSHIP.md`.
- Status advances to EH-020 with next slice EH-021; `productionSafe` remains
  `false`. Generated kits remain on Next **15.5.21**.

## Automated evidence

Freeze-rerun 2026-07-22 (Cursor Grok 4.5 High):

| Command | Exit | Result |
|---|---:|---|
| `npm run typecheck --prefix packages/escape-hatch` | 0 | Package TypeScript passed |
| `npm run escape-hatch:test` | 0 | 8 files, 193 tests passed |
| `npm run status --prefix packages/escape-hatch` | 0 | Slice EH-020; next EH-021; `productionSafe: false` |
| Template `package.json` `next` | — | `15.5.21` (Maintenance LTS pin retained) |
| Clean-dir `npm install` + `npm run build` (via `escape-hatch-generated-repo.test.ts`) | 0 | Independent Next.js build without Relay root env |

## Security review

Scoped medium findings closed before acceptance:

1. **Library-truth mutations** — loopback-only host + `x-escape-hatch-local: 1`;
   `ESCAPE_HATCH_LIBRARY_TRUTH_ALLOW` remote override removed / not honored.
2. **Stub adapter honesty** — health always reports `ok: false` / degraded with
   explicit non-production reasons (not greenwashed ready).
3. **`requireEnv` placeholders** — placeholder / example secret values fail closed.
4. **Compose Postgres** — bind published only on `127.0.0.1` (not `0.0.0.0`).

**HIGH residual (documented, not solved):** `fillTemplate` still copies premium
media into `public/media`; Docker/Vercel shipping that tree remains prototype
leakage until **EH-033** private visitor delivery. Soft personas and stub billing
remain non-authoritative. `productionSafe` stays `false`.

## Browser evidence

EH-020 is chassis / deploy-manifest work. No generated-theme UI redesign was in
scope. Browser UX acceptance is **N/A** for this slice (clean-dir build + package
gates are the acceptance surface). Master browser review remains required for
later UI slices (EH-021+).

## Acceptance decision

EH-020 passes its applicable Milestone generated-repository gate:

- standalone Next chassis materializes with typed env, SQL, adapters, and deploy
  manifests;
- clean-directory install/build succeeds without Relay credentials;
- medium security findings above are closed with tests;
- HIGH `public/media` leakage remains explicitly documented and deferred to EH-033;
- prototype remains explicitly not production-safe (`productionSafe: false`).

This is not premium theme, hard identity, private media delivery, billing proof,
or release / golden-path deploy acceptance.

## Rollback

Revert the EH-020 commit and delete disposable
`packages/escape-hatch/.out/eh-020-*` / `.tmp-clean-build/` directories. Stop any
local kit `npm run dev` / Compose profile. No provider, credential, or external
production state mutation occurred (adapters remain stubs; Compose is optional
loopback-only).
