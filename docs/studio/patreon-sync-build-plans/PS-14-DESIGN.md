# PS-14: Persisted completeness and targeted repair

Status: proposed, 2026-10-21. Implementation waits for reviewed PS-10 follow-up, PS-12 and PS-13, then supervisor handoff. [PS-14](PHASED-BUILD-PLAN.md#ps-14-expose-completeness-and-targeted-repair), [R15/R16](ACCEPTANCE.md), and [program execution](PROGRAM-EXECUTION.md) govern this slice. [PS-13](PS-13-DESIGN.md) owns credential check/capture/cache, cookie-status purity and bounded metrics. This proposal claims no pending implementation complete.

## Read boundary and callers

[getSyncState](../../../src/patreon/patreon-sync-service.ts) currently refreshes OAuth, fetches campaigns, calls the pruning cookie getter, and conditionally clears rejection. The [HTTP handler](../../../src/server.ts) therefore cannot serve persisted health independently of Patreon availability. Make the ordinary service/HTTP read use authorized persisted creator/campaign binding, token health, cookie local status/rejection, progress and results. Add no credential rotation, session cleanup/renewal, repair seeding, leases, queue dispatch or blob publication. Use existing readonly session patterns, private/no-store responses and current creator authorization. Missing binding stays actionable unavailable; never select an arbitrary campaign or infer ownership from a query value.

Move upstream probing and proactive OAuth refresh into a separately named worker/mutation path. The [incremental worker](../../../src/patreon/incremental-sync-worker.ts) is the sole production service caller besides the HTTP handler; preserve its existing bounded probe and maintenance before provider work. Its newest-post match still cannot suppress unfinished archive, reconciliation or repair. Scrape, targeted refresh, member sync and access mutations already refresh OAuth; preserve those contracts. A UI refresh reads saved health. Explicit provider verification uses an authorized POST and records its own result.

Keep accepting legacy `probe_upstream` queries, but return persisted probe evidence with its observation time/availability; opening the menu cannot trigger a new check. Update [web API readers](../../../web/lib/relay-api.ts), menu, parity tooling, Previewizer and Schedule Rail consumers together. Preserve existing valid-response fields; define and test an additive unavailable response for missing tokens/binding before removing current 404 handling. Do not fabricate a healthy legacy OAuth object to satisfy its required type.

## Truthful persisted evidence

Extend [health types/adapters](../../../src/patreon/patreon-sync-health-store.ts), [DB adapter](../../../src/patreon/patreon-sync-health-store-db.ts), [web DTO](../../../src/patreon/sync-health-web-dto.ts) and client types additively. Keep each lane's availability, coverage, last attempt, last accepted verification, safe error and next action separate. Failed later attempts preserve prior verification time. A row timestamp, scheduled due time or webhook receipt is not successful verification.

Reuse existing authorities:

- Connection: OAuth signals and PS-13's server credential acknowledgment; storage acknowledgment never proves Patreon identity or data completeness.
- Archive/catch-up: [post progress](../../../src/patreon/post-sync-progress.ts) statuses and accepted pages. Add a read-only progress getter to both adapters; never call `claim` to inspect. Progress currently lacks lane completion time: record that at accepted terminal checkpoints or display unknown, never substitute publication time.
- Posts/access: accepted targeted/reconciliation results plus access-only results. Persist source, bounded scope and completion time where absent. One verified post cannot establish whole-campaign freshness.
- Members: [roster state](../../../src/patreon/member-reconciliation.ts) phase, last completed scan, pending verification and unmapped legacy coverage. Consume the frozen PS-10 correction; expose no member identities.
- Media: PS-12's [repair state](../../../src/export/media-repair-store.ts), current-head source proof and accepted blob proof. Separate unknown/partial collection, verified empty, pending downloads and failed/waiting items. Counts describe the inspected scope; unscanned records cannot become zero pending.

Use existing state JSON and authoritative work rows before proposing schema. Persist only missing evidence at its owning acceptance boundary, guarded by campaign/head/generation; health-write failure leaves unknown/stale state. Bound creator-scoped aggregate queries, exclude superseded/deleted work, and expose incomplete aggregation explicitly. File mode retains supported reads/manual repair and reports unavailable shared-worker evidence. Corruption/read failure cannot manufacture healthy empty state.

The existing rollup also gates edits through [creator-sync-writable](../../../src/patreon/creator-sync-writable.ts) and client helpers. Preserve that admission policy deliberately: new partial/archive/media attention must not automatically become legacy degraded/failed or block all editing. Return separate attention/completeness information and test server/client agreement.

## Existing UI and actions

Operate mode, existing Library identity. Use [PatreonSyncMenu](../../../web/app/components/PatreonSyncMenu.tsx), [banner](../../../web/app/components/SyncHealthBanner.tsx), [GalleryView](../../../web/app/studio/GalleryView.tsx), [tile](../../../web/app/components/GalleryGridTile.tsx) and [presence-card](../../../web/app/components/ActivePostPresenceCard.tsx) controls. Show concise connection, archive, access, members and media rows with verified time and owning action. Unknown, pending, partial, stale, unavailable and failed remain distinguishable in text. Retain previous data during refresh failure; never hide stale health as an empty success.

Reuse existing reconnect/manual-cookie links, member/access POSTs and single-media export Retry. Where a failed source/change item needs a new retry seam, add the smallest creator/resource-scoped POST around existing durable work. Recheck current ownership/head/generation, respect backoff and deduplicate queued/running work. A click acknowledges repair acceptance; completion appears only after persisted evidence. GETs enqueue nothing. PS-12's next bounded ordinary sync or sixty-second job seeds recovery after cookie consent; capture itself starts no inline repair. Preserve that behavior, and keep health checks pure.

Keep layout/tokens and existing curation, entitlement, posting/reminder and native/provider contracts. PRODUCT/DESIGN describe Posting Rhythms; [Relay design code](../../RELAY_DESIGN_CODE.md), UI specialist and UX guardrails govern these Library surfaces. Impeccable context was loaded earlier; current Web Interface Guidelines were fetched for this preparation. Unrelated design-sidecar drift remains untouched. Do not redesign Library or mount conversation/Previewizer controls. External Library PCB work shares server/storage/UI seams: reread its latest accepted state and capture only owned hunks after runtime ownership transfers; never overwrite concurrent edits or message its chat.

## Verification and remaining decisions

Extend `tests/patreon-sync-state-watermark.test.ts`, `patreon-sync-health.test.ts`, `sync-health-web-dto.test.ts`, `http-verb-hygiene.test.ts`, `incremental-autosync-worker.test.ts`, `patreon-oauth-proactive-refresh.test.ts`, and relevant PS-10/11/12 suites. Assert zero writes/provider calls on ordinary GET, expired-token reads, unavailable dependencies, stale/mixed coverage, cross-creator denial, retries, restart and late-generation results. Extend web banner/write-gate tests and component interactions.

Render real changed components through an isolated local fixture with mocked DTO/action responses, no accounts: 390px/768px/1440px widths, 320px constrained menu, 200% zoom, long labels/errors, stale snapshots and unavailable counts. Verify Tab/Shift+Tab, Enter/Space, Escape/close focus return, live announcements, visible focus, scroll bounds, retry failure and duplicate clicks. Batch corrections, then rerender affected states; run scoped Impeccable detector. No Storybook or parallel component system.

Later checks: focused Vitest, root build, relevant web tests, web lint/build and scoped Ponytail Review. Every DB-capable command must name an explicit private disposable target and required opt-ins; never load dotenv defaults. Await frozen upstream signatures, unavailable DTO compatibility and scoped freshness thresholds before coding.

Only this design is written. No runtime/schema/test edits, render proof or account/provider operations occurred. PS-15 retains authorized staging Patreon and installed Chrome/Firefox proof, restarts and bounded rollout; connected staging alone does not satisfy it. PS-16+ remains behind PS-15. Ownership policy and deferred Escape Hatch remain unchanged.
