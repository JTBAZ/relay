# GR-T0-2 — Coin model verification + `relay_active_role` UI cookie

## Context

You are building **Tier 0 primitive #2** of the Auth Guardrails plan ([`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §1.1, §1.2). Relay's product intent is the **coin model**: one `Account` is a single coin with two sides — Creator (heads) and Supporter (tails). Either side may be empty. A user can flip the UI lens but their identity, comments, likes, and entitlements stay unified across both sides.

This row has two halves:

1. **Audit:** Confirm the Option B schema already encodes the coin model and document the wiring. **No DB migration ships here unless an audit failure is found.**
2. **Build:** Add a `relay_active_role` cookie that stores the **UI lens** (`creator` | `supporter`). This cookie is **never** read by server handlers for permission decisions — only for SSR shell selection.

## Preconditions

- **Required:** `GR-T0-1-cookie-mirror-prompt.md` is merged. The `setSessionCookie` helper in `src/identity/session-cookie.ts` exists.
- Verify by: `git log --oneline | rg "T0-1"` and confirm `src/identity/session-cookie.ts` exists.

## Tier 0 invariants (always apply)

1. **`relay_active_role` is a UI hint, never an authz claim.** Server handlers must not branch permissions on it.
2. Authz is always derived from DB rows: `Account.primaryRelayCreatorId` (creator capability) and `TenantMembership` rows (supporter capability per tenant).
3. Author-identified rows (comments, likes, follows, favorites) key on **`Account.id`**, never on the active role.
4. The cookie is **not** `HttpOnly` because the client toggle UI needs to read it. It **is** `Secure` and `SameSite=Lax`.

## Goal

After this row ships:

- A short audit doc confirms the schema supports the coin model and explains exactly how each side is provisioned.
- Server sets `relay_active_role` on every successful auth response, with a default derived from the Account's capabilities.
- Web reads `relay_active_role` to decide which app shell (creator chrome vs. supporter chrome) to render.
- A single `setActiveRoleCookie` helper is the only writer; UI toggle work in Tier 2 (row 2.9) will call it.

## Reference reading

1. [`docs/architecture/multi-tenant-option-b.md`](../../architecture/multi-tenant-option-b.md) — Option B identity model.
2. [`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §1.1 (coherence), §1.2 (invariants).
3. `prisma/schema.prisma` — read the `Account`, `Tenant`, `TenantMembership`, `User`, `CreatorProfile` models. Confirm:
   - `Account.primaryRelayCreatorId` exists and is nullable.
   - `TenantMembership` has `(account_id, tenant_id, role, tier_ids[])`.
   - Comments / likes / follows tables (if present) reference `Account.id`, not `User.id` and not a role enum.
4. `src/identity/session-cookie.ts` (from row T0-1).
5. `web/app/components/ConditionalAppNav.tsx` — the existing shell selector. Active role will eventually feed into this.

## Implementation steps

### Part A — Schema audit (~1 hour, read-only)

1. Open `prisma/schema.prisma` and verify each of the following. For each ✓, note the model and field. For each ✗, **stop and open a separate ledger row** before continuing — do not migrate in this prompt.

   - [ ] `Account.primaryRelayCreatorId` is nullable.
   - [ ] `TenantMembership(account_id, tenant_id, role)` uniqueness allows one row per (account, tenant).
   - [ ] At least one author-identified table (e.g. `Comment`, `Like`, `Favorite`, `Follow` if present) keys on `Account.id`. If those tables don't exist yet, note that in the audit doc — they'll inherit the rule when added.
   - [ ] No table has a `role` discriminator that gates the same Account from both sides simultaneously.

2. Write a short audit summary at `docs/architecture/coin-model-audit.md` (~40 lines). Sections:
   - "Schema confirmation" — bulleted findings from step 1.
   - "Provisioning paths":
     - Creator side: first call to `POST /api/v1/creator/workspace` (idempotent — see `bootstrapStudioAfterSupabase`).
     - Supporter side: `TenantMembership` insert via patron Patreon link, manual support add, or signup against `RELAY_PLATFORM_CREATOR_ID`.
   - "Unified identity rule" — restate Tier 0 invariant #3.
   - Link back to `multi-tenant-option-b.md` and this prompt file.

### Part B — Backend cookie infrastructure (~3 hours)

3. **Extend `src/identity/session-cookie.ts`** with two new exports:
   - `setActiveRoleCookie(res, role: "creator" | "supporter")` — sets `relay_active_role` with attributes: `Path=/; Secure; SameSite=Lax; Max-Age=<same as session>`. **No `HttpOnly`.** Domain from `RELAY_COOKIE_DOMAIN` like the session cookie.
   - `clearActiveRoleCookie(res)` — `Max-Age=0`.

4. **Add a default-role resolver** in a new file `src/identity/active-role-default.ts`:
   ```ts
   export type ActiveRole = "creator" | "supporter";

   export function defaultActiveRoleForAccount(account: {
     primaryRelayCreatorId: string | null;
     hasSupporterMemberships: boolean;
   }): ActiveRole {
     if (account.primaryRelayCreatorId) return "creator";
     if (account.hasSupporterMemberships) return "supporter";
     return "supporter"; // brand-new accounts default to supporter; onboarding flips it
   }
   ```

5. **Wire into the four auth endpoints** (same four touched in T0-1):
   - After `setSessionCookie`, look up the Account's `primaryRelayCreatorId` and whether it has any patron `TenantMembership` rows (one query, e.g. `prisma.tenantMembership.count({ where: { accountId } })`).
   - Call `setActiveRoleCookie(res, defaultActiveRoleForAccount({...}))`.
   - **Do not** branch any permissions on the resulting role. The cookie is informational.

6. **Wire `clearActiveRoleCookie` into logout** (`POST /api/v1/identity/logout`).

7. **Audit existing handlers for misuse.** Run `rg "relay_active_role" src/`. The result should be: only the helpers from steps 3–4 reference it, plus the four auth endpoints from step 5. **Any other reference is a violation of Tier 0 invariant #1 — fix it or open a row.**

### Part C — Web read path (~2 hours)

8. **Create `web/lib/active-role.ts`**:
   ```ts
   export type ActiveRole = "creator" | "supporter";

   export function readActiveRoleFromDocumentCookie(): ActiveRole | null {
     if (typeof document === "undefined") return null;
     const m = document.cookie.match(/(?:^|;\s*)relay_active_role=(creator|supporter)/);
     return m ? (m[1] as ActiveRole) : null;
   }

   export function readActiveRoleFromHeaderCookie(cookieHeader: string | null): ActiveRole | null {
     if (!cookieHeader) return null;
     const m = cookieHeader.match(/(?:^|;\s*)relay_active_role=(creator|supporter)/);
     return m ? (m[1] as ActiveRole) : null;
   }
   ```

9. **Extend `studio-session-context.tsx`** to expose `activeRole: ActiveRole | null` alongside `hasRelaySession`. Read it in the same `useEffect` that reads `relay_signed_in`. Re-read on the same `relay-studio-session` event.

10. **Do not** change `ConditionalAppNav.tsx` or any other rendering yet — wiring the toggle into UI is row 2.9 (Tier 2). This row only **publishes** the value through the context provider so 2.9 has something to consume.

## Acceptance criteria

- [ ] `docs/architecture/coin-model-audit.md` exists with all four schema checks confirmed.
- [ ] After fresh sign-in, `document.cookie` includes `relay_active_role=creator` (if the Account has a `primaryRelayCreatorId`) **or** `relay_active_role=supporter` otherwise.
- [ ] DevTools → Application → Cookies shows `relay_active_role` with HttpOnly **unchecked**, Secure checked, SameSite Lax.
- [ ] `useStudioSession()` returns `activeRole: "creator" | "supporter"` after sign-in; `null` before sign-in.
- [ ] Logout removes `relay_active_role` cookie.
- [ ] `rg "relay_active_role" src/` returns only the helpers in `src/identity/active-role-default.ts`, `src/identity/session-cookie.ts`, and the four auth endpoints. Zero references in any handler that makes a permission decision.
- [ ] All `npm run test` and `npm run build` suites pass at repo root and in `web/`.

## Out of scope

- The visible UI toggle (coin-flip control) — Tier 2 row 2.9.
- Re-rendering `ConditionalAppNav` based on active role — Tier 2 row 2.9.
- Persisting active-role preference in the DB — out of scope; cookie is sufficient.
- Anything that reads `relay_active_role` to grant permission — explicitly forbidden by Tier 0 invariant #1.

## Handoff

Delta Out should include:
- Audit findings (any ✗ checks must be opened as separate rows).
- The new cookie name and its lifetime.
- Confirmation that no permission decision branches on the cookie.

Next claimable: `GR-T0-VERIFY-prompt.md` once 0.3 and 0.4 are also merged.
