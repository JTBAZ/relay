# GR-T1-7 — `web/middleware.ts` cookie-presence perimeter guard

## Context

You are building **Tier 1 primitive #7** of the Auth Guardrails plan ([`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §3 Stage F). With cookies in place (T0-1) and the API authoritatively rejecting bad sessions (T1-1), this row adds a **fast perimeter** in Next.js Edge Middleware that:

- Redirects unauthenticated users away from app routes → `/login?returnTo=<path>`.
- Redirects authenticated users away from auth-entry routes → `/` (or honors `returnTo`).
- **Does not validate the token** — only checks cookie presence. Token validation is the API's job (T1-1) per Tier 0.3 ("RLS / API is source of truth, middleware is perimeter").

This is the row that satisfies the user's original `relayapp.me` redirect ask **at the URL layer**. The hooks from 1.4 are belt-and-suspenders for client transitions inside an already-loaded SPA.

## Preconditions

- [ ] `GR-T0-1-cookie-mirror-prompt.md` shipped (`relay_session` cookie set on auth).
- [ ] `GR-T0-VERIFY-prompt.md` shipped green.

## Tier 0 invariants (always apply)

1. Middleware reads only **cookie presence**, never cookie content. The token is `HttpOnly` and treated as opaque even server-side.
2. Middleware **does not** validate the token signature. A forged cookie passes middleware → still gets `401`'d at the API → fetch wrapper logs out.
3. Middleware does not run on `/api/*`. Those routes handle their own auth (T1-1).
4. Public routes (`/`, `/landing`, `/patron/c/<handle>`) are not in either redirect list.

## Goal

A single `web/middleware.ts` file that:

- Redirects unauthenticated users away from `APP_ROUTES`.
- Redirects authenticated users away from `AUTH_ENTRY_ROUTES`.
- Sanitizes `returnTo` with the same rule as `resolvePostAuthPath`.
- Skips static assets, `/api/*`, and Next.js internals.

## Reference reading

1. [`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §3 Stage F — includes the file template.
2. [Next.js middleware docs](https://nextjs.org/docs/app/building-your-application/routing/middleware) — confirm the matcher syntax for the project's Next version.
3. `web/lib/post-login-redirect.ts` — the same `returnTo` rule applied here.
4. `web/app/components/ConditionalAppNav.tsx` — informs which routes count as "app" vs "auth-entry."
5. The existing route list under `web/app/` — confirm what's in scope.

## Implementation steps

### Part A — Define route lists (~1 hour)

1. **Enumerate routes** under `web/app/` and classify each:

   - **APP** (logged-out → `/login?returnTo=...`):
     - `/designer` (and subpaths)
     - `/action-center` (and subpaths)
     - `/collections` (and subpaths)
     - `/patron/feed`, `/patron/profile`, `/patron/onboarding`, `/patron/commission-hub`, `/patron/former-subscriptions`, `/patron/favorites`
     - `/dev/*` (dev-only — keep gated)
   - **AUTH ENTRY** (logged-in → `/` or `returnTo`):
     - `/login` (and `/login/*`)
     - `/onboarding` (and `/onboarding/*`)
     - `/landing` (and `/landing/*`)
     - **Not** `/auth/confirm` — it must run for both states (it's the email-confirm processor; it's the *thing that creates* the session).
   - **PUBLIC** (no redirect either way):
     - `/` — splits client-side via `home-page-client.tsx`. (Optional follow-up: also redirect logged-out → `/login` from middleware to centralize the rule. **For this row, leave `/` public** to avoid coupling to the home-page split, which is product-driven. Make the change in a Tier 2 row if desired.)
     - `/landing` — wait, listed above as auth-entry. Decide per product intent. **Default: auth-entry** (logged-in users shouldn't see the marketing landing).
     - `/patron/c/[handle]` — public creator profile. Always renders.
     - `/visitor` and `/visitor/favorites` — public per `UX_ACCEPTANCE_GUARDRAILS.md`. Confirm with product.
     - `/auth/confirm`
     - `/api/*` — handled separately by the API
     - Static assets, `_next/*`, `favicon.ico`

2. **Open the parent plan** ([`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §3 Stage F) and reconcile the route lists. If product disagrees with any classification, note it in Delta Out and adjust.

### Part B — Implement middleware (~2 hours)

3. **Create `web/middleware.ts`**:

   ```ts
   import { NextResponse, type NextRequest } from "next/server";

   const APP_ROUTES = [
     /^\/designer(\/|$)/,
     /^\/action-center(\/|$)/,
     /^\/collections(\/|$)/,
     /^\/patron\/feed(\/|$)/,
     /^\/patron\/profile(\/|$)/,
     /^\/patron\/onboarding(\/|$)/,
     /^\/patron\/commission-hub(\/|$)/,
     /^\/patron\/former-subscriptions(\/|$)/,
     /^\/patron\/favorites(\/|$)/,
     /^\/dev\//
   ];

   const AUTH_ENTRY_ROUTES = [
     /^\/login(\/|$)/,
     /^\/onboarding(\/|$)/,
     /^\/landing(\/|$)/
   ];

   /** Same rule as web/lib/post-login-redirect.ts — duplicated because middleware
    *  cannot import client modules cleanly. Keep in sync. */
   function safeReturnTo(raw: string | null): string {
     const r = raw?.trim();
     if (!r) return "/";
     if (!r.startsWith("/")) return "/";
     if (r.startsWith("//")) return "/";
     return r;
   }

   export function middleware(req: NextRequest) {
     const signedIn = Boolean(req.cookies.get("relay_session")?.value);
     const url = new URL(req.url);
     const path = url.pathname;

     if (!signedIn && APP_ROUTES.some((r) => r.test(path))) {
       const dest = new URL("/login", req.url);
       dest.searchParams.set("returnTo", path + url.search);
       return NextResponse.redirect(dest);
     }

     if (signedIn && AUTH_ENTRY_ROUTES.some((r) => r.test(path))) {
       const dest = new URL(safeReturnTo(url.searchParams.get("returnTo")), req.url);
       return NextResponse.redirect(dest);
     }

     return NextResponse.next();
   }

   export const config = {
     // Run on every path except _next internals, /api, and static asset extensions.
     matcher: [
       "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)"
     ]
   };
   ```

4. **Note on `safeReturnTo` duplication:** middleware runs in the Edge runtime and cannot import `web/lib/post-login-redirect.ts` if that file uses any browser-only APIs. Duplicate the rule and keep them in sync. Cite the duplication in a comment with a link to the canonical helper. **If the helper is pure (no browser deps), import it directly.** Inspect first.

5. **Special-case for already-on-login:** when a logged-out user hits `/login` directly, do nothing — they're in the right place. The current middleware does this implicitly (no APP_ROUTE match). Verify.

### Part C — Tests (~2 hours)

6. **Create `web/__tests__/middleware.test.ts`** (Next.js middleware can be unit-tested by importing and calling with a mock `NextRequest`):

   ```ts
   import { middleware } from "../middleware";
   import { NextRequest } from "next/server";

   function makeReq(path: string, opts: { signedIn?: boolean; search?: string } = {}) {
     const url = `http://test.local${path}${opts.search ?? ""}`;
     const req = new NextRequest(url);
     if (opts.signedIn) {
       req.cookies.set("relay_session", "tok_test");
     }
     return req;
   }

   describe("middleware", () => {
     it("redirects unauthenticated user from /designer to /login?returnTo=", () => {
       const res = middleware(makeReq("/designer"));
       expect(res.status).toBe(307);
       const loc = res.headers.get("location")!;
       expect(loc).toContain("/login?returnTo=%2Fdesigner");
     });

     it("redirects authenticated user from /login to /", () => {
       const res = middleware(makeReq("/login", { signedIn: true }));
       expect(res.status).toBe(307);
       expect(res.headers.get("location")).toContain("/");
     });

     it("honors returnTo on /login when signed in (same-origin)", () => {
       const res = middleware(makeReq("/login", { signedIn: true, search: "?returnTo=%2Fdesigner" }));
       expect(res.headers.get("location")).toContain("/designer");
     });

     it("rejects //evil.com returnTo and falls back to /", () => {
       const res = middleware(makeReq("/login", { signedIn: true, search: "?returnTo=%2F%2Fevil.com" }));
       expect(res.headers.get("location")).not.toContain("evil.com");
     });

     it("does not redirect on / (public)", () => {
       expect(middleware(makeReq("/")).status).not.toBe(307);
       expect(middleware(makeReq("/", { signedIn: true })).status).not.toBe(307);
     });

     it("does not redirect on /patron/c/somehandle (public profile)", () => {
       expect(middleware(makeReq("/patron/c/anya")).status).not.toBe(307);
     });

     it("does not redirect on /auth/confirm in either state", () => {
       expect(middleware(makeReq("/auth/confirm")).status).not.toBe(307);
       expect(middleware(makeReq("/auth/confirm", { signedIn: true })).status).not.toBe(307);
     });
   });
   ```

### Part D — Manual smoke (~30 min)

7. **Test in dev:**
   - Sign out fully. Type `relayapp.me/designer` in address bar → land on `/login?returnTo=%2Fdesigner`. **No flash of the designer UI.**
   - Sign in. Type `relayapp.me/login` → land on `/`. **No flash of the login form.**
   - Sign in. Visit `/login?returnTo=/collections` directly → land on `/collections`.
   - Sign out. Visit `/patron/c/<known-handle>` → public profile renders normally.
   - Sign in. Visit `/auth/confirm?code=xxx` → confirm flow runs (don't actually need a valid code; just verify the page renders).

## Acceptance criteria

- [ ] `web/middleware.ts` exists with the route lists, the matcher config, and the `safeReturnTo` helper.
- [ ] All tests in `web/__tests__/middleware.test.ts` pass.
- [ ] Manual smoke checks all pass.
- [ ] No infinite redirect loop on any route (verify by visiting each AUTH_ENTRY route signed-in and each APP route signed-out).
- [ ] `/api/*` is not affected by middleware (verified by hitting `/api/v1/health` or any public API endpoint signed-out — should respond normally, not redirect).
- [ ] `npm run lint`, `npm run test`, `npm run build` pass in `web/`.

## Out of scope

- Role-based middleware (creator-only vs supporter-only routes) — defer; API + RLS handles role checks.
- Token signature validation in middleware — explicitly forbidden by Tier 0.3 (perimeter does cheap checks only).
- Server-side `/` redirect (logged-out → `/login`) — keep `/` public; the home page client splits today. Tier 2 row may centralize.
- Localization / i18n path prefixes — none currently; if/when added, route regexes need updating.

## Handoff

Delta Out:
- Final route lists (APP, AUTH ENTRY, PUBLIC) with any product reconciliations noted.
- Whether `safeReturnTo` was inlined or imported from `post-login-redirect.ts`.
- Manual smoke results.

Next claimable: `GR-T1-VERIFY-prompt.md` once 1.6, 1.8 are also merged.
