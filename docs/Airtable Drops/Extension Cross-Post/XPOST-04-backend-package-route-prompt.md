# XPOST-04 — Backend Package Route

## Context

This row exposes the cross-post package helper over an extension-authenticated API route. The route is the trust boundary for cross-posting: the web page sends only `relay_post_id` to the extension, and the extension uses its Relay extension bearer token to request the package.

## Preconditions

- [ ] `XPOST-03-backend-package-query-prompt.md` shipped or is on the same branch.
- [ ] Extension bearer session resolution exists.
- [ ] Route envelopes and auth helpers in `src/server.ts` are understood.

## Goal

Add:

```text
GET /api/v1/extension/cross-post/patreon/:post_id
Authorization: Bearer <relay_extension_token>
```

The route returns a `PatreonCrossPostPackage` only when the extension grant belongs to the owner account for the post's creator.

## Reference Reading

1. [`docs/EXTENSION_CROSS_POST_BUILD_PLAN.md`](../../EXTENSION_CROSS_POST_BUILD_PLAN.md)
2. `src/server.ts` — extension auth endpoints under `/api/v1/auth/extension/*`
3. `src/server.ts` — `requirePatronBearerSession`, `getAccountIdForSession`, `successEnvelope`, `errorEnvelope`, `traceIdFrom`
4. Handoff from `XPOST-03`

## Implementation Steps

### Part A — Route Registration

1. Add the route near existing extension/auth or Relay-native post routes in `src/server.ts`.
2. Use `GET`; this route is side-effect-free.
3. Require extension/account authentication with the existing bearer-session path.
4. Resolve `accountId` from the session using the same helper used by extension grant routes.

### Part B — Validation and Response

1. Validate `:post_id` is a non-empty string.
2. Call the `XPOST-03` helper.
3. Return:
   - `200` with `successEnvelope(package, traceId)` for owner success.
   - `401` for missing/invalid bearer.
   - `403` for authenticated non-owner.
   - `404` for missing post.
   - `409` or `422` only if the post exists but cannot be packaged for a well-defined reason.
4. Do not expose whether another creator's private post exists beyond the route's established 403/404 convention.

### Part C — CORS and Headers

The global CORS middleware currently allows extension-origin bearer calls for normal API routes. Do not broaden CORS beyond what exists unless tests prove the route is blocked.

The extension fetch will include:

```http
Authorization: Bearer <grant.token>
Accept: application/json
```

### Part D — Tests

If tests are included in this row, cover at least:

- Owner gets `200`.
- Missing bearer gets `401`.
- Different account/creator gets `403`.
- Missing post gets `404`.

Otherwise, leave explicit handoff for `backend-package-tests`.

## Acceptance Criteria

- [ ] Route uses existing session/auth helpers; no new token parser.
- [ ] Route returns only backend-assembled package data.
- [ ] Route is side-effect-free and uses `GET`.
- [ ] Responses use existing envelope conventions.
- [ ] `npm run test` passes for touched tests.
- [ ] `npm run build` passes if TypeScript server code changed.

## Out of Scope

- Extension background fetch handler.
- Web messaging.
- Patreon editor content script.
- Store copy.

## Handoff

Delta Out:

- Exact route path.
- Response shape and error codes.
- Whether tests were added here or still need the `backend-package-tests` item.

