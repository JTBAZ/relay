# GR-T1-1 — `requireAccount` middleware on every `/api/v1/*` route

## Context

You are building **Tier 1 primitive #1** of the Auth Guardrails plan ([`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §3 Stage B). Today, request handlers in `src/server.ts` resolve auth ad-hoc — some read `Authorization: Bearer`, some read cookies, some don't check at all. This row creates a single middleware that:

1. Resolves the request to an `Account` (cookie first, then Bearer).
2. Attaches `{ accountId, supabaseUserId, primaryRelayCreatorId, hasSupporterMemberships }` to the request.
3. **Sets the RLS context** via `setSupabaseRlsContext` (from row T0-3) for the duration of the handler.
4. Returns `401` with a structured envelope when no valid Account is found.
5. Provides a stricter variant `requireAccountWithRole(role)` that returns `403` when the Account lacks the requested capability.

After this row, **every** `/api/v1/*` route either uses the middleware or has a `// PUBLIC: <reason>` comment.

## Preconditions

- [ ] `GR-T0-1-cookie-mirror-prompt.md` shipped (cookie reader available in `src/identity/session-cookie.ts`).
- [ ] `GR-T0-3-rls-context-prompt.md` shipped (`setSupabaseRlsContext` exists).
- [ ] `GR-T0-VERIFY-prompt.md` shipped green.

## Tier 0 invariants (always apply)

1. No JS reads `relay_session`. Cookie reading happens server-side only.
2. No handler grants permission based on `relay_active_role`. The middleware **does not read** that cookie.
3. RLS is the source of truth. The middleware sets the context; RLS does the actual row-filtering.
4. All `/api/v1/*` routes use this middleware unless explicitly public.

## Goal

A single helper `requireAccount(req, res)` (and its role variant) is the canonical auth resolver for every `/api/v1/*` route. Every existing route is migrated to use it. The migration is mechanical: import the helper, call it at the top, swap any ad-hoc auth code for the resulting `AccountContext`.

## Reference reading

1. [`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §3 Stage B.
2. [`docs/architecture/multi-tenant-cloud-runtime.md`](../../architecture/multi-tenant-cloud-runtime.md) §"Identity and sessions (Bearer tokens) — MIG-13" — confirms the two Bearer schemes and the rule against confusing them.
3. `src/identity/session-cookie.ts` (from T0-1) — for `readSessionCookie`.
4. `src/lib/supabase-rls-context.ts` (from T0-3) — for `setSupabaseRlsContext`.
5. `src/identity/` — locate the existing opaque-session resolver (likely `identityService.resolveSession` per the runtime arch doc) and the Supabase JWT validator (`getSupabaseUserFromAccessToken`).
6. `src/server.ts` — enumerate every `/api/v1/*` route. Note which currently use which auth scheme.

## Implementation steps

### Part A — Account context shape (~1 hour)

1. **Create `src/identity/account-context.ts`**:

   ```ts
   export type AccountContext = {
     /** Internal stable id (CUID today; see ADR-001). Use as RLS key. */
     accountId: string;
     /** Supabase Auth UUID, when linked. */
     supabaseUserId: string | null;
     /** Creator workspace id when this account owns one. NULL = no creator side. */
     primaryRelayCreatorId: string | null;
     /** True when this account has at least one patron TenantMembership. */
     hasSupporterMemberships: boolean;
   };

   export function canActAsCreator(ctx: AccountContext): boolean {
     return Boolean(ctx.primaryRelayCreatorId);
   }

   export function canActAsSupporterFor(
     _ctx: AccountContext,
     _tenantId: string
   ): boolean {
     // Supporter capability is per-tenant — actual entitlement is enforced in RLS.
     // This helper exists for fast-fail handlers; it returns true if the account
     // has any patron membership. Real authz is RLS.
     return _ctx.hasSupporterMemberships;
   }
   ```

2. **Create `src/identity/relay-auth-error.ts`**:

   ```ts
   export class RelayAuthError extends Error {
     constructor(
       public readonly status: 401 | 403,
       public readonly code: string,
       message: string
     ) {
       super(message);
     }
     toEnvelope(): { error: { code: string; message: string } } {
       return { error: { code: this.code, message: this.message } };
     }
   }
   ```

### Part B — The middleware (~3 hours)

3. **Create `src/identity/require-account.ts`**:

   ```ts
   import type { Request, Response } from "express"; // adjust to actual server framework
   import { readSessionCookie } from "./session-cookie";
   import { setSupabaseRlsContext } from "../lib/supabase-rls-context";
   import { prisma } from "../prisma-client"; // adjust import path
   import { AccountContext } from "./account-context";
   import { RelayAuthError } from "./relay-auth-error";
   // existing imports:
   import { identityService } from "./identity-service"; // adjust to actual location

   /**
    * Tier 1.1 — resolve Account or throw 401.
    *
    * Resolution order:
    *   1. relay_session cookie (preferred for browser callers)
    *   2. Authorization: Bearer <opaque token> (server-to-server, legacy clients)
    *
    * Side effect: sets the RLS context for this request transaction.
    * Callers MUST run their DB work inside the same Prisma transaction
    * (or use the supplied client below) so the context applies.
    */
   export async function requireAccount(req: Request): Promise<AccountContext> {
     const token = readSessionCookie(req) ?? extractBearer(req);
     if (!token) {
       throw new RelayAuthError(401, "no_session", "Authentication required.");
     }
     const session = await identityService.resolveSession(token).catch(() => null);
     if (!session) {
       throw new RelayAuthError(401, "invalid_session", "Session expired or invalid.");
     }

     const account = await prisma.account.findUnique({
       where: { id: session.accountId },
       select: {
         id: true,
         supabaseUserId: true,
         primaryRelayCreatorId: true,
         _count: { select: { tenantMemberships: { where: { role: "patron" } } } }
       }
     });
     if (!account) {
       throw new RelayAuthError(401, "account_missing", "Session points at a missing account.");
     }

     await setSupabaseRlsContext(prisma, account.id);

     return {
       accountId: account.id,
       supabaseUserId: account.supabaseUserId,
       primaryRelayCreatorId: account.primaryRelayCreatorId,
       hasSupporterMemberships: (account._count?.tenantMemberships ?? 0) > 0
     };
   }

   export async function requireAccountWithRole(
     req: Request,
     role: "creator" | "supporter"
   ): Promise<AccountContext> {
     const ctx = await requireAccount(req);
     if (role === "creator" && !ctx.primaryRelayCreatorId) {
       throw new RelayAuthError(403, "no_creator_workspace",
         "This action requires a creator workspace.");
     }
     if (role === "supporter" && !ctx.hasSupporterMemberships) {
       throw new RelayAuthError(403, "no_supporter_memberships",
         "This action requires at least one patron membership.");
     }
     return ctx;
   }

   function extractBearer(req: Request): string | null {
     const h = req.headers["authorization"];
     if (typeof h !== "string") return null;
     const m = h.match(/^Bearer\s+(.+)$/i);
     return m ? m[1].trim() : null;
   }
   ```

4. **Add an error-to-response helper** in the same file or in `src/server.ts` glue:

   ```ts
   export function sendRelayAuthError(res: Response, err: unknown): boolean {
     if (err instanceof RelayAuthError) {
       res.status(err.status).json(err.toEnvelope());
       return true;
     }
     return false;
   }
   ```

### Part C — Migrate every `/api/v1/*` route (~4 hours)

5. **Enumerate routes.** Run `rg "app\\.(get|post|put|patch|delete)\\(\"/api/v1/" src/` and produce a checklist of routes.

6. **For each route**, do one of:
   - **Authenticated route:** Replace ad-hoc auth code with:
     ```ts
     app.post("/api/v1/foo", async (req, res) => {
       try {
         const ctx = await requireAccount(req);
         // ... handler logic using ctx.accountId etc.
       } catch (e) {
         if (sendRelayAuthError(res, e)) return;
         throw e;
       }
     });
     ```
   - **Role-scoped route:** Use `requireAccountWithRole(req, "creator")` or `"supporter"`.
   - **Public route:** Add a `// PUBLIC: <reason>` comment line directly above the route definition. Acceptable reasons: signup/login endpoints, health/ping, OAuth-state issuance for unauth users, public profile reads.

7. **Special-case the auth endpoints themselves:**
   - `POST /api/v1/auth/login`, `signup`, `supabase/sync`, `supabase/relay-session`, `identity/register`, `identity/login` — these are `// PUBLIC` (they don't have a session yet).
   - `POST /api/v1/identity/logout` — uses `requireAccount` (you must be signed in to sign out cleanly; tolerate `401` as a no-op).

8. **Add the `tenantMemberships` relation to the Account select** (already in step 3 above) — verify the relation name in `prisma/schema.prisma` and adjust if it's named differently.

### Part D — Tests (~2 hours)

9. **Unit tests in `tests/identity/require-account.test.ts`**:
   - Returns 401 envelope when no cookie and no Bearer.
   - Returns 401 envelope when token is malformed.
   - Returns 401 envelope when token resolves to no Account.
   - Returns AccountContext with correct flags for a creator-only account.
   - Returns AccountContext with correct flags for a supporter-only account.
   - Returns AccountContext with both flags for a coin-flipper account.
   - `requireAccountWithRole(req, "creator")` returns 403 on a supporter-only account.
   - `requireAccountWithRole(req, "supporter")` returns 403 on a creator-only account that has no patron memberships.

10. **Smoke test in `tests/server/auth-coverage.test.ts`** — for every `/api/v1/*` route in the enumerated list, assert:
    - Calling without a cookie returns 401, **OR**
    - The route file contains a `// PUBLIC:` comment.

## Acceptance criteria

- [ ] `src/identity/require-account.ts`, `account-context.ts`, `relay-auth-error.ts` exist with the exports above.
- [ ] Every `/api/v1/*` route either calls `requireAccount`/`requireAccountWithRole` or has a `// PUBLIC: <reason>` comment. Verified by the smoke test in step 10.
- [ ] All unit tests in `tests/identity/require-account.test.ts` pass.
- [ ] The route-coverage smoke test passes.
- [ ] `npm run test` passes at repo root.
- [ ] `npm run build` passes at repo root.
- [ ] Manual smoke: sign in, hit an authenticated endpoint, verify it works; clear the `relay_session` cookie, hit the same endpoint, verify 401 envelope.
- [ ] Manual smoke: a creator-only account hitting a supporter-only endpoint (if any exist) gets 403.

## Out of scope

- Adding the actual RLS policies — that is row 1.2.
- Removing the `Authorization` header path entirely — kept for non-browser callers.
- Tenant-level membership precision (e.g. "supporter of Tenant X specifically") — RLS handles that in row 1.2.
- Rate limiting — Tier 4 work.

## Handoff

Delta Out:
- Count of `/api/v1/*` routes migrated and count marked `// PUBLIC`.
- Any route whose authz scheme had to change (e.g. was Supabase JWT, now opaque-only) — name them and the reason.
- Confirmation that `setSupabaseRlsContext` is called in every authenticated handler.

Next claimable: `GR-T1-2-rls-policies-prompt.md`, `GR-T1-3-fetch-401-prompt.md`. (Both depend on this row.)
