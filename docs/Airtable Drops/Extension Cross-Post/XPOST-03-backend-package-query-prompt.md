# XPOST-03 — Backend Package Query

## Context

This row builds the server-side query/assembler for a Patreon cross-post package. Relay web must not send full draft content or media URLs to the extension. Instead, the extension sends a `relay_post_id` to Relay API with its extension bearer token, and the backend returns an owner-authorized package.

## Preconditions

- [ ] Cross-post trigger/package types have been drafted in the extension plan or shared helper.
- [ ] Existing extension bearer sessions are implemented and resolve through the current server auth path.
- [ ] Relay-native post creation is present via `POST /api/v1/relay/posts`.

## Goal

Create a focused backend helper that, given an authenticated account/creator scope and a Relay post id, returns a normalized `PatreonCrossPostPackage` or a clear denial/not-found result.

## Reference Reading

1. [`docs/EXTENSION_CROSS_POST_BUILD_PLAN.md`](../../EXTENSION_CROSS_POST_BUILD_PLAN.md)
2. `src/server.ts` — `POST /api/v1/relay/posts`
3. `src/server.ts` — `/api/v1/export/media/:creator_id/:media_id/content`
4. `web/lib/relay-api.ts` — `RelayNativeCreatePostData`
5. `prisma/schema.prisma` — `Post`, `PostVersion`, `MediaAsset`, creator/account relations

## Implementation Steps

### Part A — Locate Existing Models and Access Patterns

1. Identify how Relay-native posts and latest versions are read elsewhere.
2. Identify how server code maps an authenticated extension session to `Account.primaryRelayCreatorId`.
3. Reuse existing helper functions where available. Do not invent a parallel auth model.

### Part B — Add Query Helper

Create a helper near the Relay-native post backend code, or in a new file such as `src/extension/cross-post-package.ts`.

The helper should accept:

```ts
type BuildPatreonCrossPostPackageInput = {
  postId: string;
  accountId: string;
};
```

It should:

1. Resolve `Account.primaryRelayCreatorId` from `accountId`.
2. Load the post and latest/current post version.
3. Reject if the post's `creatorId` does not match `primaryRelayCreatorId`.
4. Normalize title and description/body.
5. Load media ids from the version.
6. Include image media first; either skip non-image media or include them with `mime_type` so the extension can report them as unsupported.
7. Generate media `content_url` values using the existing export media route.

Suggested return shape:

```ts
export type PatreonCrossPostPackage = {
  relay_post_id: string;
  title: string;
  body_text: string;
  body_html?: string;
  media: Array<{
    media_id: string;
    filename: string;
    mime_type: string;
    content_url: string;
  }>;
};
```

### Part C — Error Shape

Return structured outcomes rather than throwing for normal authorization cases:

- `not_found`
- `forbidden`
- `no_primary_creator`
- `ok`

Let the route decide the HTTP status and envelope.

## Acceptance Criteria

- [ ] Helper verifies `Account.primaryRelayCreatorId` owns the target post.
- [ ] Helper returns latest title/body/media for a Relay-native post.
- [ ] Helper does not expose upstream Patreon URLs.
- [ ] Helper does not read or rely on `relay_active_role`.
- [ ] Non-image media behavior is explicit and documented in code comments or tests.
- [ ] Unit-level tests or route tests cover owner and non-owner cases in the follow-up test item.

## Out of Scope

- Adding the Express route (`XPOST-04`).
- Extension background changes.
- Web button changes.
- Patreon editor DOM work.
- Tags, tiers, scheduling, and publish automation.

## Handoff

Delta Out:

- Helper path and exported function/type names.
- Exact media filtering behavior.
- Any assumptions about latest post version selection.
- Any route-level validation still needed in `XPOST-04`.

