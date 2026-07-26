# XPOST-09 — Background Tab Injection

## Context

After the background worker fetches and stores a backend-authorized cross-post package, it must open Patreon's post editor and inject the built content script at the right time. This row handles tab lifecycle and injection only.

## Preconditions

- [ ] `XPOST-07-content-script-build-wiring-prompt.md` shipped and documented the built script path.
- [ ] `background-cross-post-fetch` shipped or is on the same branch: `RELAY_CROSS_POST` fetches and stores a pending package.
- [ ] `storage-pending-cross-post` helpers exist.

## Goal

Implement robust tab open/load/inject behavior for the cross-post flow in `extension/src/background.ts`.

## Reference Reading

1. [`docs/EXTENSION_CROSS_POST_BUILD_PLAN.md`](../../EXTENSION_CROSS_POST_BUILD_PLAN.md)
2. `extension/src/background.ts`
3. `extension/src/lib/storage.ts`
4. Handoff from `XPOST-07`

## Implementation Steps

### Part A — Open Patreon Editor

1. Add a constant for the Patreon editor URL. Use the current best-known path, e.g. `https://www.patreon.com/posts/new`, and keep it isolated for easy future changes.
2. Open a new tab after the package has been stored.
3. Return early with a clear error if no tab id is available.

### Part B — Wait for Load

1. Register a one-shot `browser.tabs.onUpdated` listener for the created tab id.
2. Resolve when the tab status is `"complete"` and the URL is still a Patreon URL.
3. Add a timeout, e.g. 20 seconds.
4. Always remove listeners on success, failure, or timeout.

### Part C — Inject Built Script

1. Use the built JS artifact path from `XPOST-07`.
2. Use `browser.scripting.executeScript` or the polyfill-compatible equivalent available in the current extension types.
3. Return an explicit result to the Relay web caller:
   - `{ ok: true, tab_id }`
   - `{ ok: false, reason: "not_connected" | "package_fetch_failed" | "tab_open_failed" | "tab_load_timeout" | "inject_failed" }`

### Part D — Keep Secrets Out of Logs

Do not log the package body, media URLs, extension bearer token, or Patreon cookie/session values.

## Acceptance Criteria

- [ ] Background opens Patreon editor after package storage.
- [ ] Injection waits for the target tab to complete or times out cleanly.
- [ ] Listener cleanup is guaranteed.
- [ ] Relay web receives a clear success/failure response.
- [ ] `cd extension && npm run build:chrome:dev` succeeds.
- [ ] Manual smoke: with a stub content script, triggering cross-post opens Patreon and injects without service worker errors.

## Out of Scope

- Building the content script artifact (`XPOST-07`).
- Filling title/body (`XPOST-10`).
- Image upload (`XPOST-11`).
- Web button UX.

## Handoff

Delta Out:

- Patreon editor URL constant.
- Injected artifact path.
- Response union returned for `RELAY_CROSS_POST`.
- Any observed browser differences between Chrome and Firefox.

