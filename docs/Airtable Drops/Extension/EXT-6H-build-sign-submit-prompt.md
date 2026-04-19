# EXT-6H — Build, sign, and submit (operator)

## Context

This row is a **human-action gate** for [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §6.C. The **agent coordinates** with the **operator**; the operator performs Patreon/Chrome/AMO/Edge account steps, key generation, zipping, and uploads. **Do not** commit signing private keys or JWT secrets to the repo.

## Preconditions

- [ ] `EXT-6A-privacy-policy-prompt.md` shipped — privacy URL live or staging URL documented for listing.
- [ ] `EXT-6B-store-listings-prompt.md` shipped — `extension/store/**` copy ready.
- [ ] `extension/icons/` has **real** brand icons (Phase 2 human note + Phase 6 readiness).
- [ ] `npm run build:chrome:prod` and `npm run build:firefox:prod` succeed locally.

## Tier 0 invariants (always apply)

1. **No JS reads `relay_session`.** It is `HttpOnly`. Web code never sees the token.
2. **No handler grants permission based on `relay_active_role`.** That cookie is a UI hint. Authz is derived from DB rows (`Account.primaryRelayCreatorId`, `TenantMembership`).
3. **No FK or RLS policy references `public_slug` or `relay_creator_id`.** Both can change shape under us; `Tenant.id` (UUID) is the only safe key.
4. **One Account, one Supabase user, one cookie.** A second simultaneous sign-in must invalidate the first server-side.
5. **All web calls go through `relayFetch`.** Raw `fetch("/api/...")` is forbidden after Stage 1.3 lands.
6. **All `/api/v1/*` routes use `requireAccount` / `requireAccountWithRole`** unless explicitly public with a `// PUBLIC: <reason>` comment.
7. **All redirects derived from user input pass through `resolvePostAuthPath`.**
8. **All mutations use POST/PUT/PATCH/DELETE.** GETs are side-effect-free.
9. **Secrets:** manifest **`key`** field in JSON is **public** key material only (Chrome); private keys stay in operator vault — never in git.

## Goal

Operator completes Chrome + Firefox zips and submits **Chrome Web Store**, **AMO**, and **Edge Add-ons** per plan §6.C; agent captures resulting **listing URLs**, **version IDs**, and **extension IDs** (when assigned) for **`EXT-6V`** / **`EXT-7H`**.

## Reference reading

1. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §6.C — Build + sign + submit (numbered list).
2. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §6.C — Chrome / Firefox human blocks (signing key, AMO JWT).
3. [`extension/store/chrome/`](../../../extension/store/chrome/) and [`extension/store/firefox/`](../../../extension/store/firefox/) — listing paste sources.

## Operator actions

1. **HUMAN ACTION REQUIRED — Chrome Web Store account:** Create developer account ($5 one-time) at `https://chrome.google.com/webstore/devconsole`. Generate manifest **signing** key; store private key securely. Copy **public** key field into `extension/manifests/manifest.chrome.prod.json` top-level **`"key"`** per plan — **pins** extension ID for CORS (`RELAY_EXTENSION_ORIGINS`) stability. Commit **only** the manifest change with public key (if team policy allows); never commit private key.

2. **HUMAN ACTION REQUIRED — Firefox AMO account:** Create account at `https://addons.mozilla.org/developers/`. Generate **JWT API key** for `web-ext sign` if using automated signing.

3. **HUMAN ACTION REQUIRED — submit:**
   - **HUMAN ACTION REQUIRED:** Run `cd extension && npm run build:chrome:prod && cd dist/chrome-prod && zip -r ../../chrome.zip .` — upload **`chrome.zip`** to Chrome Web Store; fill listing from `extension/store/chrome/`; **Submit for review**.
   - **HUMAN ACTION REQUIRED:** Run `cd extension && npm run build:firefox:prod && cd dist/firefox-prod && zip -r ../../firefox.zip .` — upload to **AMO**; listing from `extension/store/firefox/`; **Submit for review**.
   - **HUMAN ACTION REQUIRED:** **Edge Add-ons:** upload same **Chrome** zip to `https://partner.microsoft.com/en-us/dashboard/microsoftedge/` per plan.

4. **Agent/operator:** Record in secure handoff doc (not necessarily git): submission timestamps, draft vs submitted state, any immediate rejection reasons.

## Acceptance criteria

- [ ] Operator confirms all three portals received uploads and show **submitted** / **in review** (or equivalent) without **immediate** automated rejection.
- [ ] Agent captured: Chrome item URL (if available), AMO slug URL, Edge submission id (as consoles show).
- [ ] No private signing keys or AMO secrets committed to repo.
- [ ] Manifest **`key`** (public) applied per Chrome instructions if that was prerequisite for ID pinning.

## Out of scope

- Waiting for review completion — **`EXT-6V`**.
- Production **`RELAY_EXTENSION_ORIGINS`** update — **`EXT-7H`** (IDs may be unknown until listings go live).

## Handoff

Delta Out:

- Chrome Web Store item link (if any pre-publish).
- AMO addon URL / slug.
- Edge partner dashboard link.
- Preliminary extension IDs if devconsole shows them.
- Any blockers (payment, identity verification).

Next claimable: `EXT-6V-store-review-gate-prompt.md`.
