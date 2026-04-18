# Auth Guardrails — Tier 1 build plan

**Status:** Approved (Tier 0 decisions locked, Tier 1 scope approved). Ready for ledger claim.
**Owners:** Backend identity (`src/identity/`, `src/server.ts`), Web shell (`web/app/`, `web/lib/`), Database (`prisma/`).
**Companion docs:**
- Identity model — [`architecture/multi-tenant-option-b.md`](architecture/multi-tenant-option-b.md)
- Runtime arch — [`architecture/multi-tenant-cloud-runtime.md`](architecture/multi-tenant-cloud-runtime.md)
- UX acceptance — [`qa/UX_ACCEPTANCE_GUARDRAILS.md`](qa/UX_ACCEPTANCE_GUARDRAILS.md)
- Tier 0 decisions — this doc, §1
- Tier 2 sweep (post-foundation) — to be opened after Tier 1 lands; this doc, §5

> **Foundation, not finish work.** Every item in this plan is a primitive that downstream features inherit for free. Do not begin Tier 2 redirect / role-flip / per-route guards until the eight items in §3 are merged and verified.

---

## 1. Tier 0 — Architectural decisions (locked)

| # | Decision | Resolution |
|---|---|---|
| **0.1** | Where does the Relay session token live in the browser? | **`HttpOnly` `Secure` `SameSite=Lax` cookie** named `relay_session`. The token is opaque (same shape as today's `relay_session_token`). Never readable by JS. |
| **0.2** | Can one `Account` be both Creator and Supporter? | **Yes — coin model.** A Relay profile is one coin: heads = Creator, tails = Supporter. Either side may be empty for a given Account. The active side is a UI lens; both sides remain queryable in the same session. |
| **0.2-bis** | Where does the "active role" live? | **Pure UI hint, not an authz claim.** Stored in a non-`HttpOnly` `relay_active_role` cookie (`creator` \| `supporter`) so SSR can render the right shell. Server handlers **never** trust it for permissions. Authz always derives capability from `Account.primaryRelayCreatorId` and `TenantMembership` rows. |
| **0.3** | What is the source of truth for authz? | **API + RLS, always.** Edge middleware is a **cheap perimeter** — it verifies the cookie's signature and admits/denies the request before it reaches the API, but it never grants new privilege. |
| **0.4** | URL identity shape | **Three layers.** UUID (`Tenant.id`) is immutable and used in **all FKs and RLS policies**. `relay_creator_id` (`cr_*`) is an immutable external string for cross-system correlation (Patreon, ingest, logs). `public_slug` is the **mutable** human-facing handle in URLs. Slug → UUID resolution happens once per request at the edge or in the route handler; nothing downstream uses the slug. |

### 1.1 Coherence with Option B identity

The coin model is **already encoded** in the existing schema (see [`architecture/multi-tenant-option-b.md`](architecture/multi-tenant-option-b.md)):

| Coin side | Existing model | Trigger to provision |
|---|---|---|
| Creator (heads) | `Account.primaryRelayCreatorId` → `Tenant` + `User` + `CreatorProfile` | First call to `POST /api/v1/creator/workspace` (idempotent). |
| Supporter (tails) | `TenantMembership(account_id, tenant_id, role=patron, tier_ids[])` | Patron Patreon link, manual support add, or signup against the platform tenant. |

**The unified comment requirement is satisfied automatically:** any author-identified row (comments, likes, follows, favorites) keys on **`Account.id`**, never on the active role. A creator who comments on another artist's work writes a row keyed on their own `Account.id` — the same id their supporter `TenantMembership` is attached to. No "switch profiles to comment" flow is ever needed.

### 1.2 Tier 0 invariants (enforce in code review forever)

1. **No JS reads `relay_session`.** If a `document.cookie` access pattern would read it, it's wrong — the cookie is `HttpOnly`. Web code never sees the token.
2. **No handler grants a permission based on `relay_active_role`.** That cookie is a UI hint. Authz is derived from DB rows.
3. **No FK or RLS policy references `public_slug` or `relay_creator_id`.** Both can change shape under us; UUIDs are the only safe key.
4. **One Account, one Supabase user, one cookie.** A second simultaneous sign-in must invalidate the first session server-side (handled in Tier 1.3).

---

## 2. Tier 1 — Scope summary (eight items, approved)

| # | Primitive | Owner area | Dep |
|---|---|---|---|
| 1.1 | Server-side authz check on every `/api/v1/*` request | `src/` | — |
| 1.2 | RLS policies for two-sided paywall (Creator owns vs. Supporter entitled) | `prisma/` + Supabase | 1.1 |
| 1.3 | Centralized fetch wrapper → `401`/`403` triggers logout + redirect | `web/lib/` | 1.1 |
| 1.4 | `useRequireLoggedIn` / `useRequireLoggedOut` hooks | `web/lib/` | 1.3 |
| 1.5 | Boot-splash convention (no flash-of-wrong-content) | `web/lib/` | 1.4 |
| 1.6 | `resolvePostAuthPath` is the only safe-redirect helper (lint-enforced) | `web/lib/` | — |
| 1.7 | `web/middleware.ts` cookie-based perimeter route guard | `web/` | 1.1 + cookie mirror (0.1) |
| 1.8 | Verb hygiene — mutations are POST/PUT/PATCH/DELETE only | repo-wide | — |

Build order is the topological sort of the dep graph; see §3.

---

## Tier 0 verification (GR-T0-VERIFY)

**Tier 0 automated verification passed 2026-04-17** (see [`docs/Airtable Drops/Guardrails/GR-T0-VERIFY-prompt.md`](Airtable%20Drops/Guardrails/GR-T0-VERIFY-prompt.md)): repo-root `npm run test`, `npm run build`, `npm run build --prefix web`, and `node scripts/m10-token-log-scan.mjs` are green; `tests/identity/rls-context.test.ts` and `tests/identity/resolve-tenant.test.ts` pass; Supabase dev DB `SELECT auth_account_id()` returns `NULL` with no session config; precondition files exist (`session-cookie.ts`, `coin-model-audit.md`, `rls-context-usage.md`, `url-identity-contract.md`, `resolve-tenant.ts`). **`web/` has no `npm run test` script** — web coverage is via the root Vitest suite where applicable. **Browser-only checks** in VERIFY (cookie DevTools A1–A5, onboarding/sign-in flows E1–E4) remain **manual** for the operator on a running stack.

**Notes vs VERIFY checklist:** (1) **`relay_active_role`** appears in `src/identity/set-active-role-cookie-for-session.ts` as well as `session-cookie.ts` and `server.ts` — wiring only, not authz. (2) **Schema scan D4:** `Account.primaryStudio` uses `references: [relayCreatorId]` — the intentional Option B link documented in [`url-identity-contract.md`](architecture/url-identity-contract.md), not an extra ad-hoc FK on `publicSlug`.

---

## 3. Build sequence (eight stages, in order)

Each stage names: **goal**, **files**, **acceptance criteria**, **out of scope**.

### Stage A — Cookie mirror + Bearer parity (Tier 0.1 → enables 1.7)

**Goal:** The opaque Relay session token is set by the API as an `HttpOnly` cookie **in addition to** being returned in the JSON body during a transition window. The web client stops reading it.

**Files:**
- `src/server.ts` — modify `POST /api/v1/auth/supabase/relay-session`, `POST /api/v1/auth/login`, `POST /api/v1/auth/signup`, and `POST /api/v1/identity/logout` to set / clear the `relay_session` cookie via `Set-Cookie` headers. Keep returning the token in JSON behind a feature flag `RELAY_COOKIE_SESSION_DUAL_WRITE=1` so existing clients keep working.
- New `src/identity/session-cookie.ts` — single helper exporting `setSessionCookie(res, token)`, `clearSessionCookie(res)`, and `readSessionCookie(req)`. Cookie attributes: `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=<session ttl>`. Domain set from `RELAY_COOKIE_DOMAIN` (e.g. `.relayapp.me`) so it's shared across subdomains.
- `web/lib/relay-auth-bootstrap.ts` — stop calling `localStorage.setItem("relay_session_token", ...)`. The cookie is already set by the API response; the client only needs the workspace IDs.
- `web/lib/relay-api.ts` — set `credentials: "include"` on every fetch so the cookie rides along; remove the `Authorization` header path for browser fetches once Stage F lands. (Server-to-server calls keep the Bearer header.)
- `web/lib/relay-session-logout.ts` — drop the `localStorage.removeItem("relay_session_token")` line; the API's `Set-Cookie: relay_session=; Max-Age=0` clears it. Keep removing `relay_creator_id` and `relay_public_slug` (those are still UI-side cache keys).

**Acceptance:**
- After sign-in, `document.cookie` does **not** contain `relay_session` (it's `HttpOnly`); browser devtools "Application → Cookies" shows it with the `HttpOnly` flag set.
- `localStorage.getItem("relay_session_token")` returns `null` after a fresh sign-in.
- Logout clears the cookie (Set-Cookie with `Max-Age=0` observed in Network tab).
- All existing `/api/v1/*` calls succeed when made from the web with `credentials: "include"` and no `Authorization` header.

**Out of scope:** Removing `localStorage` workspace IDs (`relay_creator_id`, `relay_public_slug`) — they're not the session token, just UI cache. Keep them.

---

### Stage B — Server authz middleware (Tier 1.1)

**Goal:** A single `requireAccount` middleware in `src/` resolves the cookie or Bearer to an `Account` row, attaches `{ accountId, supabaseUserId, primaryRelayCreatorId, memberships[] }` to the request, and returns `401` otherwise. **Every** `/api/v1/*` route uses it (or the explicit `requireAccountWithRole` variant).

**Files:**
- New `src/identity/require-account.ts` — exports `requireAccount(req): Promise<AccountContext>` and `requireAccountWithRole(req, role): Promise<AccountContext>`. Throws structured `RelayAuthError` with `401`/`403` and a `{ code, message }` envelope.
- `src/server.ts` — wrap all `/api/v1/*` routes (except the explicitly public `/api/v1/auth/*` and health endpoints) with the middleware. Routes that need a specific role declare it inline.
- New `src/identity/account-context.ts` — the shape of `AccountContext` and the helpers `canActAsCreator(ctx)` / `canActAsSupporterFor(ctx, tenantId)`. These are **read** helpers; they don't grant access (RLS does), they let handlers fail fast with a 403.

**Acceptance:**
- Unit test: every `/api/v1/*` route returns `401` when called with no cookie and no Bearer.
- Unit test: a route requiring creator capability returns `403` when called by an Account with no `primaryRelayCreatorId`.
- Code review checklist: every new route either uses `requireAccount` / `requireAccountWithRole` or has a comment explaining why it's public.

**Out of scope:** Tenant-scoped row checks — those live in RLS (Stage C). The middleware only authenticates and labels the request.

---

### Stage C — Two-sided RLS policies (Tier 1.2)

**Goal:** Every multi-tenant table has RLS policies that encode the coin model:
- **Creator side:** `account_id = auth_account_id() AND tenant_id IN (SELECT id FROM tenants WHERE id = (SELECT primary_tenant_id FROM accounts WHERE id = auth_account_id()))` (i.e. you own the tenant via `Account.primaryRelayCreatorId` → `Tenant.id`).
- **Supporter side:** `is_public = true OR EXISTS (SELECT 1 FROM tenant_memberships m WHERE m.account_id = auth_account_id() AND m.tenant_id = <row>.tenant_id AND <row>.required_tier_id = ANY(m.tier_ids))`.

**Files:**
- New `prisma/migrations/<ts>_tier1_rls/migration.sql` — enables RLS and adds policies for: `posts`, `media_items`, `collections`, `comments`, `likes`, `favorites`, plus any join tables. (Exact list to be enumerated by the implementing agent against current schema.)
- New `src/lib/supabase-rls-context.ts` — server helper that sets `request.jwt.claims` (or a custom `set_config('relay.account_id', ...)`) at the top of each handler so RLS can read `auth_account_id()`. Pattern: a small SQL function `auth_account_id() returns text` that reads from session config.
- New `prisma/migrations/<ts>_auth_account_id_fn/migration.sql` — defines `auth_account_id()` and grants `EXECUTE` to the app role.
- Test fixtures in `tests/rls/` — table-driven assertions: for each (table, persona, expected_visible_rows) tuple, run a query and verify RLS filters correctly.

**Two-sided policy template:**

```sql
-- Creator-owned read+write on a tenant-scoped table
CREATE POLICY tier1_creator_owns ON posts
  FOR ALL
  USING (
    tenant_id = (
      SELECT t.id FROM tenants t
      JOIN accounts a ON a.primary_relay_creator_id = t.relay_creator_id
      WHERE a.id = auth_account_id()
    )
  );

-- Supporter read on tenant-scoped, tier-gated content
CREATE POLICY tier1_supporter_reads ON posts
  FOR SELECT
  USING (
    is_public
    OR EXISTS (
      SELECT 1 FROM tenant_memberships m
      WHERE m.account_id = auth_account_id()
        AND m.tenant_id  = posts.tenant_id
        AND (posts.required_tier_id IS NULL
             OR posts.required_tier_id = ANY(m.tier_ids))
    )
  );
```

**Acceptance:**
- All RLS test fixtures pass: creator sees only their own tenant's rows; supporter sees public + tier-entitled rows; no role sees other creators' private rows.
- A handler that forgets to call `setSupabaseRlsContext(accountId)` returns zero rows (fail-closed), not all rows.
- `npm run test` includes the RLS suite.

**Out of scope:** Cross-tenant admin / staff visibility (no admin role exists yet). Soft-delete visibility rules (separate ledger row).

---

### Stage D — Centralized fetch + 401 handler (Tier 1.3)

**Goal:** One `relayFetch` wrapper in `web/lib/relay-api.ts` is the **only** way the web app calls `/api/v1/*`. On `401`/`403` it calls `performRelayLogout()` and `router.replace("/login?reason=expired&returnTo=<encoded>")`.

**Files:**
- `web/lib/relay-api.ts` — extend the existing `relayFetch` to:
  - Set `credentials: "include"` (Stage A).
  - On `401`: call `performRelayLogout()` (which already wipes the workspace IDs and signs out Supabase), then `window.location.assign("/login?reason=expired&returnTo=" + encodeURIComponent(currentPath))`.
  - On `403`: throw a typed `RelayForbiddenError` so callers can render an inline "you don't have access to this" state instead of redirecting.
- New `web/lib/relay-fetch-errors.ts` — typed errors (`RelayUnauthorizedError`, `RelayForbiddenError`, `RelayServerError`).
- Audit pass: grep `web/` for raw `fetch("/api/` and `fetch(\`${RELAY_API_BASE}` calls; replace with `relayFetch`.

**Acceptance:**
- Forcing an expired cookie (manually invalidate the session in DB) and refreshing any authenticated page lands on `/login?reason=expired&returnTo=<path>`.
- Forcing a `403` on a single endpoint shows an inline error, **not** a logout.
- `rg "fetch\\(\"/api/" web/` returns zero hits in app code (test fixtures excluded).

**Out of scope:** Retry logic, request deduping, optimistic updates.

---

### Stage E — Hooks + boot splash (Tier 1.4 + 1.5)

**Goal:** Two tiny hooks make every guarded route a one-liner. Both render a neutral loader until `ready`, eliminating flash-of-wrong-content.

**Files:**
- New `web/lib/use-require-logged-in.ts`:

  ```ts
  export function useRequireLoggedIn(redirectTo = "/login"): {
    ready: boolean;
    blocked: boolean;
  } {
    const router = useRouter();
    const pathname = usePathname();
    const { ready, hasRelaySession } = useStudioSession();

    useEffect(() => {
      if (ready && !hasRelaySession) {
        const returnTo = encodeURIComponent(pathname);
        router.replace(`${redirectTo}?returnTo=${returnTo}`);
      }
    }, [ready, hasRelaySession, redirectTo, router, pathname]);

    return { ready, blocked: ready && !hasRelaySession };
  }
  ```

- New `web/lib/use-require-logged-out.ts` — symmetric; uses `resolvePostAuthPath` for the destination.
- New `web/app/components/AuthBootSplash.tsx` — the single neutral loader UI. Both hooks export a `<BootSplashOr children />` helper so pages render `<BootSplashOr>{actualPage}</BootSplashOr>` without each page rolling its own loader.
- Update `web/lib/studio-session-context.tsx` — once Stage A is in place, `hasRelaySession` is derived from a server-rendered hint (a non-`HttpOnly` `relay_signed_in=1` companion cookie set alongside `relay_session`) rather than from `localStorage`. This eliminates the `ready === false` SSR window.

**Acceptance:**
- A logged-out user navigating to a guarded route sees the boot splash for one frame at most, then `/login`. No flash of the guarded page's content.
- A logged-in user navigating to `/login` sees the boot splash for one frame at most, then the post-auth destination.
- The splash component is imported only via the two hooks (no per-page copies).

**Out of scope:** Applying the hooks to specific routes — that's Tier 2 work (§5).

---

### Stage F — `web/middleware.ts` perimeter (Tier 1.7)

**Goal:** A single Edge middleware verifies the `relay_session` cookie's existence and redirects unauthenticated users away from app routes and authenticated users away from auth-entry routes — **before** the page even renders.

**Files:**
- New `web/middleware.ts`:

  ```ts
  import { NextResponse, type NextRequest } from "next/server";

  const APP_ROUTES = [
    /^\/designer(\/|$)/,
    /^\/action-center(\/|$)/,
    /^\/collections(\/|$)/,
    /^\/patron\/(?!c\/)/, // /patron/c/[handle] is public
  ];
  const AUTH_ENTRY_ROUTES = [
    /^\/login(\/|$)/,
    /^\/onboarding(\/|$)/,
    /^\/landing(\/|$)/,
  ];

  export function middleware(req: NextRequest) {
    const signedIn = Boolean(req.cookies.get("relay_session")?.value);
    const url = new URL(req.url);

    if (!signedIn && APP_ROUTES.some((r) => r.test(url.pathname))) {
      const dest = new URL("/login", req.url);
      dest.searchParams.set("returnTo", url.pathname + url.search);
      return NextResponse.redirect(dest);
    }
    if (signedIn && AUTH_ENTRY_ROUTES.some((r) => r.test(url.pathname))) {
      const returnTo = url.searchParams.get("returnTo");
      const dest = new URL(returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/", req.url);
      return NextResponse.redirect(dest);
    }
    return NextResponse.next();
  }

  export const config = {
    matcher: [
      "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
    ],
  };
  ```

- Note: middleware checks **presence** of the cookie only — it does **not** validate the token's signature (that's the API's job in Stage B). This is the deliberate "cheap perimeter" model from Tier 0.3. A forged cookie that satisfies the middleware will still be rejected at the API layer with `401`, which Stage D handles cleanly.
- `relayapp.me/` (`/`) is **not** in either list. The `home-page-client.tsx` split (landing vs library) handles that case in client code; a Tier 2 task will replace it with a `router.replace("/login")` for logged-out users so the URL itself reflects state.

**Acceptance:**
- Logged-out user typing `relayapp.me/designer` lands on `/login?returnTo=%2Fdesigner` — middleware redirected before any React rendered.
- Logged-in user typing `relayapp.me/login` lands on `/`. No login form ever rendered.
- Public pages (`/patron/c/<handle>`, `/landing`, `/`) load for both states.
- Middleware doesn't run on `/api/*` (those handle their own auth via Stage B).

**Out of scope:** Role-based middleware (creator-only vs supporter-only routes) — defer to a later tier; the API + RLS handles role checks for now.

---

### Stage G — Safe-redirect single source (Tier 1.6)

**Goal:** Exactly one helper — `resolvePostAuthPath` in `web/lib/post-login-redirect.ts` — computes any post-auth or post-logout destination. Lint-enforced.

**Files:**
- `web/lib/post-login-redirect.ts` — already correct. Keep it as the only export.
- New `.eslintrc` rule (custom or via `no-restricted-syntax`) that flags any `router.replace`/`router.push` whose argument starts with a query-string-derived value not passed through `resolvePostAuthPath`. Suggested rule:

  ```js
  // .eslintrc.cjs
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: "CallExpression[callee.property.name=/^(replace|push)$/] > MemberExpression.callee[object.name='router']",
        message: "Use resolvePostAuthPath() for any redirect derived from search params or external input."
      }
    ]
  }
  ```
  *(Implementing agent: tighten the AST query so it only fires on calls where the argument is or includes a `searchParams.get` / `URL` parse — the snippet above is a starting point.)*
- Code-review checklist update in `docs/qa/UX_ACCEPTANCE_GUARDRAILS.md` §1: "All post-auth destinations must come from `resolvePostAuthPath`."

**Acceptance:**
- `rg "router\\.(replace|push)\\(" web/` shows every dynamically computed destination either uses a hard-coded literal or wraps the input in `resolvePostAuthPath`.
- `resolvePostAuthPath("//evil.com/x")` returns `/`, not `//evil.com/x`. (Already true; add a unit test in `web/lib/__tests__/post-login-redirect.test.ts`.)

**Out of scope:** Server-side `Location:` header construction — covered by middleware in Stage F.

---

### Stage H — Verb hygiene (Tier 1.8)

**Goal:** Mutations are POST/PUT/PATCH/DELETE; GETs are side-effect-free. Conventional, low-cost, prevents an entire class of CSRF-via-prefetch and link-preview bugs.

**Files:**
- New `docs/qa/HTTP_VERB_HYGIENE.md` (or fold into `UX_ACCEPTANCE_GUARDRAILS.md`) — one page: the rule, the rationale, the lint check, the exceptions (idempotent reads, including `GET /api/v1/identity/logout` which **must be deleted** — logout is a POST).
- Audit pass: grep `src/server.ts` for `app.get(` routes; verify none mutate. Convert any offenders to POST/DELETE in a separate ledger row (don't bundle into Tier 1).
- Add the rule to `AGENTS.md` or the create-rule skill so future agents inherit it.

**Acceptance:**
- A grep finds zero `GET` handlers under `/api/v1/*` that write to the DB.
- Logout is exclusively `POST /api/v1/identity/logout`.
- The rule is documented in a place agents will read.

**Out of scope:** CSRF tokens. With `SameSite=Lax` cookies + verb hygiene, CSRF tokens are belt-and-suspenders, not foundational. Defer.

---

## 4. Cross-stage acceptance — one paragraph per persona

When all eight stages are merged:

- **Logged-out visitor:** Hits `relayapp.me` → sees `/login` (or marketing landing per product call). Hits any app route → bounced to `/login?returnTo=...`. Hits `/patron/c/<handle>` → public profile renders.
- **Creator (heads):** Signs in → cookie set → middleware admits app routes → API + RLS scope all writes to their own `Tenant`. Tries to load another creator's `/designer` → API returns `403`, fetch wrapper renders inline forbidden, no logout.
- **Supporter (tails):** Signs in → same cookie → middleware admits `/patron/feed` etc. → RLS returns posts where `is_public OR tier-entitled`. Tries to access creator-only routes → middleware admits (it doesn't know about role), API returns `403`, fetch wrapper renders inline forbidden.
- **Coin-flipper (both sides):** Signs in once → both `Account.primaryRelayCreatorId` and `TenantMembership` rows resolve. Visits another creator's gallery → comments as themselves (row keyed on `Account.id`) without changing sessions. Toggling the active-role UI lens updates `relay_active_role` cookie and re-renders the appropriate shell. **No re-auth, no token rotation, no permission change.**
- **Expired session:** Any fetch returns `401` → `performRelayLogout()` clears workspace cache → redirect to `/login?reason=expired&returnTo=<path>`. After re-sign-in, lands back on the originating page.

---

## 5. Out of scope (Tier 2 sweep — open after this lands)

Do not start these until §3 is fully merged and §4 acceptance passes.

| # | Tier 2 item | Owner |
|---|---|---|
| 2.1 | Apply `useRequireLoggedOut` to `/login`, `/onboarding`, `/landing`, `/auth/confirm`, `/patreon/connect`, `/patron/onboarding` | Web |
| 2.2 | Apply `useRequireLoggedIn` to `/designer`, `/action-center`, `/collections`, `/patron/feed`, `/patron/profile`, `/patron/commission-hub` | Web |
| 2.3 | Identity-mismatch guard in `bootstrapStudioAfterSupabase` (refuse silent `Account` swap) | Web + Backend |
| 2.4 | Cross-tab "you signed out elsewhere" banner | Web |
| 2.5 | Single-session-per-tab confirm before re-running sign-in | Web |
| 2.6 | OAuth `state` single-use + replay rejection audit | Backend |
| 2.7 | `returnTo` validation audit (every redirect uses `resolvePostAuthPath`) | Web |
| 2.8 | Token-in-URL/log scan extended to `web/` (`m10-token-log-scan.mjs`) | Tooling |
| 2.9 | **Active-role UI lens** — visible coin-flip toggle in app chrome, sets `relay_active_role` cookie, re-renders nav | Web |

Tier 3 (per-feature guardrails) and Tier 4 (account-takeover hardening) are explicitly **deferred** and will be opened as separate plans when their parent features ship.

---

## 6. Ledger handoff (Production Ledger — Airtable)

Open one row per stage (A–H), each titled `Tier1-<letter> · <short name>`, with this doc linked under "Ready for v0" criteria:

- Acceptance criteria from §3 copied into the row's "Definition of Done."
- Each row claimable independently except: **B blocks C, D, F**; **A blocks F**; **D blocks E**.
- Estimated total: **1–2 weeks** for a single backend + single web agent working in parallel.
- Use `Session Lock` per `.cursor/rules/airtable-execution-control-plane.mdc`. Read `Production Ledger` state before claiming.

---

## 7. Tier 0 invariants — code review checklist (paste into PR template)

- [ ] No new code reads `relay_session` from `document.cookie` or any JS-accessible storage.
- [ ] No new handler grants permission based on `relay_active_role`.
- [ ] No new FK or RLS policy references `public_slug` or `relay_creator_id` (use `Tenant.id` UUID).
- [ ] Any new `/api/v1/*` route either calls `requireAccount` / `requireAccountWithRole` or has a comment explaining why it is public.
- [ ] Any new web fetch goes through `relayFetch` (not raw `fetch`).
- [ ] Any new redirect that incorporates user-supplied input passes through `resolvePostAuthPath`.
- [ ] Any new mutation uses POST/PUT/PATCH/DELETE (never GET).
