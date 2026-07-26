# Extension cross-post prompts — index

**Parent plan:** [`docs/EXTENSION_CROSS_POST_BUILD_PLAN.md`](../../EXTENSION_CROSS_POST_BUILD_PLAN.md)
**Related extension plan:** [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md)

This folder contains bespoke builder prompts for the high-risk slices of the Relay extension cross-post bridge. The remaining smaller items live in the parent plan and can be handled as inline checklist work.

---

## How to Use This Folder

Each file is a standalone, claimable build prompt. Builders should:

1. Read the claimed prompt and the referenced source files.
2. Confirm preconditions.
3. Keep the scope narrow; do not pull future work into the claimed item.
4. Run the listed acceptance checks.
5. Leave a short handoff noting contracts, paths, and any test gaps.

Do not click Patreon's final publish button during manual testing unless the prompt explicitly says the operator is using a disposable test post/account. The extension's v1 behavior stops at form filling and creator review.

---

## Bespoke Prompts

| # | File | Goal | Depends On |
|---|---|---|---|
| 03 | [`XPOST-03-backend-package-query-prompt.md`](XPOST-03-backend-package-query-prompt.md) | Query Relay post/version/media and enforce owner scope | cross-post types |
| 04 | [`XPOST-04-backend-package-route-prompt.md`](XPOST-04-backend-package-route-prompt.md) | Add owner-authenticated package endpoint | 03 |
| 07 | [`XPOST-07-content-script-build-wiring-prompt.md`](XPOST-07-content-script-build-wiring-prompt.md) | Emit injectable content script artifact | manifest scripting |
| 09 | [`XPOST-09-background-tab-injection-prompt.md`](XPOST-09-background-tab-injection-prompt.md) | Open Patreon editor and inject the script | 07, background fetch |
| 10 | [`XPOST-10-content-script-title-body-fill-prompt.md`](XPOST-10-content-script-title-body-fill-prompt.md) | Fill title/body reliably and show review banner | 09 |
| 11 | [`XPOST-11-content-script-image-best-effort-prompt.md`](XPOST-11-content-script-image-best-effort-prompt.md) | Best-effort Relay image upload/paste fallback | 10 |

---

## Master-only items and verification

| # | ID | Artifact |
|---|---|---|
| 12 | `web-extension-id-messaging` | `web/lib/relay-extension-messaging.ts` |
| 13 | `web-cross-post-button` | `PublishToPatreonButton` |
| 14 | `store-copy-permissions` | `extension/store/{chrome,firefox}/` |
| 15 | `docs-phase-8` | [`EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) Phase 8 |
| 16 | `e2e-manual-checklist` | [`XPOST-16-e2e-manual-checklist.md`](XPOST-16-e2e-manual-checklist.md) |

**Manual E2E:** Run item **16** before store submission. Includes tier-gated publish workaround, text/image checks, manual audience review, and CORS verification from the master plan **Return to** section.

---

## Post-v1 follow-ups (document only — not blocking v1)

| Topic | Where documented |
|---|---|
| Audience/tier reverse-apply from synced Patreon catalog | Master plan **Return to** + E2E checklist |
| Package route CORS in production | Master plan **Return to** + E2E checklist |
| Canonical image placement preference | `EXTENSION_BUILD_PLAN.md` Phase 8 §8.E |

---

## Cross-Post Invariants

1. Relay web sends only `relay_post_id` to the extension.
2. Backend assembles the Patreon package after extension bearer-token ownership checks.
3. Text fill is required; image attach is best-effort for v1.
4. Extension never clicks Publish.
5. No raw Patreon cookie, Relay extension bearer token, or `relay_session` is displayed or logged.
6. Use `webextension-polyfill` via `extension/src/lib/browser.ts` for extension code.
7. Keep Chrome production bundles free of localhost references.

