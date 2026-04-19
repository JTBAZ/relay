# EXT-6B — Store listings (Chrome + Firefox)

## Context

This row implements **Phase 6.B** of [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md): **reviewer-ready** copy for Chrome Web Store, Edge (same package as Chrome), and Firefox AMO — long description, short description (Chrome ≤132 chars), and **permission justifications** (verbatim strings from the plan). These files support **`EXT-6H`** submission and **`EXT-6V`** review Q&A.

## Preconditions

- [ ] `EXT-5V-e2e-verify-prompt.md` shipped or in final pass — screenshots/matrix inform honest listing copy.
- [ ] `EXT-6A-privacy-policy-prompt.md` shipped or URL known for cross-link in listing: **`https://relayapp.me/legal/extension-privacy`**.

## Tier 0 invariants (always apply)

1. **No JS reads `relay_session`.** It is `HttpOnly`. Web code never sees the token.
2. **No handler grants permission based on `relay_active_role`.** That cookie is a UI hint. Authz is derived from DB rows (`Account.primaryRelayCreatorId`, `TenantMembership`).
3. **No FK or RLS policy references `public_slug` or `relay_creator_id`.** Both can change shape under us; `Tenant.id` (UUID) is the only safe key.
4. **One Account, one Supabase user, one cookie.** A second simultaneous sign-in must invalidate the first server-side.
5. **All web calls go through `relayFetch`.** Raw `fetch("/api/...")` is forbidden after Stage 1.3 lands.
6. **All `/api/v1/*` routes use `requireAccount` / `requireAccountWithRole`** unless explicitly public with a `// PUBLIC: <reason>` comment.
7. **All redirects derived from user input pass through `resolvePostAuthPath`.**
8. **All mutations use POST/PUT/PATCH/DELETE.** GETs are side-effect-free.
9. **Listings must match manifest reality** — permissions and host patterns must not overclaim vs `extension/manifests/*.json` (`EXT-2B`).

## Goal

Create **`extension/store/chrome/`** and **`extension/store/firefox/`** content files per plan; Firefox text adapted from Chrome where noted.

## Reference reading

1. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §6.B — Store listings (file list + justification strings).
2. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §2.B — manifest permissions to align copy.
3. [`EXT-6A-privacy-policy-prompt.md`](EXT-6A-privacy-policy-prompt.md) — privacy URL for listing fields.

## Implementation steps

### Part A — Chrome / Edge

1. **New** `extension/store/chrome/description.md` — long description: what Relay is, what the extension does, privacy link, support contact.

2. **New** `extension/store/chrome/short_description.txt` — **≤132 characters** (plan). Count with `wc -c` or editor; spaces count.

3. **New** `extension/store/chrome/justifications.md` — one entry per permission using **exact** reviewer strings from plan §6.B:

   - **`cookies`** — "Reads the user's own Patreon `session_id` cookie at their explicit request to back up their content."
   - **`host_permissions: patreon.com`** — "Scopes the cookie permission to Patreon only; we do not access any other site."
   - **`host_permissions: relayapp.me`** — "Sends the cookie to the user's own Relay account."
   - **`alarms`** — "Periodically checks if the cookie has refreshed (12h interval)."
   - **`storage`** — "Stores the per-installation grant token locally so the user does not have to re-authorize."
   - **`externally_connectable: relayapp.me`** — "Used by the Relay consent page to deliver the one-time authorization code."

### Part B — Firefox

4. **New** `extension/store/firefox/description.md` — adapt Chrome long description for AMO tone/length conventions.

5. **New** `extension/store/firefox/justifications.md` — adapt permission answers; keep technical accuracy.

6. **Optional:** `extension/store/firefox/short_description.txt` if AMO asks for short line separately.

### Part C — Audit

7. **Tree check:**

   ```bash
   ls extension/store/chrome/ extension/store/firefox/
   ```

8. **Short description length:**

   ```powershell
   # Windows PowerShell example
   (Get-Content -Raw extension/store/chrome/short_description.txt).Length
   ```

## Acceptance criteria

- [ ] All files exist; Chrome short description ≤132 chars.
- [ ] Justifications file contains all six bullets verbatim (Chrome).
- [ ] Firefox variants present and coherent.
- [ ] No claims contradicting manifest or P-5 (no telemetry).
- [ ] Tier 0 invariants N/A for markdown — satisfied.

## Out of scope

- Uploading zips to stores (`EXT-6H`).
- Icons — **HUMAN ACTION** Phase 2/6 (`extension/icons/`).

## Handoff

Delta Out:

- Paths operator will paste into dev consoles during `EXT-6H`.
- AMO-specific notes (single line differences vs Chrome).

Next claimable: `EXT-6H-build-sign-submit-prompt.md`.
