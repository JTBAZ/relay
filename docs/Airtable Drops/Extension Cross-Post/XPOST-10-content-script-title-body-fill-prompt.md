# XPOST-10 — Content Script Title and Body Fill

## Context

This is the first complete user-visible vertical slice of cross-posting. The content script should load on Patreon's editor, read the pending backend package from extension storage, fill title/body, show a review banner, and stop. Image upload is explicitly out of scope for this row.

## Preconditions

- [ ] `XPOST-09-background-tab-injection-prompt.md` shipped or is on the same branch.
- [ ] Pending package storage helpers exist.
- [ ] The package includes `title`, `body_text`, and optionally `body_html`.

## Goal

Build `extension/src/content/fill-patreon-editor.ts` so it reliably fills Patreon's title and body fields where possible and shows clear feedback when selectors fail.

## Reference Reading

1. [`docs/EXTENSION_CROSS_POST_BUILD_PLAN.md`](../../EXTENSION_CROSS_POST_BUILD_PLAN.md)
2. `extension/src/lib/storage.ts`
3. `extension/src/lib/cross-post-types.ts` if created
4. Handoff from `XPOST-09`

## Implementation Steps

### Part A — Read Pending Package

1. Import the extension storage helper or read the documented `pending_cross_post` key.
2. Validate that the package has a non-empty `relay_post_id`, title, and body string fields.
3. If missing/corrupt, show a Relay error banner and do not mutate the page.

### Part B — Wait for Patreon Editor

Use a bounded polling or `MutationObserver` helper:

1. Wait up to 10 seconds for a title candidate.
2. Wait up to 10 seconds for a body candidate.
3. Candidate selectors should include multiple fallbacks:
   - Title: known data attributes if discovered, `input[name="title"]`, `textarea[name="title"]`, prominent visible text input.
   - Body: `[contenteditable="true"]`, `.ProseMirror`, `[role="textbox"]`.
4. Prefer visible/enabled fields.

### Part C — Fill Like a User

1. For normal inputs/textareas:
   - Set value through the native value setter where possible.
   - Dispatch `input` and `change` events with bubbling.
2. For contenteditable editors:
   - Prefer paste/input simulation with text or sanitized HTML.
   - If assigning DOM directly, also dispatch `InputEvent` so React/ProseMirror state updates.
3. Do not insert untrusted scripts; sanitize/strip HTML if using `body_html`.

### Part D — Banner

Inject a small, clearly branded banner:

```text
Draft filled from Relay. Review the post in Patreon, then publish manually.
```

If one field failed:

```text
Relay filled part of the draft. Please review the highlighted missing field before publishing.
```

The banner must have a dismiss button and must not block Patreon's own controls.

### Part E — Clear Package

Clear `pending_cross_post` only after the script has either:

- Successfully filled both title and body, or
- Displayed a failure banner explaining why it could not fill.

## Acceptance Criteria

- [ ] Title and body fill succeeds against current Patreon editor in manual staging test.
- [ ] Failure to find selectors shows a clear banner rather than silent failure.
- [ ] The content script never clicks Publish.
- [ ] The script does not log package contents, bearer tokens, Patreon cookies, or media URLs.
- [ ] `cd extension && npm run build:chrome:dev` succeeds.
- [ ] Manual smoke shows the banner and leaves the creator in control.

## Out of Scope

- Image upload or paste behavior (`XPOST-11`).
- Tags, tiers, paywall settings, scheduling.
- Backend package route changes.
- Web button placement.

## Handoff

Delta Out:

- Selectors that worked against Patreon at test time.
- Fill strategy used for title and body.
- Known failure modes for Patreon's editor.
- Whether `body_html` is used or text-only is safer.

