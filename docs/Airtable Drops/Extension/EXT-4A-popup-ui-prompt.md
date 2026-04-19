# EXT-4A — Popup markup, styles, and states

## Context

This row implements **Phase 4.A** of [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md): a **small vanilla** popup (~320px), no React, TS + minimal CSS with **`prefers-color-scheme`**. It drives **`START_CONSENT`**, **`SYNC_NOW`**, **`REVOKE_LOCAL`**, and **`STATUS`** messages to **`EXT-3B`**. **P-2:** never show Patreon **cookie value** or raw **`session_id`**; showing **“Connected as ✓ {relayCreatorId}”** is allowed (user’s studio id per §4.A).

## Preconditions

- [ ] `EXT-3V-phase3-verify-prompt.md` shipped green — background messaging contract stable **or** ship 4A on same branch as 3B with coordinated message types (recommended: **3V green first**).

## Tier 0 invariants (always apply)

1. **No JS reads `relay_session`.** It is `HttpOnly`. Web code never sees the token.
2. **No handler grants permission based on `relay_active_role`.** That cookie is a UI hint. Authz is derived from DB rows (`Account.primaryRelayCreatorId`, `TenantMembership`).
3. **No FK or RLS policy references `public_slug` or `relay_creator_id`.** Both can change shape under us; `Tenant.id` (UUID) is the only safe key.
4. **One Account, one Supabase user, one cookie.** A second simultaneous sign-in must invalidate the first server-side.
5. **All web calls go through `relayFetch`.** Raw `fetch("/api/...")` is forbidden after Stage 1.3 lands.
6. **All `/api/v1/*` routes use `requireAccount` / `requireAccountWithRole`** unless explicitly public with a `// PUBLIC: <reason>` comment.
7. **All redirects derived from user input pass through `resolvePostAuthPath`.**
8. **All mutations use POST/PUT/PATCH/DELETE.** GETs are side-effect-free.
9. **P-2 / P-5:** Popup must **not** display cookie value, raw `session_id`, or grant token; no telemetry.

## Goal

Ship `popup.html`, `popup.css`, `popup.ts` implementing four UX states + keyboard-friendly controls; align copy and message types with §4.A and `EXT-3B`.

## Reference reading

1. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §4.A — Markup + states (bullet list).
2. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §0 — P-2 popup copy rules.
3. **Handoff** from `EXT-3B` — `onMessage` API: `START_CONSENT`, `SYNC_NOW`, `REVOKE_LOCAL`, `STATUS` payloads.
4. `extension/manifests/manifest.chrome.prod.json` — `action.default_popup` path.

## Implementation steps

### Part A — Markup + styles

1. **`extension/src/popup.html`** — single `<main>` with placeholders: status region, primary button, secondary link, footer per plan.

2. **`extension/src/popup.css`** — system UI fonts, ~**320px** width, dark mode via **`prefers-color-scheme: dark`**, visible **:focus** outlines for keyboard users.

### Part B — Logic (`popup.ts`)

3. On load, send **`STATUS`** to runtime; render one of:

   - **No grant:** heading e.g. *“Connect this device to Relay”* — primary button → **`START_CONSENT`** → **`window.close()`** after start per plan.
   - **Grant + Patreon session ok + sync ok:** *“Connected ✓ — last synced {relative time}.”* — secondary: *“Manage on Relay →”* opens `https://relayapp.me/settings/connected-extensions` (or `browser.tabs.create`). Tertiary: *“Disconnect this device”* → confirm → **`REVOKE_LOCAL`**.
   - **Grant + no Patreon cookie:** *“You're not logged into Patreon…”* — primary opens `https://www.patreon.com/login`.
   - **Grant + sync error:** short **`reason`/`detail`** from last sync + **Retry** → **`SYNC_NOW`**.

4. **Relative time:** implement small helper (minutes/hours/days) or ISO fallback — keep bundle small.

5. **Studio label:** if `STATUS` includes `relayCreatorId`, show *“Connected as ✓ {relayCreatorId}”* per §4.A (optional line under status).

### Part C — Security + audit

6. **Forbidden strings in UI:** do not concatenate `cookie.value` into DOM.

7. **Grep source:**

   ```bash
   rg "cookie\.value|session_id" extension/src/popup.ts extension/src/popup.html
   ```

   Acceptable: word “session_id” only in user-facing explainer copy if unavoidable — prefer *“Patreon login”* wording; **no** runtime cookie string.

## Acceptance criteria

- [ ] Four states render per plan; message types match `EXT-3B`.
- [ ] `cd extension && npm run build:chrome:prod` succeeds.
- [ ] Keyboard: tab order logical, focus visible.
- [ ] Tier 0 invariants satisfied.

## Out of scope

- Phase 5 E2E matrix (`EXT-5V`).
- Changing background protocol.

## Handoff

Delta Out:

- Exact `browser.runtime.sendMessage` payloads and response handling.
- How errors from **`SYNC_NOW`** map to UI strings (including rate limit / consent expiry if surfaced later in Phase 5).

Next claimable: `EXT-4V-phase4-verify-prompt.md`.
