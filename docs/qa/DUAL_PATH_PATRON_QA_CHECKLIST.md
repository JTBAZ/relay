# Dual-path patron login — QA checklist (for agents)

**Purpose:** Step-through verification that **email-first ↔ Patreon link** works end-to-end: session, OAuth callback routing, `/link` (session-first only), UI affordances, unlink, and the verified-email gate.

**Source spec:** [`Patron_Experience_Batting_Order.md`](../Patron_Experience_Batting_Order.md) §5.

**Universal policy:** Supporters **always** sign up and sign in to Relay **before** Patreon can be linked. There is no supported product path that attaches Patreon without a Relay `Account` to anchor identity, credentials, and entitlements.

**Policy update — 2026-04-20 (PE-A):** A Patreon login alone may **never** create a Relay account. The legacy anonymous `POST /api/v1/auth/patreon/patron/exchange` route is **hard-deprecated** (returns `403 RELAY_ACCOUNT_REQUIRED` by default; bypass only via `RELAY_PATREON_PATRON_ALLOW_LEGACY_EXCHANGE=1`). All patron Patreon links flow through `POST /api/v1/auth/patreon/patron/link` with an existing Relay session. The verified-email gate (`RELAY_PATREON_LINK_REQUIRE_VERIFIED_EMAIL=1`) is **on by default**.

**When blocked (OAuth secrets, Patreon sandbox, human account):** stop and record **BLOCKED — needs human** with reason; do not loop on failed Patreon redirects.

---

## 0. Preconditions

| # | Check | Pass |
|---|--------|------|
| 0.1 | Relay API running (`RELAY_DB_STORE_IDENTITY=1` in API env; Postgres reachable). | ☐ |
| 0.2 | Web app points at API: `NEXT_PUBLIC_RELAY_API_URL` matches API base (e.g. `http://127.0.0.1:8787`). | ☐ |
| 0.3 | Patreon OAuth app has redirect URI registered for **patron** flow (see `web/lib/patron-patron-redirect-uri` / env). | ☐ |
| 0.4 | Repo builds clean: root `npm run test`; `web/` `npm run lint` (or `npm run build` in `web/`). | ☐ |
| 0.5 | API env has `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set (same project as `DATABASE_URL`) so the verified-email gate can call `auth.admin.getUserById`. | ☐ |
| 0.6 | API env has `RELAY_PATREON_LINK_REQUIRE_VERIFIED_EMAIL=1` (default) and `RELAY_PATREON_PATRON_ALLOW_LEGACY_EXCHANGE` unset. | ☐ |

---

## 1. Legacy `/exchange` is closed (no anonymous Patreon-only accounts)

**Goal:** `POST /api/v1/auth/patreon/patron/exchange` rejects unauthenticated callers and the web `/patreon/patron/connect` page bounces anonymous visitors to `/login`.

| # | Step | Pass |
|---|------|------|
| 1.1 | Open **`/patreon/patron/connect`** in a **private/incognito** window. The page detects no `relay_session` and redirects to **`/login?role=supporter&returnTo=%2Fpatreon%2Fpatron%2Fconnect`**; no "Continue with Patreon" button is rendered. | ☐ |
| 1.2 | Hit `POST /api/v1/auth/patreon/patron/exchange` directly (curl / Postman). Response is **`403 RELAY_ACCOUNT_REQUIRED`** with header `Deprecation: true; successor=".../patron/link" ...` regardless of body. | ☐ |
| 1.3 | If `RELAY_PATREON_PATRON_ALLOW_LEGACY_EXCHANGE=1` is set (rollback only), validation + token exchange still work (legacy behavior). Otherwise mark **N/A**. | ☐ |

---

## 2. Session-first path (email / Supabase → then Patreon)

**Goal:** With an existing Relay session, callback uses **`POST /api/v1/auth/patreon/patron/link`**.

| # | Step | Pass |
|---|------|------|
| 2.1 | Sign in as supporter: **`/login`** (or product path) until **`relay_session`** / signed-in state is present (cookie or product indicator). | ☐ |
| 2.2 | From same browser session, open **`/patreon/patron/connect`** and complete Patreon OAuth. | ☐ |
| 2.3 | Callback succeeds; lands on **`/patron/feed`** (or configured redirect). | ☐ |
| 2.4 | (Optional) Network: second request path is **`POST .../patron/link`** with body `{ code, redirect_uri }` only (no duplicate identity fork). | ☐ |
| 2.5 | API response JSON includes **`linked_relay_creator_ids`** (array) and campaign hints **`owned_relay_creator_id`**, **`unmapped_patreon_campaign_ids`** when applicable (inspect response in Network). | ☐ |

---

## 3. “Connect your Campaign” UI

**Goal:** After session-first `/link`, modal can appear when server returns campaign fields; dismissible; Settings re-entry.

| # | Step | Pass |
|---|------|------|
| 3.1 | If test account triggers campaign fields: **modal** appears on feed after OAuth return; **Dismiss / Not now** closes it without breaking the shell. | ☐ |
| 3.2 | Open **Settings** (gear) → **Patreon creator connection** re-opens the same modal (uses last snapshot when available). | ☐ |
| 3.3 | If no campaign fields apply to this user: no modal **or** generic copy only — **not** a hard fail. | ☐ |

---

## 4. Disconnect Patreon (unlink)

**Goal:** `DELETE /api/v1/auth/patreon/patron/link` clears server-side patron OAuth storage; UI reflects disconnect intent. The route refuses to strip the account's last login method.

| # | Step | Pass |
|---|------|------|
| 4.1 | Settings → **Disconnect Patreon** → confirm dialog → completes **without** unhandled error. | ☐ |
| 4.2 | (Optional) Repeat link flow: reconnect still possible after disconnect. | ☐ |
| 4.3 | After disconnect, **Patreon creator connection** / campaign snapshot behavior is consistent (no stale "connected" claims if product clears local prompt storage). | ☐ |
| 4.4 | **Last-login-method guard:** for an `Account` with `password_hash IS NULL AND supabase_user_id IS NULL` (legacy Patreon-only row, if any), `DELETE` returns **`409 LAST_LOGIN_METHOD`**; no rows mutated. With the PE-A policy this should be unreachable for new accounts but the safety net remains. | ☐ |

---

## 5. Email verification gate (default ON)

`RELAY_PATREON_LINK_REQUIRE_VERIFIED_EMAIL=1` is the default after PE-A. Section requires `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` configured.

| # | Step | Pass |
|---|------|------|
| 5.1 | Supabase-linked account **without** confirmed email: `POST /link` returns **`403 EMAIL_NOT_VERIFIED`**. | ☐ |
| 5.2 | After confirming email in Supabase (or test user with confirmed email), `/link` **succeeds**. | ☐ |
| 5.3 | Account **without** `supabaseUserId` (native-only legacy): gate **does not** block (still 200 when other checks pass). | ☐ |
| 5.4 | If `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are missing while gate is on: `/link` returns **`503 NOT_AVAILABLE`** for any account that has `supabaseUserId`. **Operator fix**, not a code bug. | ☐ |

**If `RELAY_PATREON_LINK_REQUIRE_VERIFIED_EMAIL=0` (rollback):** mark section **N/A** and note env.

---

## 6. Policy / security spot checks

| # | Check | Pass |
|---|--------|------|
| 6.1 | No Patreon access/refresh tokens in page copy, URL query strings, or console logs in normal success path. | ☐ |
| 6.2 | Error surfaces from OAuth (`error`, `error_description`) are readable on callback page (not blank screen). | ☐ |

---

## 7. Report template (paste when done)

```
Date:
Environment (API URL, web URL, branch/commit):
RELAY_DB_STORE_IDENTITY:
RELAY_PATREON_LINK_REQUIRE_VERIFIED_EMAIL:

Sections passed: 0 / 1 / 2 / 3 / 4 / 5 / 6
Failures (route, expected, actual):
Blocked items (need human / secrets):
Notes:
```

---

## References (code)

| Area | Location |
|------|-----------|
| Patron callback routing | `web/app/patreon/patron/callback/page.tsx`, `web/lib/relay-api.ts` (`fetchPatronSessionIfPresent`, `deletePatronPatreonLink`) |
| Connect campaign prompt + modal | `web/lib/patron-connect-campaign-prompt.ts`, `web/components/patron-mock/relay/connect-campaign-modal.tsx`, `relay-app.tsx` |
| API routes | `src/server.ts` — `POST/DELETE /api/v1/auth/patreon/patron/link` |
| Email gate | `src/identity/patreon-link-email-gate.ts` |
