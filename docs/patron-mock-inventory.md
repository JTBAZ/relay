# Patron shell: `components/patron-mock` vs production routes (P3-web-004)

**Date:** 2026-05-08  
**Related:** [`docs/web-route-inventory.md`](web-route-inventory.md) (`/patron/*`), [`web/app/patron/layout.tsx`](../web/app/patron/layout.tsx).

## Summary

| Area | Role | Used by production? |
|------|------|---------------------|
| [`web/app/patron/feed/patron-mock.css`](../web/app/patron/feed/patron-mock.css) | Scoped tokens + scrollbar styling under `.patron-mock-root` | **Yes** — imported from [`web/app/patron/layout.tsx`](../web/app/patron/layout.tsx) and [`web/app/patreon/patron/layout.tsx`](../web/app/patreon/patron/layout.tsx). |
| [`web/components/patron-mock/ui/*`](../web/components/patron-mock/ui) | shadcn/Radix kit (copied tree) | **No** — no imports from [`web/app`](../web/app) or [`web/components/patron/relay`](../web/components/patron/relay) (verified grep 2026-05-08). Kit is self-contained (internal `@/components/patron-mock/ui/*` only). |
| [`web/components/patron-mock/theme-provider.tsx`](../web/components/patron-mock/theme-provider.tsx) | `next-themes` wrapper | **No** canonical importers (unused). |
| [`web/hooks/use-toast.ts`](../web/hooks/use-toast.ts) | Toast state hook (shadcn pattern) | **Hook is canonical**; only consumer of hook in-repo is [`web/components/patron-mock/ui/toaster.tsx`](../web/components/patron-mock/ui/toaster.tsx). **`<Toaster />` is not mounted** in `app/layout.tsx` or patron layouts as of this inventory. |

**Production patron UI** (feed, discover, library, etc.) lives under [`web/components/patron/relay/`](../web/components/patron/relay) and uses **custom Tailwind/markup**, not `patron-mock/ui`.

## Story-only / legacy kit (do not treat as product surface)

All files under `web/components/patron-mock/ui/*.tsx` except any future intentional imports should be considered **design debt / optional shell**: kept for parity with shadcn templates and possible future Toaster/command work, **not** tied to [`relay-app.tsx`](../web/components/patron/relay/relay-app.tsx).

## Dead re-exports (no external importers)

The following are **not imported** from `web/app/**`, `web/components/patron/**` (relay), or `web/lib/**` (except where noted historically):

- Entire **`patron-mock/ui`** barrel of components (button, dialog, sidebar, …) — circular internal imports only.
- **`patron-mock/theme-provider.tsx`**.

`web/hooks/use-toast.ts` previously imported **types** from `patron-mock/ui/toast`; **P3-web-004** removes that dependency so the hook depends only on `@radix-ui/react-toast` type shapes (see file `/**` comment).

## Merge / dedupe policy (pilot)

- **Canonical shadcn home** is still TBD at repo root (`web/components/ui` may appear in a later item); **do not** bulk-delete `patron-mock/ui` until a replacement Toaster/theme path is decided.
- Prefer **incremental** moves (≤5 components per PR) when aligning with a canonical `components/ui` (see P3-web-005).

**P3-web-005:** Barrel files **`components/ui/index.ts`** and **`patron-mock/ui/index.ts`** are **banned**; use deep imports only — [`docs/web-components-ui-policy.md`](web-components-ui-policy.md).

## Maintenance

When adding patron UI, import from **`@/components/patron/relay/*`** or shared **`@/lib/*`**, not from `patron-mock/ui`, unless deliberately adopting shadcn from this tree and updating this doc.
