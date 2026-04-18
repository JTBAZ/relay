# GR-T1-3 — Centralized `relayFetch` with `401`/`403` handling

## Context

You are building **Tier 1 primitive #3** of the Auth Guardrails plan ([`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §3 Stage D). The web app currently has scattered `fetch("/api/...")` calls and a partial `relayFetch` wrapper. This row makes `relayFetch` the **only** way the web app talks to the Relay API and gives it deterministic behavior on auth failures:

- **`401`** → call `performRelayLogout()` (already exists), then redirect to `/login?reason=expired&returnTo=<encoded current path>`.
- **`403`** → throw a typed `RelayForbiddenError` so the calling component can render an inline "you don't have access" state. **Do not log out** on 403 — the user is signed in, just not entitled.

## Preconditions

- [ ] `GR-T0-1-cookie-mirror-prompt.md` shipped (cookie-based auth working; `credentials: "include"` is the new browser pattern).
- [ ] `GR-T1-1-require-account-prompt.md` shipped (server returns the structured 401/403 envelope this code keys on).
- [ ] `GR-T0-VERIFY-prompt.md` shipped green.

## Tier 0 invariants (always apply)

1. No JS reads `relay_session`. The wrapper relies on cookies riding via `credentials: "include"`.
2. All web calls go through `relayFetch`. After this row, raw `fetch("/api/v1/...")` is forbidden.
3. All redirects derived from user input pass through `resolvePostAuthPath` (the `returnTo` param computed here is a same-origin path, but still pass through the helper).

## Goal

After this row ships:

- `relayFetch` is the sole web-side API client for `/api/v1/*`.
- `401` triggers full logout + redirect with `?reason=expired&returnTo=<path>`.
- `403` throws `RelayForbiddenError`; calling components catch and render inline.
- Server errors (`5xx`) throw `RelayServerError`.
- A grep across `web/` finds zero raw `fetch` calls to `/api/`.

## Reference reading

1. [`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §3 Stage D.
2. `web/lib/relay-api.ts` — the existing wrapper. Extend, don't replace.
3. `web/lib/relay-session-logout.ts` — `performRelayLogout()` is the canonical full-wipe.
4. `web/lib/post-login-redirect.ts` — `resolvePostAuthPath()` for safe `returnTo` handling.

## Implementation steps

### Part A — Typed errors (~1 hour)

1. **Create `web/lib/relay-fetch-errors.ts`**:

   ```ts
   export class RelayUnauthorizedError extends Error {
     constructor(message = "Session expired or invalid.") { super(message); }
   }

   export class RelayForbiddenError extends Error {
     constructor(
       message = "You don't have access to this resource.",
       public readonly code?: string
     ) { super(message); }
   }

   export class RelayServerError extends Error {
     constructor(
       public readonly status: number,
       message: string,
       public readonly code?: string
     ) { super(message); }
   }
   ```

### Part B — Extend `relayFetch` (~3 hours)

2. **Update `web/lib/relay-api.ts`** so every fetch call:
   - Sets `credentials: "include"`.
   - Includes a default `Accept: application/json` header.
   - On `response.status === 401`: calls `performRelayLogout()`, then `window.location.assign(...)` to `/login?reason=expired&returnTo=<encoded>`. Throws `RelayUnauthorizedError` so any awaiting code unwinds.
   - On `response.status === 403`: parses the JSON envelope (if present) and throws `RelayForbiddenError(message, code)`.
   - On `response.status >= 500`: throws `RelayServerError`.
   - On other non-OK statuses (`4xx` not 401/403): throws a generic error or returns the parsed envelope per existing convention.

   Sketch (adjust to existing function signature):

   ```ts
   import {
     RelayUnauthorizedError,
     RelayForbiddenError,
     RelayServerError
   } from "./relay-fetch-errors";
   import { performRelayLogout } from "./relay-session-logout";
   import { resolvePostAuthPath } from "./post-login-redirect";

   export async function relayFetch<T>(
     path: string,
     init: RequestInit = {}
   ): Promise<T> {
     const headers = new Headers(init.headers);
     if (!headers.has("Accept")) headers.set("Accept", "application/json");

     const res = await fetch(`${RELAY_API_BASE}${path}`, {
       ...init,
       headers,
       credentials: "include"
     });

     if (res.status === 401) {
       await performRelayLogout();
       const here = typeof window !== "undefined"
         ? resolvePostAuthPath(window.location.pathname + window.location.search)
         : "/";
       const dest = `/login?reason=expired&returnTo=${encodeURIComponent(here)}`;
       if (typeof window !== "undefined") window.location.assign(dest);
       throw new RelayUnauthorizedError();
     }

     if (res.status === 403) {
       const body = await res.json().catch(() => ({}));
       throw new RelayForbiddenError(body?.error?.message, body?.error?.code);
     }

     if (res.status >= 500) {
       const body = await res.json().catch(() => ({}));
       throw new RelayServerError(res.status, body?.error?.message ?? res.statusText, body?.error?.code);
     }

     const json = (await parseRelayResponseBody(res, path)) as { data: T; error?: { message?: string } };
     if (!res.ok) {
       throw new Error(json.error?.message ?? res.statusText);
     }
     return json.data;
   }
   ```

3. **Important guard:** If the user is **already on `/login`** when a 401 happens (e.g. a stale background fetch firing during the redirect), do **not** redirect again. Detect with `window.location.pathname === "/login"` and skip the assign.

### Part C — Audit and migrate raw fetches (~3 hours)

4. **Run:** `rg "fetch\\(\"/api/" web/` and `rg "fetch\\(\\$\\{.*RELAY_API_BASE" web/`.

5. **For each hit, replace with `relayFetch`.** Verify the call site handles the new typed errors. Common patterns:

   ```tsx
   // BEFORE
   const res = await fetch(`/api/v1/foo`, { method: "POST", body: ... });
   if (!res.ok) { /* ad-hoc handling */ }

   // AFTER
   try {
     const data = await relayFetch<FooResponse>("/api/v1/foo", {
       method: "POST",
       headers: { "content-type": "application/json" },
       body: ...
     });
     // happy path
   } catch (e) {
     if (e instanceof RelayForbiddenError) {
       setInlineError(e.message);
       return;
     }
     // RelayUnauthorizedError already redirected; let it bubble.
     throw e;
   }
   ```

6. **Add an ESLint rule** (or extend the existing config) flagging raw `fetch("/api/...")` and `fetch(\`${RELAY_API_BASE}...`)`:

   ```js
   // web/.eslintrc.cjs (add to rules)
   "no-restricted-syntax": [
     "error",
     {
       selector: "CallExpression[callee.name='fetch'][arguments.0.value=/^\\/api\\//]",
       message: "Use relayFetch from @/lib/relay-api instead of raw fetch for /api/* calls."
     }
   ]
   ```

   This is a starting AST pattern; refine if the actual call shape differs (template literals need a separate selector).

### Part D — Tests (~2 hours)

7. **Unit tests in `web/lib/__tests__/relay-api.test.ts`** (mock `fetch` globally):
   - Returns `data` on 200.
   - Throws `RelayUnauthorizedError` and calls `performRelayLogout` on 401.
   - On 401, redirect URL contains `reason=expired&returnTo=<encoded current path>`.
   - On 401, when already on `/login`, does not redirect.
   - Throws `RelayForbiddenError` with code+message on 403.
   - Throws `RelayServerError` on 500.
   - Sends `credentials: "include"` always.

## Acceptance criteria

- [ ] `web/lib/relay-fetch-errors.ts` exists with three error classes.
- [ ] `relayFetch` handles 401/403/5xx per spec.
- [ ] `rg "fetch\\(\"/api/" web/` returns zero hits (excluding test fixtures).
- [ ] `rg "fetch\\(\\$\\{.*RELAY_API_BASE" web/` returns zero hits outside `relay-api.ts`.
- [ ] ESLint rule prevents new raw fetches; runs in `npm run lint`.
- [ ] All unit tests in `web/lib/__tests__/relay-api.test.ts` pass.
- [ ] Manual smoke: artificially expire the session (clear `relay_session` cookie via DevTools), trigger any authenticated UI action, verify the page lands on `/login?reason=expired&returnTo=<previous path>`.
- [ ] Manual smoke: trigger a 403 (e.g. by removing the user's tenant membership server-side, then accessing a tier-gated resource) — inline error renders, no logout.
- [ ] `npm run test` and `npm run build` pass in `web/`.

## Out of scope

- Retry logic, request deduping, optimistic updates.
- Showing the user a custom toast/banner for `?reason=expired` — that's a UI polish row.
- Auth recovery (auto-refresh) — sessions don't refresh; out of scope until they do.
- Server-to-server callers — they use `Authorization: Bearer` and don't go through `relayFetch`.

## Handoff

Delta Out:
- Count of raw `fetch` sites migrated.
- Any site that resisted migration (e.g. used `fetch` in a service worker) and the reason.
- Confirmation that the lint rule fires on a synthetic violation.

Next claimable: `GR-T1-4-auth-hooks-prompt.md` (depends on this row).
