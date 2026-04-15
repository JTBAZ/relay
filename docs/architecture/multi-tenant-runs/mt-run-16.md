# Multi-tenant run 16 — Next.js onboarding + session-scoped `relay_creator_id` (MT-036)

| | |
|---|---|
| **Step IDs** | `MT-036` |
| **Sort order** | 58 |
| **Precondition** | **MT-033**–**MT-035** available. Optional: Supabase client env in `web/.env.example`. |

## Full prompt (paste into agent)

```text
You are a coding agent on Rescue / Relay. Implement **MT-036** only: **front-end onboarding** and **stop using build-time `NEXT_PUBLIC_RELAY_CREATOR_ID`** for authenticated studio routes.

### Requirements

1. **Onboarding UX:** Minimal flow: sign up / sign in (Supabase or email per product choice) → call **supabase/sync** + **relay-session** (MT-033) if using Supabase → call **creator/workspace** (MT-032) → store **`relay_creator_id`** in client state (React context + `localStorage` or secure cookie pattern consistent with existing app).

2. **Library / Designer / Patreon menu:** `GalleryView`, `DesignerView`, and `PatreonSyncMenu` must receive **`creatorId` from session context** when logged in; **`NEXT_PUBLIC_RELAY_CREATOR_ID`** is **fallback only** for unauthenticated or legacy dev.

3. **Guard routes:** Redirect unauthenticated users to onboarding/auth hub (`web/app/components/auth/auth-hub.tsx` or new route).

4. **Env docs:** Update `web/.env.example` comments — production must not rely on wrong `NEXT_PUBLIC_RELAY_CREATOR_ID` for real artists.

### Out of scope

- Full design-system polish; focus on correct data flow.

### Verify

- `npm run build` in `web/`; smoke: logged-in user sees consistent creator id across Library calls.

### Airtable

Complete **MT-036**; **Next run prompt** → `mt-run-17.md`.
```
