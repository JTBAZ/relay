# Posting Recipes — phased build plan

**Revision 8 · 2026-10-19 · proposed backlog.** Destination-first Studio sheet rows, whole-recipe chooser, reusable-first save flow, working-draft recovery and mobile action cards; timing and execution boundaries retained. Supersedes the fixed two-row program. No production work is claimed/implemented by this document. Read [contract](PRODUCT-CONTRACT.md), [grounding](CODEBASE-MAP.md) and [acceptance](ACCEPTANCE.md).

## Sequence and release boundaries

`D0 revised contract/demo → P0 contracts → P1 accounts/filters → P2 persistence/enrollment → P3 route preparation → P4 receipts/progression → P5 progressive UI → P6 notifications/integration → R1`

Optional follow-ups: `P7 API delivery/background render → P8 remote review → P9 cancellation windows`. Each is separately gated; none is implied by Default or Always on. R1 enables flexible configuration over narrow adapters, not every connected-social feature.

## D0 — this design handoff

Deliver revised documents and [standalone HTML](demo/recipe-editor.html): trigger/account choice, removable filter chips and match test, connected release accordions (one active), up to 16 supported routes, separate treatment checkboxes/settings, account handles, dedicated description editing, persistent save entry, final notification/confirmation choices, independent Default/Always-on settings and a responsive execution simulator. Includes working-draft recovery and reversible removal/reset. No backend calls, real account connections, model calls, publishing or emails.

## P0 — freeze additive contracts and baselines

| ID | Scope | Exit evidence |
| --- | --- | --- |
| PR-001 | Refresh live Production Ledger/Session Lock and inspect adjacent conversational-plan working-tree changes | Baseline revisions/failures recorded; no invented Airtable record IDs |
| PR-002 | New `posting-recipe-contract.ts`: trigger account/filters, stable route IDs, 1–16 rows, anchors, media/base-description modes, optional Coach flag, per-route custom text, destination account IDs, final usage/notification choices, explicit month-boundary timing union | Same limits on UI/server; source-relative routes can vary freely; dependent route destination subset and earlier-only constraints validated |
| PR-003 | Freeze ownership, immutable fingerprints and canonical rule-run/plan/attempt correlations | No second mutable execution ledger; one-shot consumption and per-context Default uniqueness keys specified |
| PR-004 | Shared filter matcher and explicit elapsed-day / local-clock / first-last month-boundary modes; inspect `calendar-resolver.ts` reuse | Literal `$relay`, host/segment boundaries and AND semantics; default +24h across DST; explicit clock gap/fold and +0 clamp fixtures; leap years/year rollover; anchor-relative current/next month; past-relative target blocks only affected action; preserve existing clock configurations |

API surface: creator-scoped recipe/account-capability/history/saved-description GETs; pure dry-run matching; POST saved-description create/version (never publish), plan confirm, recipe save/activate/pause/resume/archive and action recovery; version-checked PATCH config/default. Existing approval/handoff/complete endpoints gain validated action correlation. GET never materializes, consumes a review token, changes Default, or sends.

## P1 — account capabilities and filtered discovery seam

| ID | Scope / current files | Exit evidence |
| --- | --- | --- |
| PR-101 | Extend `connected-platforms-service.ts` with actual creator account identity and capability adapter | Source/target eligibility independently evaluated; extension presence does not masquerade as verified account connection; no unsupported Instagram source |
| PR-102 | Pure normalized publication/filter matcher and read-only sample adapter | Title/body/caption normalized; media eligibility independent of filter match; exact host boundaries; match/non-match reason stable |
| PR-103 | Establish destination account binding for guided X/DeviantArt handoffs | Account context displayed/rechecked; unsupported verification represented honestly; disconnect blocks only affected actions |

**Gate:** AC-01–04, AC-24–25. No new external connector or expanded OAuth scope is assumed. R1 account binding is a prerequisite for offering destination chips.

## P2 — versioned recipes, one-shot plans and durable enrollment

| ID | Scope / likely files | Exit evidence |
| --- | --- | --- |
| PR-201 | Prisma recipe/revision/copy/enrollment/account-route correlations; new migration | Creator/tenant ownership and unique recipe/source identity; additive legacy compatibility; RLS/read-check per repository instructions |
| PR-202 | Service/routes for saved/selectable/Default/Always-on modes, expected-version patches | Save alone creates no execution; Default alone preselects; scoped default replacement explicit; Always on enrolls with review authority unchanged |
| PR-203 | One-shot selected-artwork or next-match consumption | Target explicit; next match consumed transactionally once; same recipe/source one-shot and Always on reuse enrollment; explicit repeat plans stay distinct |
| PR-204 | Extend canonical discovery ownership routing with activation windows, source-original-publication identity, pagination/cursor and lineage guard | >100 posts drained after restart; no historic edit/backfill trigger; rule scans skip recipe-owned rows unless coordinator invokes them; feedback loops suppressed |
| PR-205 | Create/get `CreatorDistributionRuleRun` per enrollment/route/destination with stable action key | Pinned revision/source/copy/config; source-relative actions scheduled; predecessor-relative actions wait without invented dates; pause/archive retained |
| PR-206 | Creator-owned saved-description library with immutable versions and explicit draft selection | Create/preview/edit-as-new/cancel; no sibling or pinned revision mutation; tenant checks; bounded name/text/count validation; save has no execution side effect |

**Gate:** AC-05–09, AC-15–17, AC-26. Preserve legacy discovery and one-rule `CreatorAutomation`. No use of latest-only/one-awaiting selection for recipes.

## P3 — scoped preparation and reviewed copy

| ID | Scope / current files | Exit evidence |
| --- | --- | --- |
| PR-301 | Scope plan creation, revision and lookup in `post-distribution-service.ts` | Multiple recipe/routes plus legacy and conversational plans coexist without archiving or selecting siblings |
| PR-302 | Extract shared materializer inputs from `automation-materializer.ts`; Original/Preview paths | Frozen original ID; preview export required only on preview route; no source-latest fallback or preview failure → full image fallback |
| PR-303 | `media-binding.ts`, `distribution-package.ts`, extension transport accept exact route/action/account scope | Approved copy/image/account carried into package; cross-creator/mismatched action denied |
| PR-304 | Reuse `posting-assistant-service.ts`: original/saved/custom base descriptions plus optional Coach, goals and entitlements | Saved/custom bypass LLM unless Coach explicitly enabled; custom values isolated per route; immutable base feeds a candidate per destination generated once; creator acceptance/fingerprint persisted; retry uses accepted copy; no unrequested timing changes |
| PR-305 | Shared Previewizer adapter and explicit source-specific crop | Template snapshot retained; export/upload ordering; only identical snapshots share preview; current template parser stays authoritative |

**Gate:** AC-10–12, AC-18, AC-27. Run media-binding, identity and Previewizer regressions and affected Coach suites.

## P4 — receipts, dependencies and recovery

| ID | Scope | Exit evidence |
| --- | --- | --- |
| PR-401 | Strict recipe receipt projection from canonical attempts; required valid URL for manual confirmation | Handoff/fill/legacy-completed cannot unlock routes; attestation labeled; first accepted anchor immutable |
| PR-402 | Atomic receipt → matching-destination dependent action scheduling | Any earlier route can anchor; independent source routes continue; duplicate/out-of-order receipts create no duplicates |
| PR-403 | Existing rail/manual-event/reminder services with recipe/route/action context | Needs preview/review/confirmation/blocked distinguishable; no second rail source family |
| PR-404 | Pause, archive, skip, cancel, expiry, prepare-again and uncertain-outcome reconciliation | 72h review TTL excludes long waits; skip follows dependency edges only; no duplicate successful siblings; archive records late receipts without progression |

**Gate:** AC-13–19, concurrency/restart evidence, legacy completion behavior unchanged. Browser evidence later verifies real third-party editor behavior.

## P5 — progressive route editor and final choices

| ID | Scope / likely files | Exit evidence |
| --- | --- | --- |
| PR-501 | Recipes tab in existing Automations surface; whole-recipe chooser above source/filter/release editor; new `PostingRecipeEditor` and API client | Existing presets/deep links/gates preserved; templates load complete editable configurations, creator-owned saved revisions remain distinct from route details; no parallel production app |
| PR-502 | Trigger-first filter tray, removable chips, shared-match dry run | Only capable accounts; failed filter reason; valid trigger reveals routes while preserving edits |
| PR-503 | Platform logo/handle tags lead each release and remain editable when collapsed; one right-side Details disclosure opens delay/calendar → independent Teaser/Coach checkboxes/settings; dedicated original/edit/saved Description region | Four first/last month boundaries; no full-width timing tray; Edit original disabled without source text; saved library preview/edit-as-new/create/cancel; And then defaults to prior receipt and matching destinations; stable dependency protection and visible non-default timing |
| PR-504 | Persistent Save recipe entry → final timezone/review/notification/name/Default/Always-on; secondary Confirm plan path | Confirm target explicit; no save/default auto-activation; final acknowledgement invalidated on material edit; later authority modes disabled |
| PR-505 | Studio sheet hierarchy, readable 14px forms/40px controls, rounded geometry, release insertion/reveal motion, keyboard focus, working-draft recovery/Undo and reduced motion | No popup wizard or browser alerts; focus/context preserved; mobile fields and simulator actions stack without panning; inline error and concise Undo toast behavior; active release/settings changes never dirty the configuration |

**Gate:** AC-20–23, AC-28. Browser-review filtered intake → 3 routes → one-shot vs saved Default/Always on → review-first handoff. Run targeted web tests and web build, plus applicable repo verification for production edits.

## P6 — summaries, integration and R1 rollout

| ID | Scope | Exit evidence |
| --- | --- | --- |
| PR-601 | Verified creator recipient eligibility + consent + summary/attention outbox; reuse `createEmailSender` | Current consent checked; log provider Preview; attention notice distinct from completion; email retry never reposts |
| PR-602 | End-to-end fixtures and human X/DeviantArt editor review | Filter precision, >100-source backlog, 3+ routes, independent receipts, original/preview/source/saved/Coach fidelity, failures and duplicates |
| PR-603 | Flag-off runbook, metrics, rollback, migration/Supabase read checks | `RELAY_FEATURE_POSTING_RECIPES` proposal default off; Autopost/Coach entitlements and legacy flags preserved; email configured/proven before offering real delivery |

**R1 gate:** all R1 AC cases pass with actual command/environment/revision evidence; root/web builds and required project checks pass or failures explicitly dispositioned. Human release owner enables under existing rollout process. D0 is not production signoff.

Rollback disables enrollment/preparation/handoff, preserves read-only history and already-issued receipt reporting, and leaves legacy presets intact. Never delete media or external posts. Suppress unsent mail per release config; do not label a log transport as production email.

## P7 — capable API delivery and restricted background rendering (R2)

- PR-701: Capability contract plus explicit per-route/destination/revision standing permission and immutable payload fingerprints. No unattended Coach candidates.
- PR-702: Upgrade Bluesky from current text-only source-package publishing to approved variant copy/image/account execution, upload and correlated receipt. Initial subset may be original-only.
- PR-703: Stable external identity or reconciliation after remote-success/local-timeout; last-moment permission/cancel recheck; auth/ownership expiry and delivery kill switch.
- PR-704: Allowlisted Previewizer renderer, explicit fit/crop or source-approved selection, storage/hash/idempotent cache, visual parity evidence. Missing/failed preview pauses for review; never substitutes original.

**Gate:** image/copy/account fidelity and no duplicate publication after restart/timeout. Unsupported destinations remain guided manual. No unattended browser final clicks. New source/target connectors need their own capability proof; an Instagram selector is not that proof.

## P8 — remote review (R3a)

- PR-801: Compact mobile review showing concrete payload/account/action; distinguish approve-and-send from confirm-already-published.
- PR-802: Authenticated short-lived replay-protected POST, action/payload fingerprint, expired/changed/already-resolved states; GET is read-only and does not consume token. Test link scanner/forwarded link, stale payload and repeated clicks.
- PR-803: Email deep link/notification integration, provider receipt and consent resolution. Remote sending requires P7 API capability; extension-only routes open manual review/handoff instead.

**Gate:** remote review cannot approve a different payload or user, and email-open/GET cannot cause publication.

## P9 — cancellation window (R3b)

- PR-901: Separate standing opt-in permission, window duration bounds, final-payload fingerprint and recorded notice-provider acceptance. Specify delivery allowance/lateness budget before enabling.
- PR-902: Durable wait/deadline, serialized stop vs send claim, final authorization check, in-flight cancellation limitation and status projection.
- PR-903: Failed/unknown notice, changed copy/media, revoked auth/permission and prolonged worker outage hold for review. A complete new window is required after re-preparation.

**Gate:** cannot publish merely because email was opened or because a stale deadline passed; missed notification and stop/send races have tested outcomes. This phase is not required for flexible R1 recipes.

## Deferred

Other source adapters, multi-image/video, dynamic copy variables, OR groups, arbitrary calendar-month offsets/recurrence beyond the four bounded month boundaries, transformations of prior renders, graph canvas, social actions, live trends and conversion-driven rules require explicit follow-up scope. Keep R1 operation vocabulary small while permitting users to arrange supported routes freely.
