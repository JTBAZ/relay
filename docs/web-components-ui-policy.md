# `web/components/ui` ownership policy (P3-web-005)

**Date:** 2026-05-08  
**Decision:** **`web/components/ui/index.ts` (barrel file) — banned.** Shadcn-style primitives must be imported via **deep paths** only.

## Canonical layout (target)

- **Folder:** `web/components/ui/` — intended as the **single** home for shared shadcn/Radix primitives used by production `app` and `components` (when migrated from [`components/patron-mock/ui`](../web/components/patron-mock/ui)).
- **Imports:** Always `import { … } from "@/components/ui/button"` (one file per component), **never** `from "@/components/ui"`.

## Why no barrel

- Avoids accidental **large bundle** pulls and unclear dependency edges.
- Matches common Next + shadcn guidance: **explicit per-component imports** for tree-shaking and RSC boundaries.

## Until `components/ui/` exists

Production patron shell still uses **`@/components/patron-mock/ui/*`** for the internal kit (see [`docs/patron-mock-inventory.md`](patron-mock-inventory.md)). **Do not** add `patron-mock/ui/index.ts` either.

## Enforcement

[`web/.eslintrc.json`](../web/.eslintrc.json) — for `app/**` and `components/**`, `no-restricted-imports` blocks:

- Bare **`@/components/ui`** (barrel).
- Import paths ending in **`components/ui/index`** (`.ts` / `.tsx`).

## Changing this policy

If the team later adopts a **curated** barrel (e.g. sub-barrels per domain), update this doc and ESLint in the same PR.
