# Supporter / creator signup flow — incremental fix plan

**Status:** Planning reference (not yet implemented).  
**Companion:** [`docs/AUTH_GUARDRAILS_TIER_1.md`](../AUTH_GUARDRAILS_TIER_1.md) (cookie perimeter, `relay_active_role` = UI only, authz on API/DB).

## Goals

1. **Supporters** who verify email land on the **supporter** path (sync + session, **no** creator workspace unless they explicitly choose creator/studio), then **Connect Patreon** → **`/patron/feed`** when ready.
2. **Creators** who verify email keep today’s **studio** bootstrap (`POST /api/v1/creator/workspace`) and sensible defaults (`/` or `/onboarding`).
3. **One canonical browser origin** in dev (`localhost` *or* `127.0.0.1`, not both ad hoc) so Supabase redirects, `relay_session`, and `relayFetch` behave consistently.
4. **Patreon patron callback** reliably navigates to **`/patron/feed`** after success (no indefinite “waiting” due to Strict Mode / cancelled async).

## Non-goals (later product / Tier 2)

- Full **Tier 2** “role flip” middleware and per-route authz at the edge (see AUTH_GUARDRAILS §5).
- **Confirm password** field, full multi-step onboarding wizard, and marketing copy — track separately.
- **Server trust** of `relay_active_role` for permissions — **never**; defaults may use it only as a **UX hint** after server-verified facts.

---

## Root causes (reference)

| Symptom | Likely cause | Key files |
|--------|----------------|-----------|
| Verified email opens wrong host / broken session | Supabase allowlist vs `emailRedirectTo` vs where user runs Next | [`web/app/components/auth/SupporterSignInPanel.tsx`](../../web/app/components/auth/SupporterSignInPanel.tsx), Supabase Dashboard → URL configuration |
| Supporter ends up on **Creator Library** (`/`) | **`/auth/confirm`** always calls **`bootstrapStudioAfterSupabase`** (provisions workspace + `localStorage` creator id) and defaults to **`/`** | [`web/app/auth/confirm/page.tsx`](../../web/app/auth/confirm/page.tsx), [`web/lib/relay-auth-bootstrap.ts`](../../web/lib/relay-auth-bootstrap.ts), [`web/lib/post-login-redirect.ts`](../../web/lib/post-login-redirect.ts) |
| Signed-in visit to `/login` sends wrong home | Middleware `safeReturnTo` default **`/`** | [`web/middleware.ts`](../../web/middleware.ts) |
| Patreon connect “hangs” after success | **`router.replace`** skipped if effect cleanup sets `cancelled`; or unfinished `relayFetch`; or origin/cookie | [`web/app/patreon/patron/callback/page.tsx`](../../web/app/patreon/patron/callback/page.tsx) |

---

## Phase 0 — Dev origin invariant (docs + env, minimal code)

**Outcome:** One documented dev URL; fewer cookie/SameSite surprises.

- [x] Pick **one** default for local Next — **`http://127.0.0.1:3000`** (aligned with `NEXT_PUBLIC_RELAY_API_URL` using `127.0.0.1`). Documented in [`docs/qa/DEV_LOCAL_ORIGIN.md`](DEV_LOCAL_ORIGIN.md); operators align Supabase **Site URL** + **Redirect URLs** and Patreon dev URIs to the same host.
- [x] Subsection in [`web/.env.example`](../../web/.env.example) (“Canonical browser origin”); optional `NEXT_PUBLIC_SITE_URL` line; [`web/README.md`](../../web/README.md) and [`web/app/auth/confirm/page.tsx`](../../web/app/auth/confirm/page.tsx) comments updated.

**No middleware change required** for Phase 0.

**Production:** `https://relayapp.me` remains the public app and Supabase **Site URL**. Phase 0 does **not** require repointing **`DATABASE_URL`** or **`SUPABASE_URL`** / **`NEXT_PUBLIC_SUPABASE_URL`**—keep whatever hosts you already use for Postgres and the Supabase API. Phase 0 only adds a **second** allowed **browser** origin for local tabs—see [`DEV_LOCAL_ORIGIN.md`](DEV_LOCAL_ORIGIN.md) § “Production web service”.

---

## Phase 1 — Email confirm: supporter vs studio bootstrap

**Outcome:** `/auth/confirm` runs **`bootstrapSupporterAfterSupabase`** when the flow is supporter-first; **`bootstrapStudioAfterSupabase`** only for studio/creator.

**Approach (choose one in implementation; both are incremental):**

- **A (recommended):** Add **`intent=supporter`** (or `flow=supporter`) to `emailRedirectTo` from [`SupporterSignInPanel`](../../web/app/components/auth/SupporterSignInPanel.tsx) (e.g. `${origin}/auth/confirm?intent=supporter`). Studio sign-up paths keep `/auth/confirm` without flag or `intent=creator`.
- **B:** Separate path `/auth/confirm/supporter` (duplicate page or re-export) so Supabase allowlist entries are explicit.

**Confirm page behavior:**

- Parse `intent` (or path).
- **Supporter:** `bootstrapSupporterAfterSupabase` → `emitStudioSessionUpdate` → `router.replace('/patreon/patron/connect')` (or `/patron/feed` if API reports Patreon already linked — optional follow-up).
- **Creator/default:** keep current `bootstrapStudioAfterSupabase` → existing onboarding vs `/` logic.

**Supabase allowlist:** add any new query-string variant if the dashboard treats URLs literally.

**Tests:** extend or add web/root tests for confirm URL parsing + mocked bootstrap (if test harness exists); at minimum manual QA checklist in §Verification.

---

## Phase 2 — Post-login defaults & middleware UX

**Outcome:** Signed-in users hitting **`/login`** without `returnTo` don’t silently default to **`/`** when they’re **supporter-first**.

**Incremental options (in order of invasiveness):**

1. **Low:** Only change **supporter** flows to always pass **`returnTo`** (e.g. `/patreon/patron/connect`) from links to `/login`.
2. **Medium:** Extend [`resolvePostAuthPath`](../../web/lib/post-login-redirect.ts) (and **duplicate** `safeReturnTo` in [`middleware.ts`](../../web/middleware.ts) per file header) with a **documented** default when `returnTo` empty:
   - e.g. read **non-authz** hint cookie `relay_active_role=supporter` → default `/patreon/patron/connect` or `/patron/feed`.
   - **Must** stay consistent between middleware and client helpers.
3. **Higher (Tier 2):** Server “home” resolution (`GET /api/v1/me/home` or extend `/me/session`) — **authz-safe** default path from DB; edge/client only redirect there.

**Guard rail:** never use `relay_active_role` alone to **grant** API access; only to choose **landing** after auth entry.

---

## Phase 3 — Patreon patron callback: reliable redirect

**Outcome:** After successful `POST /api/v1/auth/patreon/patron/link`, user always reaches **`/patron/feed`** or a clear error state.

- [ ] **Strict Mode:** Refactor [`CallbackInner` effect](../../web/app/patreon/patron/callback/page.tsx) so navigation runs even when React double-invokes (e.g. `void linkThenRedirect()` without `cancelled` skipping `router.replace` on success, or use a ref “completed” flag).
- [ ] **Timeout / UX:** If link hangs beyond N seconds, show retry + link to `/patreon/patron/connect`.
- [ ] **Logging:** Optional `console.info` / client metric for “link success → navigate” in dev.

---

## Phase 4 — Product follow-ups (track separately)

- Confirm password; silo’d **Become a Supporter** vs **Creator** copy and steps.
- Rich onboarding: Registration → email confirmed → Patreon → feed (may reuse [`Patron_Experience_Batting_Order.md`](../Patron_Experience_Batting_Order.md)).

---

## Verification checklist (after each phase)

- [ ] New supporter: sign-up → email link → **no** auto `POST /creator/workspace` unless creator path chosen.
- [ ] After confirm: lands on **`/patreon/patron/connect`** (or agreed default), not `/`.
- [ ] Patreon connect completes → **`/patron/feed`** within one navigation; no stuck spinner.
- [ ] Same flow on **single** dev origin; repeat with other origin **fails fast** with documented setup note.
- [ ] Existing creator: email confirm / studio path still provisions workspace and reaches `/` or onboarding as today.

---

## File index (implementation touch list)

| Area | Files |
|------|--------|
| Email link target | [`web/app/components/auth/SupporterSignInPanel.tsx`](../../web/app/components/auth/SupporterSignInPanel.tsx); studio panel if it sets `emailRedirectTo` |
| Confirm handler | [`web/app/auth/confirm/page.tsx`](../../web/app/auth/confirm/page.tsx) |
| Bootstrap | [`web/lib/relay-auth-bootstrap.ts`](../../web/lib/relay-auth-bootstrap.ts) |
| Post-auth paths | [`web/lib/post-login-redirect.ts`](../../web/lib/post-login-redirect.ts), [`web/middleware.ts`](../../web/middleware.ts) |
| Patreon callback | [`web/app/patreon/patron/callback/page.tsx`](../../web/app/patreon/patron/callback/page.tsx) |
| Optional role hint | [`web/lib/active-role.ts`](../../web/lib/active-role.ts), [`src/identity/set-active-role-cookie-for-session.ts`](../../src/identity/set-active-role-cookie-for-session.ts) (if setting default on bootstrap) |

---

## Revision log

| Date | Note |
|------|------|
| 2026-04-21 | Initial plan from signup UX review and codebase trace. |
| 2026-04-21 | Phase 0 implemented: `DEV_LOCAL_ORIGIN.md`, `web/.env.example` subsection, README + auth/confirm JSDoc. |
| 2026-04-21 | Clarified: production stays on `relayapp.me`; DB/Supabase project URLs unchanged; dev origin is additive in redirect allowlists. |
