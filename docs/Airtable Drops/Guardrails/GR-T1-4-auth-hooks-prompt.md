# GR-T1-4 — `useRequireLoggedIn` / `useRequireLoggedOut` hooks

## Context

You are building **Tier 1 primitive #4** of the Auth Guardrails plan ([`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §3 Stage E). With cookie-based auth (T0-1) and the centralized fetch wrapper (T1-3) in place, this row creates the two tiny hooks that every guarded route will use in Tier 2:

- `useRequireLoggedIn(redirectTo = "/login")` — bounces unauthenticated users to `/login?returnTo=<path>`.
- `useRequireLoggedOut(redirectTo)` — bounces authenticated users to a safe destination via `resolvePostAuthPath`.

Both hooks integrate with the boot splash (row 1.5) so guarded pages never flash wrong content.

## Preconditions

- [ ] `GR-T0-1-cookie-mirror-prompt.md` shipped (cookie-based session signal).
- [ ] `GR-T0-2-coin-model-active-role-prompt.md` shipped (`activeRole` exposed by `useStudioSession`).
- [ ] `GR-T1-3-fetch-401-prompt.md` shipped (logout redirect uses the same pattern).

## Tier 0 invariants (always apply)

1. The hooks read **only** the `relay_signed_in` companion cookie and the `useStudioSession` context — never `localStorage` for the session token.
2. Both hooks return `{ ready, blocked }` so consuming pages can render the boot splash conditionally without each rolling its own loader.
3. All redirects pass through `resolvePostAuthPath`.

## Goal

Two hooks exported from `web/lib/`:

- `useRequireLoggedIn(redirectTo?)` — for app routes.
- `useRequireLoggedOut(redirectTo?)` — for auth-entry routes.

Plus a `<BootSplashOr>` convenience component that wraps a hook + the splash so pages become one-liners. (Row 1.5 builds the splash itself; this row just wires the hook → splash handoff.)

## Reference reading

1. [`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §3 Stage E.
2. `web/lib/studio-session-context.tsx` — the existing context provider; this row consumes `ready` and `hasRelaySession`.
3. `web/lib/post-login-redirect.ts` — `resolvePostAuthPath()`.
4. `web/app/login/LoginPageClient.tsx` — the page where `useRequireLoggedOut` will eventually be applied (in Tier 2). Read it to confirm the search-param shape (`returnTo`, `role`).

## Implementation steps

### Part A — `useRequireLoggedIn` (~1.5 hours)

1. **Create `web/lib/use-require-logged-in.ts`**:

   ```ts
   "use client";
   import { useEffect } from "react";
   import { useRouter, usePathname, useSearchParams } from "next/navigation";
   import { useStudioSession } from "./studio-session-context";

   export type GuardState = { ready: boolean; blocked: boolean };

   /**
    * Tier 1.4 — bounce unauthenticated users to /login.
    *
    * Returns:
    *  - ready: true once the session check has resolved.
    *  - blocked: true when ready && !hasRelaySession (the redirect is in flight).
    *
    * Pages should wrap their content in <BootSplashOr blocked> or
    * conditionally render the splash from row 1.5.
    */
   export function useRequireLoggedIn(redirectTo = "/login"): GuardState {
     const router = useRouter();
     const pathname = usePathname();
     const search = useSearchParams();
     const { ready, hasRelaySession } = useStudioSession();

     useEffect(() => {
       if (!ready) return;
       if (hasRelaySession) return;
       const here = `${pathname}${search.toString() ? `?${search.toString()}` : ""}`;
       const url = `${redirectTo}?returnTo=${encodeURIComponent(here)}`;
       router.replace(url);
     }, [ready, hasRelaySession, redirectTo, router, pathname, search]);

     return { ready, blocked: ready && !hasRelaySession };
   }
   ```

### Part B — `useRequireLoggedOut` (~1 hour)

2. **Create `web/lib/use-require-logged-out.ts`**:

   ```ts
   "use client";
   import { useEffect } from "react";
   import { useRouter, useSearchParams } from "next/navigation";
   import { useStudioSession } from "./studio-session-context";
   import { resolvePostAuthPath } from "./post-login-redirect";

   export type GuardState = { ready: boolean; blocked: boolean };

   /**
    * Tier 1.4 — bounce authenticated users away from auth-entry routes.
    *
    * Honors ?returnTo when present (validated by resolvePostAuthPath); otherwise
    * defaults to `/`.
    */
   export function useRequireLoggedOut(): GuardState {
     const router = useRouter();
     const search = useSearchParams();
     const { ready, hasRelaySession } = useStudioSession();

     useEffect(() => {
       if (!ready) return;
       if (!hasRelaySession) return;
       const dest = resolvePostAuthPath(search.get("returnTo"));
       router.replace(dest);
     }, [ready, hasRelaySession, router, search]);

     return { ready, blocked: ready && hasRelaySession };
   }
   ```

### Part C — Convenience wrapper (~1 hour)

3. **Create `web/app/components/auth/BootSplashOr.tsx`**:

   ```tsx
   "use client";
   import type { ReactNode } from "react";
   import { AuthBootSplash } from "./AuthBootSplash"; // built in row 1.5

   /**
    * Tier 1.4 — render the boot splash while a guard is resolving or while a
    * redirect is in flight; otherwise render children.
    *
    * Usage:
    *   const guard = useRequireLoggedIn();
    *   return <BootSplashOr guard={guard}>{actualPageContent}</BootSplashOr>;
    */
   export function BootSplashOr({
     guard,
     children
   }: {
     guard: { ready: boolean; blocked: boolean };
     children: ReactNode;
   }) {
     if (!guard.ready || guard.blocked) return <AuthBootSplash />;
     return <>{children}</>;
   }
   ```

   **Coordination with row 1.5:** the `AuthBootSplash` component does not exist until row 1.5 ships. Two valid approaches:
   - **Recommended:** Create a placeholder `AuthBootSplash` in this row (a div with `Loading…`) so the hooks are testable. Row 1.5 then replaces the placeholder with the real component without touching this row's exports.
   - **Alternative:** Make `BootSplashOr` accept the splash as a prop. Less elegant; not recommended.

   Pick option 1.

### Part D — Tests (~2 hours)

4. **Unit tests in `web/lib/__tests__/auth-hooks.test.tsx`** (use React Testing Library + a mock `StudioSessionProvider`):
   - `useRequireLoggedIn` — when ready=false: returns `blocked=false`, no redirect.
   - When ready=true & hasRelaySession=true: returns `blocked=false`, no redirect.
   - When ready=true & hasRelaySession=false: triggers `router.replace("/login?returnTo=<encoded>")`.
   - The `returnTo` param is the current pathname + search.
   - `useRequireLoggedOut` — when ready=true & hasRelaySession=true & no returnTo: redirects to `/`.
   - When ready=true & hasRelaySession=true & returnTo=`/designer`: redirects to `/designer`.
   - When ready=true & hasRelaySession=true & returnTo=`//evil.com`: redirects to `/` (sanitized via `resolvePostAuthPath`).

5. **Do not apply the hooks to any route in this row.** Route adoption is **Tier 2** work (rows 2.1 and 2.2).

## Acceptance criteria

- [ ] `web/lib/use-require-logged-in.ts` and `use-require-logged-out.ts` exist with the exports above.
- [ ] `web/app/components/auth/BootSplashOr.tsx` exists with a placeholder `AuthBootSplash` import (real splash lands in 1.5).
- [ ] All unit tests in `web/lib/__tests__/auth-hooks.test.tsx` pass.
- [ ] Manual smoke: temporarily wrap one test page (NOT a production route) with the hook and verify behavior in DevTools. Revert the test wrapping before merging.
- [ ] `rg "useRequireLoggedIn|useRequireLoggedOut" web/app/` returns zero hits (no production usage in this row).
- [ ] `npm run test` and `npm run build` pass in `web/`.

## Out of scope

- Applying the hooks to actual routes (`/login`, `/onboarding`, `/designer`, etc.) — Tier 2 rows 2.1, 2.2.
- The visible splash UI — row 1.5.
- The active-role lens UI toggle — Tier 2 row 2.9.
- Server-side redirects — `web/middleware.ts` (row 1.7) handles those for the cookie-presence case; the hooks are belt-and-suspenders for client transitions.

## Handoff

Delta Out:
- Confirmation that no production route was wrapped (this is foundation only).
- Note for row 1.5: the placeholder `AuthBootSplash` to replace.
- Note for Tier 2: the two hooks are ready; rows 2.1/2.2 can adopt them.

Next claimable: `GR-T1-5-boot-splash-prompt.md` (real splash UI).
