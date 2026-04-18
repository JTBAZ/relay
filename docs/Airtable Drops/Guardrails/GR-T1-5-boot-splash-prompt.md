# GR-T1-5 — `<AuthBootSplash />` neutral loader

## Context

You are building **Tier 1 primitive #5** of the Auth Guardrails plan ([`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §3 Stage E). Row 1.4 created the `useRequireLoggedIn` / `useRequireLoggedOut` hooks and a `BootSplashOr` wrapper that imports a placeholder `<AuthBootSplash />`. This row replaces that placeholder with the **real** neutral loader and consolidates loading-state UI across the app.

The goal is to **eliminate flash-of-wrong-content** on every guarded route: while `ready === false` or while a redirect is in flight, the user sees the splash — never the wrong page.

## Preconditions

- [ ] `GR-T1-4-auth-hooks-prompt.md` shipped (placeholder `AuthBootSplash` exists; `BootSplashOr` consumes it).

## Tier 0 invariants (always apply)

1. The splash is a **pure UI component** — it makes no network calls, reads no auth state, and never decides what to render based on the user's identity.
2. The splash respects the same color tokens as the rest of the app shell (do not hard-code colors when CSS vars exist).
3. A11y: the splash announces itself to screen readers via `aria-live="polite"` and includes a visually-hidden status string.

## Goal

A single `<AuthBootSplash />` component imported from `web/app/components/auth/AuthBootSplash.tsx`. It's a brand-aligned loader matching the existing `/login` and Library aesthetic. Used by `BootSplashOr` (already wired in 1.4); also exported for direct use by routes that need to show the splash outside a guard hook (rare).

## Reference reading

1. [`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §3 Stage E.
2. `web/app/components/auth/BootSplashOr.tsx` (from 1.4) — the consumer.
3. `web/app/login/LoginPageClient.tsx` — note the brand color tokens used (`#0A0A0A` background, `#F9FAFB` text, `#40916C` accent, `Loader2` icon from `lucide-react`).
4. `web/app/auth/confirm/page.tsx` — uses the same loader pattern; harvest the visual treatment.
5. `web/app/components/RelayLogo.tsx` (or wherever the logo lives) — splash should include the logo.

## Implementation steps

### Part A — Build the component (~2 hours)

1. **Create `web/app/components/auth/AuthBootSplash.tsx`**:

   ```tsx
   "use client";
   import { Loader2 } from "lucide-react";
   import { RelayLogo } from "./relay-logo"; // adjust import path

   /**
    * Tier 1.5 — neutral auth boot splash.
    *
    * Rendered while a guard hook (useRequireLoggedIn / useRequireLoggedOut)
    * is resolving its session check or while a redirect is in flight.
    *
    * Pure UI: no network calls, no auth-state reads, no role-based branching.
    */
   export function AuthBootSplash() {
     return (
       <div
         role="status"
         aria-live="polite"
         className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-6 px-4"
         style={{ background: "#0A0A0A", color: "#F9FAFB" }}
       >
         <RelayLogo size="md" />
         <Loader2
           className="h-8 w-8 animate-spin"
           style={{ color: "#40916C" }}
           aria-hidden
         />
         <span className="sr-only">Loading…</span>
       </div>
     );
   }
   ```

2. **Replace the placeholder import in `BootSplashOr`** (from 1.4) — point at the real component path. If 1.4 already imported from `./AuthBootSplash`, this is a no-op.

3. **Verify SSR behavior:** the component must not crash on the server. `Loader2` from `lucide-react` SSRs cleanly; `RelayLogo` should as well — confirm by visiting any route that renders the splash with JS disabled in DevTools.

### Part B — Consolidate other loaders (audit only — do not break working UI) (~2 hours)

4. **Find existing loader UIs** in the auth/onboarding flow that should defer to the splash:

   ```bash
   rg "Loader2.*animate-spin" web/app/
   rg "Loading…|Loading\\.\\.\\." web/app/
   ```

5. **For each result, classify:**
   - **Replace:** Auth/session-related loaders that should now be `<AuthBootSplash />`. Specifically the loader inside `web/app/auth/confirm/page.tsx` (the "Confirming your account…" state) — this should keep its custom message but use the splash's chrome (background, layout). Refactor to compose: `<AuthBootSplash><span>Confirming your account…</span></AuthBootSplash>` if you extend the component to accept an optional `message` prop.
   - **Keep:** Page-content loaders (Library skeleton, gallery item shimmer) — these are domain UI, not auth UI. Do not touch.

6. **(Optional) Extend the splash to accept an optional `message` prop:**

   ```tsx
   export function AuthBootSplash({ message }: { message?: string }) {
     return (
       <div role="status" aria-live="polite" /* ...same chrome... */>
         <RelayLogo size="md" />
         <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#40916C" }} aria-hidden />
         {message ? (
           <p className="text-sm" style={{ color: "#9CA3AF" }}>{message}</p>
         ) : (
           <span className="sr-only">Loading…</span>
         )}
       </div>
     );
   }
   ```

   Then `auth/confirm/page.tsx` becomes `<AuthBootSplash message="Confirming your account…" />`.

### Part C — Visual verification (~1 hour)

7. **Manual visual check** in dev:
   - Visit `/auth/confirm` without query params — splash renders cleanly. (Will then error out because no token; that's pre-existing behavior — don't fix here.)
   - Throttle network in DevTools (Slow 3G) and reload `/login` — the brief boot moment now shows the splash instead of a blank white frame.
   - Toggle dark mode if applicable; splash's hard-coded `#0A0A0A` bg should match the rest of the auth surfaces.

## Acceptance criteria

- [ ] `web/app/components/auth/AuthBootSplash.tsx` exists with `role="status"`, `aria-live="polite"`, and a visually-hidden status text.
- [ ] `BootSplashOr` (from 1.4) imports the real component, not a placeholder.
- [ ] `web/app/auth/confirm/page.tsx`'s "Confirming your account…" loader uses the splash chrome (or has an explicit comment explaining why it doesn't).
- [ ] No production page-content loader (gallery, Library, Designer) was changed.
- [ ] `npm run test` and `npm run build` pass in `web/`.
- [ ] Manual: throttle network, reload `/login` — brief splash render observed; no white-flash.
- [ ] A11y: in DevTools accessibility tree, the splash exposes a status role and the screen-reader text.

## Out of scope

- Animations beyond the spinner (no fancy fade transitions).
- Brand redesign — match existing tokens.
- Page-content skeletons (Library item placeholders, etc.) — domain UI, not auth UI.
- Applying the splash to non-auth-guarded routes — only `BootSplashOr` and `auth/confirm` use it directly in this row.

## Handoff

Delta Out:
- Confirmation that no page-content loader was disturbed.
- Note: with 1.4 + 1.5 shipped, **Tier 2 row 2.1 / 2.2** can begin (route adoption of the hooks).

Next claimable: `GR-T1-VERIFY-prompt.md` once 1.6, 1.7, 1.8 are also merged. (1.6 / 1.8 are independent.)
