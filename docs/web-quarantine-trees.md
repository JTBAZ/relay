# Quarantine decision: experimental Next.js trees (P3-web-002)

**Date:** 2026-05-08  
**Decision:** **Quarantine** for both:

- [`web/b_i0ofEW9bMcy/`](../web/b_i0ofEW9bMcy/)
- [`web/onboarding_enhancement/`](../web/onboarding_enhancement/)

**Not chosen:**

- **Archive** — Would move trees out of `web/` (`design-archive/`). Deferred: they remain useful as **design/reference** snapshots and for v0 comparison without a separate clone; no CI today depends on their paths under `web/`.
- **Merge** — Would port ~100+ files into canonical [`web/app`](../web/app) / [`web/components`](../web/components). Rejected for pilot scope: duplicates [`docs/web-route-inventory.md`](web-route-inventory.md) surfaces and would fight canonical shadcn ownership (see P3-web-004 / P3-web-005).

## Evidence

| Check | Result |
|-------|--------|
| Canonical imports | No matches under `web/app/**` or `web/components/**` for either folder name (grep 2026-05-08). |
| TypeScript project | Both globs listed in [`web/tsconfig.json`](../web/tsconfig.json) `exclude`. |
| GitHub Actions | No workflow references to these path strings (grep `.github`). |
| Shape | Each tree is a **mini Next app** (own `package.json`, `next.config.mjs`, `app/`, duplicate `components/ui`). |

## Enforcement

- **TypeScript:** [`web/tsconfig.json`](../web/tsconfig.json) excludes both trees from the canonical project compilation.
- **ESLint (P3-web-003):** [`web/.eslintrc.json`](../web/.eslintrc.json) — `no-restricted-imports` for `app/**` and `components/**` against path patterns matching `b_i0ofEW9bMcy` and `onboarding_enhancement`. Sole exception module: [`web/components/quarantine-import-allowlist.ts`](../web/components/quarantine-import-allowlist.ts) (rule off for that file only).

## Rules of engagement

1. **Production** = canonical routes in [`docs/web-route-inventory.md`](web-route-inventory.md) only.
2. Do **not** import from quarantine trees into canonical `app/` / `components/` code (ESLint enforces — see **Enforcement** above).
3. To promote UI, **copy or re-implement** in `web/` and delete quarantine copy in a follow-up PR—not re-export.

Run `npm run lint --prefix web` in CI and locally after edits under `app/` or `components/`.

## Revisit

- After P3-web-004 / P3-web-005, reconsider **Archive** if the trees are fully superseded and audit noise (`relay_audit.json`) should drop.
