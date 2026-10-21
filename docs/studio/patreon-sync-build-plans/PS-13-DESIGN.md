# PS-13: Verified extension checks and bounded metrics

Status: proposed, 2026-10-20. Implementation waits for PS-12 approval and supervisor handoff. [PS-13](PHASED-BUILD-PLAN.md#ps-13-restrict-the-extension-to-verified-consent-and-bounded-collection), [R13/R14](ACCEPTANCE.md), and [program execution](PROGRAM-EXECUTION.md) govern this slice. PS-12 files remain mutable; this design claims none of its pending behavior.

## Credential policy and transitions

`extension/src/lib/sync-now.ts` currently advances local success on an equal hash without contacting Relay. `storage.ts` retains that hash across grant changes. `background.ts` ignores the immediate post-consent sync result. Server `cookie-store.ts` resets `stored_at` on every upsert; expired session reads prune records, rejection deletes credentials and retains a marker, and explicit removal erases both. The current vault therefore cannot distinguish lost storage from voluntary removal.

Add authenticated, rate-limited `POST /api/v1/patreon/cookie/check` using existing account/workspace authorization. It returns server time, acknowledged credential status, and original storage age without calling Patreon, uploading credentials, clearing rejection, or renewing cookie age. Always send this check for unchanged cookies. Its acknowledgment establishes Relay storage/check status only; Patreon account identity and data-sync completion remain separate.

Use conservative recovery: missing, expired, and rejected server sessions require fresh consent. A periodic check never resurrects them. This also covers lost server storage without inventing a tombstone system. Keep `GET /cookie/status` backward compatible and pure.

Extend the existing consent exchange to optionally accept the current browser cookie, captured after the user authorizes. The verified single-use code already binds account and installation; resolve the current workspace server-side before storing. Return separate grant and capture outcomes. A missing browser cookie can leave a connected grant with capture unavailable. A failed capture must remain visible; successful grant issuance alone cannot acknowledge storage. Preserve existing clients that omit capture. Avoid logging request bodies or credentials.

For extension-origin cookie writes, permit automatic rotation only while the server record remains valid. Check eligibility and replace within the vault's existing serialized transition so deletion/rejection racing a check cannot be undone. Checks and automated replacement preserve original `stored_at`; fresh consent or the explicit manual web save starts a newly authorized capture. Keep manual fallback authorized as today. Review ordering and partial-failure behavior between capture and grant issuance before implementation; do not hide a failed write behind exchange success.

Retain the server's sliding 30-day grant authority and existing asynchronous renewal contract. Local issuance `expires_at` may be stale after renewal, so a real authenticated response decides expiry. Keep the 90-day storage limit independent of grant renewal. No new retention/tombstone schema is proposed.

## Extension state and requests

In `storage.ts`, persist credential state bound to installation ID, token ID, account, and workspace. Record local observation, server-acknowledged check/upload, and last data-sync evidence independently. Unknown data-sync time stays unknown. Migrate legacy unbound success to unknown; never reuse it to skip upload/check. Clear credential cache on grant changes without clearing posting/reminder payloads.

Serialize credential work and guard every completion against the current binding/generation, including 401 handling: an old response cannot clear a new grant or overwrite its status. Reconsent reads the current cookie, never an old upload value. Cookie removal updates observation/error state without advancing success. Bound network/body time, surface timeout/429 with retry guidance, and preserve the last valid acknowledgment separately from current failure. Keep the 12-hour credential alarm; it never opens scraping tabs.

Change `patreon-post-metrics-fetch.ts` to background-context Fetch with browser-managed `credentials: "include"`, existing host permissions, and bounded linked-post URLs. Remove manual Cookie/user-agent headers. [Chrome](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests) and [Firefox](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/host_permissions) distinguish extension requests from content-script requests; [Cookie is forbidden](https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_request_header). Installed-browser behavior still needs proof. In `external-metrics-refresh-flow.ts` and its response contracts, report captured, missing, and failed requested measures: a title, one counter, or positive snapshot count cannot establish complete capture. Preserve useful partial observations and creator-initiated page collection; add no endpoint sweep or scheduled scraper.

## Existing controls and pure reads

Operate mode: preserve `extension/src/popup.css`, existing controls, and web shells. Root PRODUCT/DESIGN concern Posting Rhythms and do not govern this popup. Follow `docs/UI_SPECIALIST_RELAY.md`, `docs/RELAY_DESIGN_CODE.md`, and UX guardrails for affected web surfaces. Impeccable context and current Web Interface Guidelines were loaded; unrelated sidecar drift remains untouched.

Minimum copy hunks: popup “Last credential check” and “Check connection”; separate grant disconnection from server-session removal; consent page distinguishes extension authorization from capture failure. Retain existing settings/manual-cookie controls. Update `messages.ts`, `web/lib/relay-extension-messaging.ts`, and the current status probe additively. PS-14 owns Library completeness presentation.

PS-13 makes `GET /cookie/status` and its session resolution pure where directly required by credential controls: inspect local status without pruning, use existing `cleanupExpired: false` session patterns, and avoid GET grant renewal. Full `getSyncState` health-read purity and relocation of proactive OAuth refresh to worker/mutation callers remain PS-14 work. Pull a broader change into PS-13 only if a necessary PS-13 caller cannot otherwise preserve the credential contract. Preserve credential maintenance in POST/jobs, consistent with `docs/qa/HTTP_VERB_HYGIENE.md`.

## Verification and limits

Add focused `tests/extension/sync-now.test.ts` and storage fixtures for unchanged hashes, server loss/removal/rejection/expiry, consent/workspace switches, stale in-flight replies, rotation/removal races, missing browser cookies, timeout/429, and original-age preservation. Extend existing `tests/extension-consent-flow.test.ts`, `tests/identity/extension-session.test.ts`, cookie auth/vault/store suites, metrics fetch/contract/merge suites, and `tests/web/relay-extension-status-probe.test.ts`. Assert cookie-status GET performs zero credential/session writes. PS-14 owns full sync-state GET and worker-refresh assertions in `tests/patreon-sync-state-watermark.test.ts` and connected suites. Retain cross-post, reminder, CORS, and production-origin regression checks.

Run focused Vitest files, root `npm run build`, and `npm run verify:phase2 --prefix extension`. Changed web code also requires focused tests, lint/build. Prepare isolated fixture rendering of the real popup with a stub browser API and web status/consent responses, without accounts: popup 320px, web 390px/1440px, long workspace/error text, keyboard focus, pending/duplicate actions, and live announcements. Preserve incumbent geometry; test only changed states. Run the scoped Impeccable detector after UI implementation.

No runtime edits, render proof, or tests occurred in this design task. PS-15 requires authorized staging Patreon plus installed Chrome and Firefox requests with valid/missing/rejected credentials. Account/campaign access is absent. Mock fixtures do not satisfy R14; PS-16+ implementation remains behind PS-15.
