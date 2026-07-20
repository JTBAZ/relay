# XPOST-07 — Content Script Build Wiring

## Context

The background worker cannot inject `extension/src/content/fill-patreon-editor.ts` directly at runtime. The extension build must emit an addressable JavaScript artifact that can be used with `chrome.scripting.executeScript`.

## Preconditions

- [ ] `manifest-scripting` item added `"scripting"` to extension manifests, or this row includes that change.
- [ ] Existing extension build works for Chrome dev/prod and Firefox prod.
- [ ] No content script behavior is required yet; this row can ship a minimal stub.

## Goal

Make `extension/src/content/fill-patreon-editor.ts` build into a runtime-injectable JS file without breaking existing popup/background bundles.

## Reference Reading

1. [`docs/EXTENSION_CROSS_POST_BUILD_PLAN.md`](../../EXTENSION_CROSS_POST_BUILD_PLAN.md)
2. `extension/vite.config.ts`
3. `extension/build.mjs`
4. `extension/manifests/manifest.chrome.prod.json`
5. `extension/src/background.ts`

## Implementation Steps

### Part A — Choose Build Strategy

Prefer explicit build output over always-on declared content scripts.

Recommended:

1. Add `extension/src/content/fill-patreon-editor.ts` as a separate build entry.
2. Configure Vite/Rollup output so the emitted filename is stable enough for background injection, e.g. `assets/fill-patreon-editor.js` or another documented path.
3. Keep the script dormant-safe: the initial stub can report that it loaded and read no secrets.

Alternative:

Declare a `content_scripts` entry scoped narrowly to Patreon's editor URL and have it wait for a background message. Use this only if CRX/Vite makes explicit injection too brittle.

### Part B — Manifest and Permission Checks

1. Ensure Chrome prod/dev and Firefox prod manifests include `"scripting"` if explicit injection is used.
2. Keep `host_permissions` scoped to Patreon and Relay only.
3. Do not add `<all_urls>`, `tabs`, or `activeTab` unless a later prompt proves they are necessary.

### Part C — Build Verification

1. Run Chrome dev build.
2. Confirm the content script artifact exists in `extension/dist/chrome-dev/`.
3. Run Chrome prod build.
4. Confirm no localhost appears in prod output.
5. Run Firefox prod build.

## Acceptance Criteria

- [ ] `cd extension && npm run build:chrome:dev` succeeds.
- [ ] Built Chrome dev output contains a deterministic injectable content script artifact.
- [ ] `cd extension && npm run build:chrome:prod` succeeds.
- [ ] `cd extension && npm run build:firefox:prod` succeeds.
- [ ] `cd extension && npm run verify:p12` still passes.
- [ ] No content script runs on normal Patreon browsing unless the chosen strategy intentionally declares a dormant script.

## Out of Scope

- Opening Patreon tabs.
- Filling editor fields.
- Fetching Relay packages or media.
- Web button implementation.

## Handoff

Delta Out:

- Exact emitted file path to inject from `background.ts`.
- Any build-config caveats for Chrome vs Firefox.
- Whether the strategy is explicit injection or dormant declared content script.

