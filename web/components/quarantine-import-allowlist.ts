/**
 * ESLint allowlist for `no-restricted-imports` (quarantine trees).
 *
 * Canonical `app` and `components` must not import from `web/b_i0ofEW9bMcy/` or
 * `web/onboarding_enhancement/` (see docs/web-quarantine-trees.md, P3-web-003).
 *
 * This file is the only `components/*` module where those imports are permitted
 * (rule disabled in .eslintrc.json). Prefer copying code into canonical paths
 * instead of adding imports here.
 */

export {};
