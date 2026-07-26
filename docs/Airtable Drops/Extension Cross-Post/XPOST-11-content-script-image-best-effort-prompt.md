# XPOST-11 — Content Script Image Best Effort

## Context

Text fill is the v1 hard requirement. Image attach is valuable but risky because Patreon may reject synthetic file-input, drag/drop, or paste events in its React editor. This row adds best-effort image handling while preserving a clean fallback.

## Preconditions

- [ ] `XPOST-10-content-script-title-body-fill-prompt.md` shipped and text fill works.
- [ ] Package media entries include `content_url`, `mime_type`, `filename`, and `media_id`.
- [ ] The content script can read the extension grant token or ask background to fetch media on its behalf.

## Goal

Fetch Relay image blobs for packaged media and attempt to attach them to Patreon's editor. If upload cannot be automated, keep the draft filled and show a clear manual-upload fallback.

## Reference Reading

1. [`docs/EXTENSION_CROSS_POST_BUILD_PLAN.md`](../../EXTENSION_CROSS_POST_BUILD_PLAN.md)
2. `src/server.ts` — `/api/v1/export/media/:creator_id/:media_id/content`
3. `extension/src/lib/storage.ts`
4. Handoff from `XPOST-10`

## Implementation Steps

### Part A — Filter Media

1. Use only package entries whose `mime_type` starts with `image/`.
2. Track skipped non-image media separately for banner copy.
3. Impose a conservative v1 limit if needed, e.g. first 10 images, and report skipped count.

### Part B — Fetch Blobs

1. Fetch each `content_url` from the extension/content-script context with:

   ```http
   Authorization: Bearer <grant.token>
   Accept: image/*
   ```

2. Validate `res.ok`.
3. Convert each blob into a `File` with the package filename and MIME type.
4. Do not store blobs in `chrome.storage.local`.

If content-script fetch is blocked by browser/CORS behavior, move blob fetching to background in a follow-up and pass only small status data to the content script.

### Part C — Attempt Attach

Try strategies in order, stopping when one visibly succeeds:

1. Locate a visible or hidden `input[type="file"]`, assign `DataTransfer.files`, dispatch `input` and `change`.
2. Try a paste event into the body/editor region with image clipboard data.
3. If Patreon exposes an "add image/media" button that reveals a file input, click only that non-destructive UI affordance, then repeat file-input strategy.

Do not click Publish, Next, Submit, Paywall, Schedule, or any destructive/irreversible action.

### Part D — User Feedback

Success banner:

```text
Draft and images filled from Relay. Review in Patreon, then publish manually.
```

Partial/fallback banner:

```text
Relay filled the draft text. Patreon blocked automatic image attach. Download or upload these images manually: <filenames>.
```

Keep copy honest. Do not imply images transferred if they did not.

## Acceptance Criteria

- [ ] Text fill behavior from `XPOST-10` still works.
- [ ] Image fetch uses Relay bearer auth and does not expose raw tokens in the DOM.
- [ ] Successful image attach is verified manually if Patreon permits it.
- [ ] If image attach fails, the creator sees clear fallback instructions with filenames.
- [ ] Non-image media is skipped with explicit copy.
- [ ] `cd extension && npm run build:chrome:dev` succeeds.

## Out of Scope

- Video/audio upload automation.
- Patreon tier/paywall/schedule mapping.
- Retrying or queuing multiple posts.
- Background media proxy route unless content-script fetch proves blocked.

## Handoff

Delta Out:

- Which upload strategy worked, if any.
- Whether content-script fetch or background fetch was used.
- Known Patreon DOM selectors/buttons involved.
- Manual fallback wording and unsupported media behavior.

