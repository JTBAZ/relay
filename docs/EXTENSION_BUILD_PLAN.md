# Relay Browser Extension — Build Plan

**Status:** Draft for execution. Approved decisions inline.
**Owners:** Backend identity (`src/`), Web shell (`web/`), Database (`prisma/`), new `extension/` workspace.
**Companion docs:**
- Auth guardrails — [`AUTH_GUARDRAILS_TIER_1.md`](AUTH_GUARDRAILS_TIER_1.md)
- Cookie legal posture — [`cookie-auth-legal-rationale.md`](cookie-auth-legal-rationale.md)
- Verb hygiene — [`qa/HTTP_VERB_HYGIENE.md`](qa/HTTP_VERB_HYGIENE.md)

> **For executing agents:** This doc is split into phases. Each phase has a single, testable goal, a fixed file list, and acceptance criteria you can verify with `npm run test` / `npm run build` / `rg`. Do **not** start a phase before its dependencies pass acceptance. Lines beginning with **HUMAN ACTION REQUIRED** are blockers that only the operator can perform (Patreon dev portal, Chrome Web Store, AMO, etc.) — stop and surface them; do not attempt to automate.

---

## 0. North-star summary

The Relay browser extension is a **frictionless cookie capture** for the artist's own Patreon `session_id`. It exists because Patreon's OAuth API does not return image/attachment URLs (see `cookie-auth-legal-rationale.md`); today users paste the cookie via DevTools at `web/app/patreon/cookie/page.tsx`. The extension replaces that paste step with a one-click flow and auto-refreshes the cookie when the user logs into Patreon again.

### Locked product decisions (source: user, this conversation)

| # | Decision | Value |
|---|---|---|
| P-1 | Coexistence | Extension coexists with the manual paste page; manual stays as fallback. Paste page gains a prominent "Install the Relay extension" CTA. |
| P-2 | Popup never displays the cookie value | Show only "Connected as ✓ {studio name}" + last-sync timestamp + revoke button. |
| P-3 | Auto-sync on cookie change | Yes. After the first manual consent, every subsequent Patreon login is captured automatically with no user click. |
| P-4 | Multi-account | One Patreon account per Relay user for v1. Multi-Patreon is a Relay-side schema concern, deferred. |
| P-5 | Telemetry | None. No Sentry, no analytics, no error reporting. |
| P-6 | Token TTL | Sliding 30-day window. Each successful API call from the extension extends `expires_at` by 30 days. Idle grants expire. |
| P-7 | Browser scope | Chrome + Edge + Firefox at v1. Chrome MV3 is the source of truth; Firefox port via `webextension-polyfill`. |
| P-8 | Connected-extensions UI | Web app exposes `/settings/connected-extensions` for grant inspection + revoke at v1. |
| P-9 | Self-hosting | Hosted-only. Production API origin hard-coded as `https://relayapp.me`. No "API URL" field in the extension. |
| P-10 | Logout behavior | Web logout does **not** revoke extension grants. Grants are independent; revoked only via the connected-extensions page or extension uninstall. |
| P-11 | Rate limiting | `express-rate-limit` (in-memory) for v1. Documented Redis upgrade path for multi-node. |
| P-12 | Domain finality | Production: `https://relayapp.me`. Dev: separate unpacked build with `http://localhost:*` host permissions. Localhost **never** appears in the published manifest. |

### Findings from the pre-build audit (2026-04-18)

These are not opinions; they are the reasons specific phases exist. Do not skip Phase 0.

1. **`POST/DELETE /api/v1/patreon/cookie` and `GET /api/v1/patreon/cookie/status` have no auth** (`src/server.ts:1743–1806`). Anyone with a valid `cr_*` id can overwrite, delete, or probe the encrypted cookie store. This is a Tier 1 Stage B violation that must be fixed regardless of the extension. **Phase 0.A** closes it.
2. **`relay_session` is `SameSite=Lax`** (`src/identity/session-cookie.ts:50`) — a locked Tier 0 decision. The extension cannot use `credentials: "include"` cross-origin. It must hold a separate Bearer token issued via a top-level consent handshake. **Phase 0.C** mints the token type; **Phase 1.A** is the consent page.
3. **CORS reflects any `Origin` with credentials** (`src/server.ts:925–947`). Today this is masked by SameSite=Lax. To future-proof, **Phase 0.E** adds an explicit allowlist for the new extension endpoints only.
4. **Default session TTL is 24h** (`src/identity/identity-service.ts:6`). Too short for an extension. **Phase 0.B** adds a `Session.kind` discriminator and a longer-TTL issuance path.
5. **No rate limiting anywhere.** **Phase 0.D** scopes `express-rate-limit` to the new endpoints + the existing cookie endpoints.
6. **Encryption-at-rest, signed-state HMAC, and bearer resolution are already solid** and are reused as-is (`src/auth/cookie-store.ts`, `src/auth/patreon-creator-oauth-state.ts`, `requirePatronBearerSession` in `src/server.ts:2424`).

### Tier 0 invariants — extension compliance proof

| Invariant (`AUTH_GUARDRAILS_TIER_1.md` §1.2) | How the extension complies |
|---|---|
| 1. No JS reads `relay_session` | Extension never touches `relay_session`. The consent page exchanges it server-side for a separate `relay_extension` token. |
| 2. No handler grants permission based on `relay_active_role` | Extension scopes all writes to `Account.primaryRelayCreatorId`; `relay_active_role` is never read. |
| 3. No FK/RLS uses `public_slug` or `relay_creator_id` | Extension passes `creator_id` over the wire for endpoint compat; the server resolves to `Tenant.id` via existing helpers. |
| 4. One Account, one cookie, second sign-in invalidates first | Extension grants are independent of the web session by user choice (P-10). The connected-extensions page is the revocation surface. |

Verb hygiene (Stage H): extension uses `POST` to write the Patreon cookie, `DELETE` to revoke its own grant, `GET` only for status reads. Compliant.

---

## Phase 0 — Backend prerequisites

> **Goal:** Make the existing API safe and capable enough for the extension to talk to it. This phase is independently shippable and improves the security of the manual-paste flow today.

### 0.A — Add auth to `/api/v1/patreon/cookie` endpoints

**Goal:** All three cookie endpoints require an authenticated Account whose `primaryRelayCreatorId` matches the requested `creator_id`.

**Files:**
- `src/server.ts` — modify three handlers at lines 1743 (`POST`), 1776 (`DELETE`), 1792 (`GET status`):
  - Call `await requirePatronBearerSession(req, res, traceId)`; bail on null.
  - Then call `await requireAccountMatchesCreator(req, res, traceId, creatorId)`; bail on false.
  - Keep all existing validation (`validateRequiredFields`, `relayCreatorIdExists`).
- `tests/cookie-ingest-cover-dedupe.test.ts` and `tests/patreon-cookie-oauth-body.test.ts` — update fixtures to send `Authorization: Bearer <opaque>` headers; existing test sessions should already have an account.
- New `tests/patreon-cookie-auth.test.ts` — assert all three return `401` with no auth, `403` when authed as a different creator, and `200` on the matching pair.

**Acceptance:**
- `npm run test` green; new auth test included.
- `curl -X POST $API/api/v1/patreon/cookie -d '{"creator_id":"cr_x","session_id":"y"}' -H 'Content-Type: application/json'` returns `401` (was: `200`/`404`).
- The web cookie page (`web/app/patreon/cookie/page.tsx`) still works — it already calls `relayFetch` with `credentials: "include"`, which sends the `relay_session` cookie that `requirePatronBearerSession` accepts.

**Out of scope:** Changing the response shape, the encryption format, or the file-store schema.

### 0.B — Add `Session.kind` discriminator + extension TTL path

**Goal:** Distinguish web sessions (24h TTL) from extension sessions (sliding 30d) without forking the resolution path.

**Files:**
- `prisma/schema.prisma` — extend the existing `Session` model (line 149):
  ```prisma
  enum SessionKind {
    web        @map("web")
    extension  @map("extension")
  }

  model Session {
    // ...existing fields...
    kind            SessionKind @default(web) @map("kind")
    label           String?     @map("label")           // user-visible: "Chrome on Windows", set by extension on issue
    lastUsedAt      DateTime?   @map("last_used_at")    // sliding-window anchor for extension grants
    @@index([tenantMembershipId, kind, expiresAt])
  }
  ```
- New `prisma/migrations/<ts>_session_kind/migration.sql` — generated by `npm run db:migrate -- --name session_kind`. Backfill: `UPDATE sessions SET kind = 'web' WHERE kind IS NULL`.
- `src/identity/types.ts` — add `kind?: "web" | "extension"; label?: string | null` to `SessionToken`.
- `src/identity/identity-service.ts`:
  - Add `EXTENSION_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000`.
  - Add `issueExtensionSession(user: UserAccount, label: string): Promise<SessionToken>` that mints with `kind: "extension"`, `label`, and the longer TTL.
  - Add `touchSessionExpiry(token: string): Promise<void>` — bumps `expiresAt` to `now + EXTENSION_SESSION_TTL_MS` and sets `lastUsedAt = now()` **only when** `kind === "extension"`. Web sessions are unchanged.
- `src/identity/identity-store.ts` + `src/identity/identity-store-db.ts` — add corresponding `createSession` overload that persists `kind` + `label`, and `touchSessionExpiry`. File-backed store mirrors the schema for parity.
- `src/server.ts` — in `requirePatronBearerSession`, after successful `resolveSession`, if `session.kind === "extension"`, fire-and-forget `identityService.touchSessionExpiry(opaque).catch(() => {})`. **Do not** await — request latency stays unchanged.
- New `tests/identity/extension-session.test.ts` — covers issue, sliding renewal on use, expiry on idle, and that web sessions are untouched.

**Acceptance:**
- Migration applies cleanly on a fresh DB (`docker compose up -d` then `npx prisma migrate deploy`).
- `tests/identity/*` all pass; new test added.
- An issued extension session resolves successfully on day 29 and gets bumped; an unused one for 31 days fails with "Invalid or expired session."
- Web sign-in flow unchanged — `relay_session` still 24h.

**Out of scope:** Changing the cookie TTL, removing the JSON-body token return, or changing how `relay_session` is set.

### 0.C — Extension consent + token issuance endpoints

**Goal:** Three new endpoints that implement the OAuth-style handshake the extension uses to obtain a token without ever seeing the user's `relay_session`.

**Endpoints:**

| Verb + Path | Auth | Purpose |
|---|---|---|
| `POST /api/v1/auth/extension/consent/start` | Account session (cookie or Bearer) | User clicked "Authorize" on the consent page. Returns a one-time `consent_code` (HMAC-signed, 60s TTL, single-use) bound to `accountId` + extension installation id. |
| `POST /api/v1/auth/extension/consent/exchange` | Public (rate-limited, code is the auth) | Extension exchanges `consent_code` for a long-lived `relay_extension` token. Returns `{ token, expires_at, label, account_id, relay_creator_id }`. |
| `DELETE /api/v1/auth/extension/grants/:tokenId` | Account session | Revoke a specific extension grant from the connected-extensions page. |
| `GET /api/v1/auth/extension/grants` | Account session | List the account's active extension grants for the settings page. |

**Files:**
- New `src/auth/extension-consent-code.ts` — clone the shape of `src/auth/patreon-creator-oauth-state.ts`. Same HMAC primitive, **separate secret** `RELAY_EXTENSION_CONSENT_SECRET` (min 16 chars). Payload: `{ v: 1, a: accountId, i: installationId, exp }`. 60-second TTL. Single-use is enforced by storing the code's hash in a small in-memory `Set` with TTL eviction on the API process; collisions across nodes during the 60s window are acceptable.
- `src/server.ts` — register the four endpoints near the existing `auth/patreon/creator/prepare` block (around line 1081 for visual grouping). Use existing helpers: `requirePatronBearerSession`, `getAccountIdForSession`, `successEnvelope`, `errorEnvelope`, `traceIdFrom`.
- `src/server.ts` — issuance path calls `identityService.issueExtensionSession(user, label)` (Phase 0.B). The `label` is built from the extension's reported `installationId` + UA string sent by the extension during exchange.
- New `tests/extension-consent-flow.test.ts` — covers happy path, expired code, replayed code (single-use), unbound account, and TTL on grants.

**Acceptance:**
- `RELAY_EXTENSION_CONSENT_SECRET` documented in `.env.example`.
- A full handshake (start → exchange) completes in tests. Replay of the same code returns `409 CONSENT_CODE_USED`.
- Listing grants shows the new row; deleting it makes subsequent extension calls return `401`.
- All four endpoints are protected by `requirePatronBearerSession` *except* `consent/exchange`, which is auth-by-code.

**Out of scope:** Changing how `relay_session` works for the web. Adding role-scoped tokens (always full account scope for v1).

### 0.D — Rate limiting (in-memory)

**Goal:** Throttle the new endpoints + the now-authed cookie endpoints to prevent abuse.

**Files:**
- `package.json` — add `express-rate-limit` (latest 7.x).
- New `src/middleware/rate-limits.ts` — three named limiters:
  - `consentStart`: 30 req / 5 min per `accountId` (keyGenerator reads `req.session?.user_id` set by `requirePatronBearerSession` upstream — apply limiter **after** auth).
  - `consentExchange`: 60 req / 5 min per IP. Strict because it's unauthenticated.
  - `cookieWrite`: 60 req / 1 hour per `accountId`. Cookie writes should be rare; high frequency = bug or abuse.
- `src/server.ts` — apply the relevant limiter to each route registered in 0.A and 0.C.
- Add a comment block at the top of `src/middleware/rate-limits.ts`:
  ```
  In-memory limiter — counters are per-process. For multi-node deploys, swap
  the store for `rate-limit-redis` and wire REDIS_URL. See AGENTS.md.
  ```

**Acceptance:**
- Smoke test: 61 rapid `consent/exchange` POSTs from the same IP get a `429` on the 61st.
- Rate-limit headers (`RateLimit-Remaining`, `RateLimit-Reset`) are visible in responses.
- No regression in `npm run test`.

**Out of scope:** Redis store, distributed counters, per-tenant adaptive limits.

### 0.E — Tighten CORS for the extension endpoints only

**Goal:** Don't loosen the global CORS posture, but allow the extension's specific origin to call the four new endpoints with explicit allowlisting. The extension does **not** use `credentials: "include"` (it uses `Authorization: Bearer`), so we don't need `Access-Control-Allow-Credentials` on these routes — which is exactly what makes the allowlist tight.

**Files:**
- `src/server.ts` — extend the existing CORS middleware (lines 925–947) to read `RELAY_EXTENSION_ORIGINS` (comma-separated). For requests against `/api/v1/auth/extension/*`:
  - If `Origin` matches an allowlisted entry **and** is a `chrome-extension://` or `moz-extension://` URL, set `Access-Control-Allow-Origin: <origin>` and **omit** `Access-Control-Allow-Credentials`.
  - Otherwise reject the preflight (no headers set; the browser blocks the request).
- `.env.example` — add:
  ```
  # Comma-separated extension origins permitted to hit /api/v1/auth/extension/*
  # Get the production extension ID from chrome.google.com/webstore/devconsole after publishing
  # Format: chrome-extension://<id>,moz-extension://<id>
  # RELAY_EXTENSION_ORIGINS=chrome-extension://abcdefghijklmnop,moz-extension://abcdefghijklmnop
  ```

**Acceptance:**
- A request to `/api/v1/auth/extension/consent/exchange` from an unlisted `chrome-extension://...` origin is blocked at preflight.
- The same request from a listed origin succeeds.
- Cookie-based endpoints (`/api/v1/patreon/cookie`) continue to reflect any origin with credentials, unchanged.

> **HUMAN ACTION REQUIRED — first deploy after Phase 6:** The extension's production ID is assigned by the Chrome Web Store on first publish. Update `RELAY_EXTENSION_ORIGINS` on the host with the real ID + the Firefox AMO ID; restart the API. Until this is done, the production extension cannot talk to the production API.

### 0.F — Phase 0 verification gate

**Goal:** Prove Phase 0 is shippable on its own before any web/extension work begins.

**Acceptance:**
- `npm run test` green.
- `npm run build` green.
- `npm run build --prefix web` green (no shape change to web's API contract).
- Manual: visit `web/app/patreon/cookie/page.tsx`, save a cookie — works exactly as before.
- Manual: `curl` against the cookie endpoints without auth — gets `401`.

> **HUMAN ACTION REQUIRED — Phase 0 ship gate:** Operator deploys Phase 0 to staging, verifies the existing manual-paste flow still works end-to-end, and confirms the auth holes are closed. Only after this should Phase 1 begin.

*Repo + integration test verification recorded 2026-04-18 — see [`docs/Airtable Drops/Extension/00-README.md`](Airtable%20Drops/Extension/00-README.md) (index line at top). Staging ship gate (above) remains operator-owned.*

---

## Phase 1 — Web app changes

> **Goal:** Add the consent page (entry point for the extension's handshake) and the connected-extensions settings page. Update the existing manual cookie page to surface the extension as the recommended path.

### 1.A — Extension consent page (`/extension/authorize`)

**Goal:** A signed-in user lands on this page from the extension popup. They see what the extension wants to do and click "Authorize." On click, the page calls `POST /api/v1/auth/extension/consent/start`, gets back a `consent_code`, and posts it to the extension via `chrome.runtime.sendMessage` (using the extension's `externally_connectable` config).

**Files:**
- New `web/app/extension/authorize/page.tsx` — server component that resolves the session and forwards to the client component below.
- New `web/app/extension/authorize/AuthorizeClient.tsx` — client component:
  - Reads `?ext_id=<id>&installation_id=<uuid>&label=<ua-string>` from the URL (set by the extension when it opens this tab).
  - Validates `ext_id` against an allowlist on `process.env.NEXT_PUBLIC_RELAY_EXTENSION_IDS` (comma-separated, mirrors the server allowlist). Renders a "This extension is not recognized" error if it doesn't match.
  - Renders an authorize card: extension name, label preview, what permissions it'll receive ("read your Patreon session_id and store it encrypted in your Relay account"), and a single big **Authorize** button.
  - On click: `relayFetch('/api/v1/auth/extension/consent/start', { method: 'POST', body: JSON.stringify({ installation_id, label }) })`. Take the `consent_code` from the response.
  - Call `chrome.runtime.sendMessage(ext_id, { type: "RELAY_CONSENT_CODE", code: consent_code })`. Show "Connected ✓ — you can close this tab." If `chrome.runtime` isn't available (Firefox uses `browser.runtime`), feature-detect and call the right one.
- `web/middleware.ts` — add `/extension/authorize` to `APP_ROUTES` so logged-out users get bounced to login with `returnTo` preserved (line 12; sits next to existing `/creator/connect`).

**Acceptance:**
- Logged-out user opens `/extension/authorize?ext_id=X&installation_id=Y` → bounced to `/login?returnTo=...`. After login, they land back on the authorize page.
- Logged-in user on the page sees the authorize card with the extension's label echoed.
- Clicking Authorize completes the handshake and the extension receives the code (verified manually with the dev build).
- `NEXT_PUBLIC_RELAY_EXTENSION_IDS` documented in `web/.env.example`.

**Out of scope:** Multiple simultaneous extension grants from the same Account. v1 allows N grants but the UI shows them all in 1.B.

### 1.B — Connected extensions settings page

**Goal:** A signed-in user can see all their active extension grants and revoke any of them.

**Files:**
- New `web/app/settings/connected-extensions/page.tsx` — server-rendered list using `relayFetch('/api/v1/auth/extension/grants')`.
- New `web/app/settings/connected-extensions/RevokeButton.tsx` — client component, calls `DELETE /api/v1/auth/extension/grants/:tokenId`, refreshes the list.
- Each row shows: `label` (e.g. "Chrome on Windows · installed Apr 18, 2026"), `last_used_at` (relative time), `expires_at`, **Revoke** button.
- Add a link to this page from the existing settings index (locate via `rg "settings/" web/app/` and follow the existing pattern; if no settings index exists, add a link from the user menu).
- `web/middleware.ts` — add `/settings/connected-extensions` to `APP_ROUTES`.

**Acceptance:**
- Page renders the user's grants. Empty state copy: "No connected extensions. Install the [Relay browser extension](...) to capture your Patreon session in one click."
- Revoke removes the row and any subsequent extension API call from that grant returns `401`.
- Public reachability check: logged-out access bounces to `/login`.

### 1.C — Update manual cookie page with extension CTA

**Goal:** Position the extension as the recommended path; keep the manual paste as the explicit "Advanced" fallback.

**Files:**
- `web/app/patreon/cookie/page.tsx` — restructure:
  - At top, a new card: **Recommended — install the Relay extension.** Includes Chrome Web Store + Firefox add-ons links (URLs filled in after Phase 6) and a one-line explainer. Disabled buttons with "Pending publication" text until the URLs are known.
  - Below, the current `<details>How to get your session_id</details>` block becomes the "Advanced — manual paste" section, collapsed by default.
  - Existing functionality (paste, save, check status, remove) preserved verbatim — that page already works against the now-authed endpoints from Phase 0.A.

**Acceptance:**
- Visual: the page now leads with the extension CTA. Manual paste still works.
- No regression in `tests/` that touch the cookie endpoints.

### 1.D — Phase 1 verification gate

**Acceptance:**
- `npm run build --prefix web` green.
- `npm run test` green (any new web tests via root Vitest as per `AGENTS.md`).
- Manual flow: with Phase 0 deployed and a stub `chrome.runtime.sendMessage` mocked in DevTools console, the consent page completes the handshake and the connected-extensions page lists the grant.

---

## Phase 2 — Extension scaffold

> **Goal:** Set up the `extension/` workspace with a build pipeline that produces three artifacts: Chrome dev unpacked, Chrome production zip, Firefox production zip. No runtime logic yet — just the manifest, build config, and icons.

### 2.A — Workspace + tooling

**Files:**
- New `extension/package.json` — devDependencies: `vite`, `@crxjs/vite-plugin`, `typescript`, `@types/chrome`, `@types/firefox-webext-browser`, `webextension-polyfill`, `prettier`. No runtime deps for v1 (no React in the popup; vanilla TS keeps the bundle <20kb).
- New `extension/tsconfig.json` — `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`, strict.
- New `extension/vite.config.ts` — uses `@crxjs/vite-plugin`. Reads `EXT_TARGET=chrome|firefox` and `EXT_ENV=dev|prod` env vars; emits to `dist/<target>-<env>/`.
- New `extension/manifests/manifest.chrome.prod.json` — see 2.B.
- New `extension/manifests/manifest.chrome.dev.json` — adds `http://localhost:*/*` to `host_permissions` and `externally_connectable.matches`.
- New `extension/manifests/manifest.firefox.prod.json` — adds `browser_specific_settings.gecko.id` (must be email-style, e.g. `relay-extension@relayapp.me`) and uses `background.scripts` instead of MV3's `service_worker` (Firefox MV3 service-worker support is recent enough that a `scripts` fallback is safer at v1).
- `extension/build.mjs` — small node script that copies the chosen manifest into `dist/<target>-<env>/manifest.json`, then invokes vite. Wired as `npm run build:chrome:prod` etc.
- `extension/.gitignore` — `dist/`, `node_modules/`, `*.zip`, `web-ext-artifacts/`.
- New `extension/icons/` — placeholders to be replaced before Phase 6 (see HUMAN ACTION below).
- New `extension/README.md` — dev workflow: install, build, sideload, test.
- Root `package.json` — add `extension` to workspaces array if the repo uses workspaces; otherwise leave standalone.

> **HUMAN ACTION REQUIRED — icons:** Before Phase 6, designer/operator provides 16x16, 48x48, and 128x128 PNG icons matching the Relay brand. Drop them in `extension/icons/`. Placeholder until then.

### 2.B — Production manifest (Chrome)

```json
{
  "manifest_version": 3,
  "name": "Relay — Patreon connector",
  "version": "0.1.0",
  "description": "Securely connect your Patreon account to Relay so Relay can back up your own posts and media.",
  "icons": {
    "16": "icons/16.png",
    "48": "icons/48.png",
    "128": "icons/128.png"
  },
  "action": {
    "default_title": "Relay",
    "default_popup": "src/popup.html",
    "default_icon": {
      "16": "icons/16.png",
      "48": "icons/48.png",
      "128": "icons/128.png"
    }
  },
  "background": {
    "service_worker": "src/background.ts",
    "type": "module"
  },
  "permissions": ["cookies", "alarms", "storage"],
  "host_permissions": [
    "https://www.patreon.com/*",
    "https://relayapp.me/*"
  ],
  "externally_connectable": {
    "matches": ["https://relayapp.me/*"]
  }
}
```

Notes:
- **No `<all_urls>`, no `tabs`, no `activeTab`.** Web Store reviewers flag any of those for an extension that doesn't visibly need them.
- `externally_connectable` restricts who can `chrome.runtime.sendMessage` *to* the extension — this is what makes the consent handshake safe.
- `cookies` + `host_permissions: patreon.com` is the minimum needed to read `session_id`.

### 2.C — Phase 2 verification gate

**Acceptance:**
- `cd extension && npm i` succeeds.
- `npm run build:chrome:dev` produces `extension/dist/chrome-dev/` with `manifest.json` containing localhost in `host_permissions`.
- `npm run build:chrome:prod` produces `extension/dist/chrome-prod/` with **no** localhost references — verify with `rg localhost extension/dist/chrome-prod/`.
- Loading `extension/dist/chrome-dev/` via `chrome://extensions → Load unpacked` shows the extension with the placeholder icon and an empty popup (no errors in service worker console).

---

## Phase 3 — Extension background service worker

> **Goal:** Implement the runtime logic: receive consent codes, exchange them for tokens, capture cookies, post them to Relay, auto-refresh on Patreon login, refuse to do anything without a valid grant.

### 3.A — Storage shape and auth state

**Files:**
- New `extension/src/lib/storage.ts` — typed wrapper over `chrome.storage.local` (Firefox via `webextension-polyfill`). Stored keys:
  - `installation_id` (UUID, generated once on first run, never changes for the install)
  - `grant`: `{ token: string; expires_at: string; account_id: string; relay_creator_id: string; created_at: string }` — set after successful exchange
  - `last_sync_at`, `last_sync_hash`, `last_sync_status`
- All helpers async, return strongly-typed objects, throw on schema mismatch (and clear corrupt state).

### 3.B — Background worker

**File:** new `extension/src/background.ts`. Implements:

1. **`onInstalled` listener:** generates `installation_id` if missing. Sets a 12-hour `chrome.alarms` named `relay-cookie-refresh`.
2. **`onMessage` listener (from popup):**
   - `START_CONSENT`: opens a tab to `https://relayapp.me/extension/authorize?ext_id=<self>&installation_id=<id>&label=<ua>`. Returns the tab id so the popup can close.
   - `SYNC_NOW`: see 3.C.
   - `REVOKE_LOCAL`: clears `grant` from storage, optionally calls `DELETE /api/v1/auth/extension/grants/:id` if a grant exists. Used by the popup's "Disconnect" button.
   - `STATUS`: returns `{ hasGrant, lastSyncAt, lastSyncStatus, accountId, relayCreatorId }` for popup rendering.
3. **`onMessageExternal` listener (from the consent page only):**
   - Reject any sender whose URL doesn't start with `https://relayapp.me/`.
   - On `RELAY_CONSENT_CODE`: POST to `/api/v1/auth/extension/consent/exchange` with the code. On success, store `grant`, then immediately `SYNC_NOW`. On failure, store an error state and return it to the sender.
4. **`chrome.alarms.onAlarm`:** on `relay-cookie-refresh`, fire `SYNC_NOW` (no-op if no grant).
5. **`chrome.cookies.onChanged`:** when the changed cookie is `session_id` on `patreon.com` and `removed === false` (i.e. set/updated), fire `SYNC_NOW`. **This is the magic that makes 30-day expiry irrelevant.**

### 3.C — `SYNC_NOW` implementation

```ts
async function syncNow(): Promise<SyncResult> {
  const grant = await storage.getGrant();
  if (!grant) return { ok: false, reason: "no_grant" };

  const cookie = await browser.cookies.get({ url: PATREON_URL, name: "session_id" });
  if (!cookie?.value) return { ok: false, reason: "no_patreon_cookie" };

  const hash = await sha256(cookie.value);
  const last = await storage.getLastSync();
  if (last?.hash === hash) {
    await storage.setLastSync({ hash, status: "unchanged", at: new Date().toISOString() });
    return { ok: true, status: "unchanged" };
  }

  const res = await fetch(`${RELAY_BASE}/api/v1/patreon/cookie`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${grant.token}`
    },
    body: JSON.stringify({ creator_id: grant.relay_creator_id, session_id: cookie.value })
  });

  if (res.status === 401) {
    await storage.clearGrant();
    return { ok: false, reason: "grant_revoked" };
  }
  if (res.status === 429) return { ok: false, reason: "rate_limited" };
  if (!res.ok) return { ok: false, reason: "http_error", detail: `${res.status}` };

  await storage.setLastSync({ hash, status: "stored", at: new Date().toISOString() });
  return { ok: true, status: "stored" };
}
```

Critical correctness notes:
- **Service workers shut down after ~30s idle.** Never store state in module-scoped `let` — always read from `chrome.storage.local`. The code above does.
- **Hash-and-skip** prevents pointless writes when Patreon refreshes its own cookie internals without changing `session_id`.
- **`401 → clear grant`** is the only auth-error handler; popup will then prompt for re-consent.
- The extension **never** logs `cookie.value` to console, alarms, or any external service. Wrap `console.log` in a `DEBUG` flag that defaults to `false` in production builds.

### 3.D — Cross-browser shim

**File:** new `extension/src/lib/browser.ts`. Re-export `webextension-polyfill` so the rest of the codebase uses `import browser from "./lib/browser"`. This is the single difference between Chrome and Firefox builds — everything else uses the polyfilled API.

### 3.E — Phase 3 verification gate

**Acceptance:**
- Manual: with Phase 0 + 1 deployed locally, running the dev build, completing the consent flow stores a grant. The service worker console (`chrome://extensions → service worker`) logs no errors.
- Manual: editing the `session_id` cookie in Patreon DevTools triggers `SYNC_NOW` within seconds; the cookie appears encrypted in `.relay-data/cookie-store.json` (or the DB equivalent) under the correct `creator_id`.
- Manual: revoking the grant from `/settings/connected-extensions` causes the next `SYNC_NOW` to clear local state with `reason: "grant_revoked"`.
- `rg "console.log\\(.*cookie" extension/src/` returns no hits that would log `cookie.value`.

---

## Phase 4 — Extension popup UI

> **Goal:** A small, three-state popup. Vanilla TS + minimal CSS. No frameworks.

### 4.A — Markup + states

**Files:**
- New `extension/src/popup.html` — single `<main>` with placeholders for status, primary button, secondary link, footer.
- New `extension/src/popup.css` — system fonts, ~320px wide, dark-mode-friendly via `prefers-color-scheme`.
- New `extension/src/popup.ts` — on load, sends `STATUS` to the background and renders one of:
  - **No grant:** "Connect this device to Relay" — primary button sends `START_CONSENT`. Closes popup after.
  - **Grant + Patreon cookie present + last sync ok:** "Connected ✓ — last synced {relative time}." Secondary link: "Manage on Relay →" (opens `/settings/connected-extensions`). Tertiary: "Disconnect this device" (sends `REVOKE_LOCAL` after a confirm prompt).
  - **Grant + no Patreon cookie:** "You're not logged into Patreon. Open Patreon to log in." Primary button opens `https://www.patreon.com/login` in a new tab.
  - **Grant + last sync error:** show short error string + retry button (which fires `SYNC_NOW`).

Per **P-2: never display the cookie value** anywhere. The popup may show "Connected as ✓ {relayCreatorId}" because that is the user's own studio id, not the cookie.

### 4.B — Phase 4 verification gate

**Acceptance:**
- All four states render correctly when forced manually via `chrome.storage.local` fixtures.
- Popup is keyboard-navigable (tab order sensible, focus visible).
- Bundle size: `wc -c extension/dist/chrome-prod/popup.js` < 20kb.
- `rg "cookie\\.value|session_id" extension/dist/chrome-prod/popup.js` returns no hits.

---

## Phase 5 — End-to-end QA

> **Goal:** Validate the whole chain on staging before going to store review.

### 5.A — Test matrix

| Scenario | Expected |
|---|---|
| Fresh install → consent → cookie capture | Green path, grant stored, cookie encrypted on server |
| Consent code expires (wait 61s) | `consent/exchange` returns 410; popup shows "Consent expired, try again" |
| Replay consent code | `409 CONSENT_CODE_USED` |
| Patreon cookie deleted in DevTools | Next sync attempt returns `no_patreon_cookie`; popup updates |
| Patreon cookie refreshed by user re-login | `cookies.onChanged` fires; new value posted automatically |
| User revokes grant on settings page | Next SYNC_NOW returns `grant_revoked`, popup falls back to "Connect" |
| User uninstalls the extension | Server-side grant remains until expiry or until user revokes; documented in privacy policy |
| Token sliding renewal | Use the extension on day 29, verify `expires_at` extended; idle for 31 days, verify token rejected |
| Wrong extension origin tries `consent/exchange` | CORS preflight rejects |
| Extension calls `/api/v1/patreon/cookie` for a `creator_id` not owned by the account | `403 FORBIDDEN` (Phase 0.A) |
| Rate limit | 61st `consent/exchange` from one IP in 5 min returns `429` |
| Firefox build sideloaded | Same flow works end-to-end |

### 5.B — Phase 5 verification gate

> **HUMAN ACTION REQUIRED — staging account:** Operator provides a real Patreon creator account on staging (or uses their own dev studio) and runs the test matrix manually. Capture screenshots for the store listings during this pass.

---

## Phase 6 — Privacy policy, store assets, submission

> **Goal:** Get the extension into Chrome Web Store, Edge Add-ons, and Firefox Add-ons (AMO).

### 6.A — Privacy policy

**File:** new `web/app/legal/extension-privacy/page.tsx` (publicly reachable, no auth). Reuse content from `docs/cookie-auth-legal-rationale.md`. Add an extension-specific section:

- What the extension reads: only `session_id` cookie on `patreon.com`, only when triggered by user consent or `cookies.onChanged`.
- What it sends to Relay: the cookie value, the user's `creator_id`, and the extension's grant token.
- What it does NOT do: no telemetry (per P-5), no third-party services, no reading other cookies, no reading any pages, no ad/tracking integration.
- Storage: cookie encrypted at rest with AES-256-GCM (cite `src/auth/cookie-store.ts`).
- Retention: 90 days TTL on the cookie record (cite `FilePatreonCookieStore.maxAgeDays`); grant TTL sliding 30 days (per P-6); user can revoke at any time via `/settings/connected-extensions`.
- Contact + revocation instructions.

URL after deploy: `https://relayapp.me/legal/extension-privacy`. **This URL is required by all three stores.**

### 6.B — Store listings

**Files:**
- `extension/store/chrome/description.md` — long description.
- `extension/store/chrome/short_description.txt` — ≤132 chars.
- `extension/store/chrome/justifications.md` — pre-written reviewer responses for each permission:
  - `cookies` — "Reads the user's own Patreon `session_id` cookie at their explicit request to back up their content."
  - `host_permissions: patreon.com` — "Scopes the cookie permission to Patreon only; we do not access any other site."
  - `host_permissions: relayapp.me` — "Sends the cookie to the user's own Relay account."
  - `alarms` — "Periodically checks if the cookie has refreshed (12h interval)."
  - `storage` — "Stores the per-installation grant token locally so the user does not have to re-authorize."
  - `externally_connectable: relayapp.me` — "Used by the Relay consent page to deliver the one-time authorization code."
- `extension/store/firefox/description.md`, `extension/store/firefox/justifications.md` — adapted for AMO.

### 6.C — Build + sign + submit

> **HUMAN ACTION REQUIRED — Chrome Web Store account:** Operator creates a Chrome Web Store developer account ($5 one-time) at `https://chrome.google.com/webstore/devconsole`. Generate the manifest signing key, save it securely, copy its public-key field into `extension/manifests/manifest.chrome.prod.json` under a top-level `"key"` field — this **pins** the extension ID across dev unpacked, store, and CI so the CORS allowlist in 0.E never goes stale.

> **HUMAN ACTION REQUIRED — Firefox AMO account:** Operator creates an AMO account at `https://addons.mozilla.org/developers/`. AMO is free. Generate a JWT API key for `web-ext sign` if using CI signing.

> **HUMAN ACTION REQUIRED — submit:**
> 1. `cd extension && npm run build:chrome:prod && cd dist/chrome-prod && zip -r ../../chrome.zip .` — upload to Chrome Web Store. Fill out the listing using files in `extension/store/chrome/`. Submit for review.
> 2. `cd extension && npm run build:firefox:prod && cd dist/firefox-prod && zip -r ../../firefox.zip .` — upload to AMO. Fill out the listing using files in `extension/store/firefox/`. Submit for review.
> 3. Edge Add-ons: re-upload the same Chrome zip at `https://partner.microsoft.com/en-us/dashboard/microsoftedge/`. Edge accepts Chrome packages directly.

### 6.D — Phase 6 verification gate

> **HUMAN ACTION REQUIRED:** All three submissions reach "in review" status without immediate rejection. Reviewer questions about permissions are answered using the pre-written justifications in 6.B. Typical review: 1–3 business days for Chrome, 1–7 days for AMO. The `cookies` permission may extend Chrome review to 1–2 weeks.

---

## Phase 7 — Post-launch

### 7.A — Pin production extension IDs in CORS

> **HUMAN ACTION REQUIRED:** Once the Chrome and Firefox listings are live, capture the extension IDs from each developer console. Update `RELAY_EXTENSION_ORIGINS` and `NEXT_PUBLIC_RELAY_EXTENSION_IDS` on the production host with the real values. Restart the API and rebuild the web app. Until this is done, production users who install the published extension cannot authorize it.

### 7.B — Update CTAs in the web app

**Files:**
- `web/app/patreon/cookie/page.tsx` — fill in the real Web Store and AMO URLs in the "Recommended" card from 1.C; remove the disabled-button "Pending publication" state.
- New `web/app/components/InstallExtensionPrompt.tsx` — reusable card. Surface in onboarding and on the dashboard if the user has no cookie stored.

### 7.C — Operational runbook

**File:** new `docs/operations/extension-runbook.md`. One page covering:
- How to publish an extension update (bump version, rebuild, re-upload, AMO requires a fresh code review).
- How to revoke an entire kind of grant in an emergency (`UPDATE sessions SET revoked_at = now() WHERE kind = 'extension'`).
- How to rotate `RELAY_EXTENSION_CONSENT_SECRET` (invalidates all in-flight consent codes; existing grants survive).
- How to rotate `RELAY_TOKEN_ENCRYPTION_KEY` (triggers a re-encrypt sweep of `cookie-store`; document the script).

---

## Appendix A — File inventory (everything the build creates or touches)

**New backend files:**
- `src/auth/extension-consent-code.ts`
- `src/middleware/rate-limits.ts`
- `prisma/migrations/<ts>_session_kind/migration.sql`
- `tests/patreon-cookie-auth.test.ts`
- `tests/identity/extension-session.test.ts`
- `tests/extension-consent-flow.test.ts`

**Modified backend files:**
- `src/server.ts` (Phase 0.A, 0.C, 0.D, 0.E)
- `src/identity/identity-service.ts` (Phase 0.B)
- `src/identity/identity-store.ts`, `src/identity/identity-store-db.ts` (Phase 0.B)
- `src/identity/types.ts` (Phase 0.B)
- `prisma/schema.prisma` (Phase 0.B)
- `package.json` (add `express-rate-limit`)
- `.env.example` (new env vars)

**New web files:**
- `web/app/extension/authorize/page.tsx`
- `web/app/extension/authorize/AuthorizeClient.tsx`
- `web/app/settings/connected-extensions/page.tsx`
- `web/app/settings/connected-extensions/RevokeButton.tsx`
- `web/app/legal/extension-privacy/page.tsx`
- `web/app/components/InstallExtensionPrompt.tsx` (Phase 7.B)

**Modified web files:**
- `web/middleware.ts` (add two routes)
- `web/app/patreon/cookie/page.tsx` (CTA card; Phase 7.B fills URLs)
- `web/.env.example` (add `NEXT_PUBLIC_RELAY_EXTENSION_IDS`)

**New extension files:** entire `extension/` workspace — see 2.A.

**New ops files:**
- `docs/operations/extension-runbook.md` (Phase 7.C)

---

## Appendix B — Environment variables introduced

| Var | Where | Purpose |
|---|---|---|
| `RELAY_EXTENSION_CONSENT_SECRET` | API `.env` | HMAC secret for one-time consent codes (≥16 chars) |
| `RELAY_EXTENSION_ORIGINS` | API `.env` | Comma-separated `chrome-extension://...,moz-extension://...` allowlist for CORS on `/api/v1/auth/extension/*` |
| `NEXT_PUBLIC_RELAY_EXTENSION_IDS` | `web/.env.local` | Mirror of the above; the consent page validates `?ext_id=` against this list |

All three need to be set on staging before Phase 5, and on production before Phase 7.A. None has a build-time default — the API must refuse to start if `RELAY_EXTENSION_CONSENT_SECRET` is missing in production.

---

## Appendix C — Cross-references to existing guardrails

This plan satisfies, but does not modify, the following:

- `AUTH_GUARDRAILS_TIER_1.md` §1.2 invariants 1–4 (extension never reads `relay_session`, never reads `relay_active_role`, only references UUIDs internally, grants are revocable).
- `AUTH_GUARDRAILS_TIER_1.md` §3 Stage B (the cookie endpoints become Stage-B compliant in Phase 0.A).
- `AUTH_GUARDRAILS_TIER_1.md` §3 Stage H (verb hygiene — extension uses POST/DELETE/GET appropriately).
- `qa/HTTP_VERB_HYGIENE.md` (no new GET handlers mutate state).
- `cookie-auth-legal-rationale.md` (no change in legal posture; the extension is a frictionless capture mechanism, not a new data path).
- `docs/database/operations-and-security.md` (token hashes only; never store raw — `Session.tokenHash` continues this pattern).
