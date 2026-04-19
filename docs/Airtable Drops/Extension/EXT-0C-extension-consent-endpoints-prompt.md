# EXT-0C — Extension consent + token issuance endpoints

## Context

This row implements **Phase 0.C** of [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md): the OAuth-style handshake so the extension obtains a long-lived Bearer token **without ever seeing** `relay_session`. The consent page (Phase 1) will call `consent/start` with the user’s web session; the extension calls `consent/exchange` with the one-time code. This isolates new auth surface area from the existing Patreon cookie handlers hardened in Phase 0.A.

## Preconditions

- [ ] `EXT-0B-session-kind-extension-ttl-prompt.md` shipped — `identityService.issueExtensionSession(user, label)` must exist and persist `Session.kind === extension`.
- [ ] `EXT-0A-cookie-endpoint-auth-prompt.md` shipped recommended before full E2E, but not strictly required for unit tests of consent routes alone.

## Tier 0 invariants (always apply)

1. **No JS reads `relay_session`.** It is `HttpOnly`. Web code never sees the token.
2. **No handler grants permission based on `relay_active_role`.** That cookie is a UI hint. Authz is derived from DB rows (`Account.primaryRelayCreatorId`, `TenantMembership`).
3. **No FK or RLS policy references `public_slug` or `relay_creator_id`.** Both can change shape under us; `Tenant.id` (UUID) is the only safe key.
4. **One Account, one Supabase user, one cookie.** A second simultaneous sign-in must invalidate the first server-side.
5. **All web calls go through `relayFetch`.** Raw `fetch("/api/...")` is forbidden after Stage 1.3 lands.
6. **All `/api/v1/*` routes use `requireAccount` / `requireAccountWithRole`** unless explicitly public with a `// PUBLIC: <reason>` comment.
7. **All redirects derived from user input pass through `resolvePostAuthPath`.**
8. **All mutations use POST/PUT/PATCH/DELETE.** GETs are side-effect-free.
9. **New Patreon/extension-sensitive routes:** use `requirePatronBearerSession` + `requireAccountMatchesCreator` where the plan requires account scope **except** `POST /api/v1/auth/extension/consent/exchange`, which is **`// PUBLIC: one-time consent code is the credential; rate-limited`** per plan.

## Goal

Four routes live in `src/server.ts` with tests: consent start (authed), consent exchange (public, code-auth), list grants (authed), revoke grant (authed).

## Reference reading

1. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §0.C — Extension consent + token issuance endpoints (verb table and file list).
2. [`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §3 Stage B — authenticated `/api/v1/*` patterns.
3. [`docs/qa/HTTP_VERB_HYGIENE.md`](../../qa/HTTP_VERB_HYGIENE.md) — mutations vs side-effect-free GETs.
4. **Handoff from** `EXT-0B-session-kind-extension-ttl-prompt.md` — `issueExtensionSession` signature and session fields.
5. `src/auth/patreon-creator-oauth-state.ts` — pattern to clone for HMAC consent codes.
6. `src/server.ts` — register near existing `auth/patreon/creator/prepare` block (~line **1081** per plan).

## Implementation steps

### Part A — Consent code helper

1. **New file** `src/auth/extension-consent-code.ts` — clone the **shape** of `src/auth/patreon-creator-oauth-state.ts`: same HMAC primitive, **separate** env secret `RELAY_EXTENSION_CONSENT_SECRET` (minimum 16 characters). Payload: `{ v: 1, a: accountId, i: installationId, exp }`. **60-second TTL.**

2. **Single-use enforcement:** store the code’s **hash** in an in-memory `Set` with TTL eviction inside the API process; collisions across nodes during the 60s window are acceptable per plan.

### Part B — Endpoints (exact surface from plan)

| Verb + Path | Auth | Purpose |
|---|---|---|
| `POST /api/v1/auth/extension/consent/start` | Account session (cookie or Bearer) | Returns one-time `consent_code` bound to `accountId` + extension installation id |
| `POST /api/v1/auth/extension/consent/exchange` | Public (rate-limited; code is the auth) | Exchange code for `relay_extension` token + metadata |
| `DELETE /api/v1/auth/extension/grants/:tokenId` | Account session | Revoke one extension grant |
| `GET /api/v1/auth/extension/grants` | Account session | List active extension grants |

3. **`src/server.ts`** — register handlers near **`~1081`** per plan. Use: `requirePatronBearerSession`, `getAccountIdForSession`, `successEnvelope`, `errorEnvelope`, `traceIdFrom` (exact names as in codebase).

4. **Issuance:** `consent/exchange` handler calls `identityService.issueExtensionSession(user, label)` from Phase 0.B. Build `label` from extension-reported `installationId` + UA string sent during exchange (per plan).

5. **Document** `RELAY_EXTENSION_CONSENT_SECRET` in **`.env.example`**.

### Part C — Tests

6. **New file** `tests/extension-consent-flow.test.ts` — cover:
   - Happy path start → exchange.
   - Expired code → failure (410 or plan-aligned status).
   - Replayed code → **409** `CONSENT_CODE_USED` per plan.
   - Unbound / wrong account scenarios per plan.
   - Listing grants shows new row; **DELETE** causes subsequent extension calls to **401**.

### Part D — Audit

7. Confirm every new route has middleware or `// PUBLIC:` comment:

   ```bash
   rg "auth/extension" src/server.ts
   ```

## Acceptance criteria

- [ ] `.env.example` documents `RELAY_EXTENSION_CONSENT_SECRET`.
- [ ] Full handshake passes in tests; replay returns **409** `CONSENT_CODE_USED`.
- [ ] Grant list + delete behave per plan; deleted grant yields **401** on Bearer use.
- [ ] All four routes use `requirePatronBearerSession` **except** `consent/exchange` (public with `// PUBLIC: ...` comment).
- [ ] `npm run test` and `npm run build` pass at repo root.
- [ ] No new ESLint errors in touched files.
- [ ] Tier 0 invariants satisfied.

## Out of scope

- Changing how `relay_session` works for the web; role-scoped tokens; multi-tenant token narrowing ([`EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §0.C).
- Rate limiting middleware attachment (`EXT-0D`) — implement routes here; wire limiters in `EXT-0D`.
- CORS allowlist (`EXT-0E`).
- Consent **page** UI (`EXT-1A`).

## Handoff

Delta Out:

- Exact paths and envelope shapes for `consent/start`, `consent/exchange`, `grants` list, `grants/:id` delete.
- Env var name and minimum length for consent secret.
- Error codes (`CONSENT_CODE_USED`, etc.) the extension and web must handle.

Next claimable: `EXT-0D-rate-limiting-prompt.md` (wire limiters to these routes + cookie routes), `EXT-0E-cors-extension-allowlist-prompt.md`, then `EXT-0V-phase0-verify-prompt.md` after 0A–0E merge.
