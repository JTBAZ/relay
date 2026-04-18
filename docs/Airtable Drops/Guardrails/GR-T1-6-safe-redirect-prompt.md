# GR-T1-6 — `resolvePostAuthPath` as the single safe-redirect helper

## Context

You are building **Tier 1 primitive #6** of the Auth Guardrails plan ([`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §3 Stage G). The helper [`web/lib/post-login-redirect.ts`](../../../web/lib/post-login-redirect.ts) already exists and correctly rejects `//evil.com` style paths. This row makes it **the only allowed entry point** for any redirect derived from user input — enforced by lint and by an updated PR review checklist.

This row is **independent** of all other Tier 1 work. It can be claimed at any time after T0-VERIFY ships green.

## Preconditions

- [ ] `GR-T0-VERIFY-prompt.md` shipped green.
- (No code preconditions — `resolvePostAuthPath` already exists.)

## Tier 0 invariants (always apply)

1. All redirects derived from user input pass through `resolvePostAuthPath`.
2. The helper accepts only same-origin paths (must start with `/`, must not start with `//`).
3. Server-side `Location:` redirects (e.g. `web/middleware.ts` from row 1.7) follow the same rule.

## Goal

After this row ships:

- A unit test suite locks `resolvePostAuthPath`'s behavior against open-redirect inputs.
- A custom ESLint rule (or `no-restricted-syntax` rule) flags any `router.replace`/`router.push`/`window.location.assign` whose argument incorporates `searchParams.get(...)` without going through the helper.
- The audit doc `docs/architecture/url-identity-contract.md` (from T0-4) is extended with the safe-redirect rule.
- Existing call sites are audited; any that compute a redirect from user input without the helper are migrated.

## Reference reading

1. [`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §3 Stage G.
2. `web/lib/post-login-redirect.ts` — the helper. **Do not change its signature** unless tests require it.
3. `docs/architecture/url-identity-contract.md` (from T0-4) — append the safe-redirect rule here.

## Implementation steps

### Part A — Lock down with tests (~1 hour)

1. **Create `web/lib/__tests__/post-login-redirect.test.ts`**:

   ```ts
   import { resolvePostAuthPath } from "../post-login-redirect";

   describe("resolvePostAuthPath", () => {
     it("returns / for null/undefined/empty/whitespace", () => {
       expect(resolvePostAuthPath(null)).toBe("/");
       expect(resolvePostAuthPath(undefined)).toBe("/");
       expect(resolvePostAuthPath("")).toBe("/");
       expect(resolvePostAuthPath("   ")).toBe("/");
     });

     it("rejects protocol-relative URLs (//evil.com)", () => {
       expect(resolvePostAuthPath("//evil.com/x")).toBe("/");
       expect(resolvePostAuthPath("//evil.com")).toBe("/");
     });

     it("rejects absolute URLs", () => {
       expect(resolvePostAuthPath("http://evil.com/x")).toBe("/");
       expect(resolvePostAuthPath("https://evil.com/x")).toBe("/");
     });

     it("accepts same-origin paths starting with single /", () => {
       expect(resolvePostAuthPath("/designer")).toBe("/designer");
       expect(resolvePostAuthPath("/patron/feed")).toBe("/patron/feed");
       expect(resolvePostAuthPath("/")).toBe("/");
     });

     it("preserves query strings on accepted paths", () => {
       expect(resolvePostAuthPath("/designer?tab=layouts")).toBe("/designer?tab=layouts");
     });

     it("rejects values that look like paths but contain protocol-relative segments", () => {
       // The current implementation checks startsWith — confirm behavior.
       // If the helper does NOT defend against `/foo/../bar` style, that's
       // acceptable (server-side route resolution handles it). Document the
       // boundary in the test.
       expect(resolvePostAuthPath("/foo/../bar")).toBe("/foo/../bar");
     });
   });
   ```

   If any test fails, the helper itself needs hardening — propose the minimal change and include it in this row.

### Part B — Audit existing call sites (~2 hours)

2. **Find every redirect call site that incorporates user input:**

   ```bash
   rg "router\\.(replace|push)\\(" web/
   rg "window\\.location\\.assign\\(" web/
   ```

3. **Classify each hit:**
   - ✅ **Hard-coded literal** — `router.replace("/")`, `router.replace("/login")`. Safe; ignore.
   - ✅ **Already wrapped** — destination derives from `resolvePostAuthPath(...)`. Safe; ignore.
   - ❌ **User-input passthrough** — destination derives from `searchParams.get(...)`, `URL` parsing, or any string that originated outside the app. **Must be migrated to use the helper.**
   - ⚠️ **API-derived** — destination came from a server response (e.g. `bootstrapStudioAfterSupabase`'s `boot.created ? "/onboarding?step=patreon" : ...`). Treat as trusted (server is authoritative); document the trust boundary in a comment.

4. **For each ❌, refactor:**

   ```tsx
   // BEFORE
   const dest = searchParams.get("returnTo") ?? "/";
   router.replace(dest);

   // AFTER
   import { resolvePostAuthPath } from "@/lib/post-login-redirect";
   router.replace(resolvePostAuthPath(searchParams.get("returnTo")));
   ```

### Part C — Lint enforcement (~2 hours)

5. **Add an ESLint rule** in `web/.eslintrc.cjs` (or wherever the web ESLint config lives):

   The simplest first-pass rule (catches the common pattern):

   ```js
   "no-restricted-syntax": [
     "error",
     {
       // router.replace(searchParams.get(...)) or router.push(searchParams.get(...))
       selector: "CallExpression[callee.property.name=/^(replace|push)$/] CallExpression[callee.property.name='get']",
       message: "Pass the result of searchParams.get() through resolvePostAuthPath() before redirecting."
     },
     {
       // window.location.assign(searchParams.get(...))
       selector: "CallExpression[callee.object.object.name='window'][callee.object.property.name='location'][callee.property.name='assign'] CallExpression[callee.property.name='get']",
       message: "Pass the result of searchParams.get() through resolvePostAuthPath() before assigning location."
     }
   ]
   ```

   This is a **starting** AST pattern. Refine based on actual call shapes in the codebase. The rule may produce false positives — annotate intentional safe usages with `// eslint-disable-next-line no-restricted-syntax -- value already validated by <reason>`.

6. **Verify the rule fires** on a synthetic violation:

   ```tsx
   // In a temporary test file:
   const x = searchParams.get("foo");
   router.replace(x); // expect lint error
   ```

   Then delete the test file.

### Part D — Documentation (~30 min)

7. **Append to `docs/architecture/url-identity-contract.md`** (from T0-4) a new section:

   ```markdown
   ## Safe-redirect rule (Tier 1.6)

   Any redirect destination that incorporates user-supplied input MUST pass through
   `resolvePostAuthPath` from `web/lib/post-login-redirect.ts`.

   - Hard-coded literal destinations: safe; no wrapper needed.
   - API-derived destinations (server response body): trusted; comment the trust boundary.
   - User-input destinations (`searchParams.get`, URL parsing, query strings): MUST wrap.

   Lint rule: see `web/.eslintrc.cjs` (no-restricted-syntax block on `router.replace`/`router.push`/`window.location.assign`).
   ```

## Acceptance criteria

- [ ] `web/lib/__tests__/post-login-redirect.test.ts` exists; all tests pass.
- [ ] Audit completed; every ❌ site refactored to use `resolvePostAuthPath`.
- [ ] ESLint rule fires on a synthetic violation; passes on the cleaned codebase.
- [ ] `docs/architecture/url-identity-contract.md` extended with the safe-redirect rule.
- [ ] `npm run lint` passes in `web/`.
- [ ] `npm run test` and `npm run build` pass in `web/`.
- [ ] Manual: navigate to `/login?returnTo=//evil.com/foo`, sign in successfully — lands on `/`, not on `evil.com`.

## Out of scope

- Server-side `Location:` header construction in `src/` — rare and out of band; if the audit finds any in the API server, note them in Delta Out for a separate row.
- Refactoring API-derived destinations to also pass through the helper (defense-in-depth) — defer; the API is authoritative.
- Cross-origin redirect support (e.g. for OAuth) — those are separate flows with their own validation (`patron-oauth-state.ts`); not affected by this rule.

## Handoff

Delta Out:
- Count of ❌ sites found and migrated.
- ESLint rule snippet (in case it needs tuning later).
- Confirmation that the synthetic violation was caught.

Next claimable: nothing chained off this row directly. T1-VERIFY can run once 1.1–1.5, 1.7, 1.8 are also merged.
