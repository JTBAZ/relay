# Patreon sync phased implementation

Use [the program index](00-README.md) for current status, ownership, and scope. Items are planned unless marked complete. [The PS-00 baseline](BASELINE-CONTRACTS.md) records the current authority/progress contracts, fixtures, and regression ownership. Review numbers refer to the Patreon sync review in this chat; the behavior described below is the enduring specification.

## Phase 0: Confirm the baseline

### PS-00: Freeze failure cases and authority boundaries

Status: complete. See [baseline evidence and contracts](BASELINE-CONTRACTS.md). The two original fixture controls and the completed PS-05/PS-09 assertions pass. Two desired-behavior assertions remain explicitly expected failures owned by PS-12.

Dependencies: none. Review coverage: all findings.

Inspect the latest commits, the five existing import tickets, and active diffs before assigning work. Preserve Import 01's in-place parent updates. Turn the review's controlled reproductions into focused regressions in the owning items, with a shared small fixture set for a multi-page campaign, old-post edits, expired sessions, overlapping imports, and missing members. Do not introduce a new test framework.

Record the field and progress contracts needed by Phases 1 to 3: provider/creator binding, resource IDs, content revision, deletion observation, archive completion, media completeness, and server-confirmed credential checks. Reuse existing rows where they carry the required meaning; justify additions before writing migrations. No publication timestamp may stand in for archive completion or media completeness.

Exit: every reliability failure maps to one owning item and an acceptance case in [ACCEPTANCE.md](ACCEPTANCE.md). Existing state is distinguished from proposed behavior, with no duplicate ticket or unsupported provider field.

## Phase 1: Protect accepted data and credentials

### PS-01: Retain imported parent identity

Status: complete through existing Import 01, commit `7cb5c70`.

Preserve the fix in `src/ingest/canonical-store-db.ts` and its regression tests. Fresh revisions update imported posts in place. Creator-confirmed platform links, metric history, presentation, and creative-work membership remain attached. This completion does not establish concurrent-import safety or live PostgreSQL foreign-key verification.

Exit: keep the existing tests green and include a real database relationship check in PS-15. Do not implement a second preservation mechanism.

### PS-02: Serialize complete creator mutations

Status: complete through existing Import 02, commit `4098b8c`. Its completion record includes real PostgreSQL overlap/rollback evidence. PS-00 verified the current implementation and reran affected adapter tests; it did not duplicate or reclaim this work.

Dependencies: PS-00 and PS-01. Existing owner: Import 02. Review: 9.

Continue that ticket's database coordination around creator-scoped load, apply, and save, including callers outside `PatreonSyncService`. Coordinate before reading, release on failure, and keep different creators independent. A process-local Patreon lock or serialized writes alone cannot satisfy this item.

Code: `src/ingest/canonical-store-db.ts`, the `CanonicalStore` callers, and focused overlap tests. Preserve file-store behavior and global callers that must delegate safely to creator mutations.

Exit: two processes importing distinct posts for one creator retain both posts, histories, and replay markers after reload; rollback permits retry. Verify with a disposable PostgreSQL database in addition to adapter tests.

### PS-03: Resolve ownership conflicts through the existing migration ticket

Status: complete through existing Import 03, commit `c82c9ed`, after separate policy approval in its owning chat. Its ticket and runbook retain the decision and rollout requirements.

Dependencies: PS-00; serialize implementation after PS-02. Existing owner: Import 03. Review: 8.

Complete the ticket's assessment of active owners, legacy owners, ownership proof, transfer authorization, and recovery. Its proposed policy is to reject foreign-owner conflicts during ordinary imports and reserve approved transfers for an explicit migration operation. Obtain the separate policy decision required by that ticket before changing reassignment behavior.

Code after approval: cross-tenant conflict handling in `src/ingest/canonical-store-db.ts`, connected campaign binding, and existing migration fixtures. Validate the whole batch before destructive actions; a late conflict must not leave earlier writes or replay markers committed.

Exit: the approved ordinary-conflict behavior preserves both owners' content and dependent records. Any permitted legacy transfer is separately tested. No live transfer is part of this item.

### PS-04: Commit shared-media state with replay protection

Status: complete locally through [Import 04](../../../.scratch/import-persistence/issues/04-persist-shared-media-revisions-before-replay-markers.md). Fourteen new PostgreSQL cases cover both providers, reload, rollback/retry, stale snapshots, guarded-write misses, overlap, replay, URL refreshes, deletion/reactivation, storage-key fallback, and media isolation. The focused run passes 178 checks, including six expected-failure baselines for later items.

Dependencies: PS-02. Existing owner: Import 04. Review: 10. Serialize shared-file edits with PS-03 when its implementation is ready; a pending policy decision does not block this fix.

Persist accepted media revisions independently of whether their original post is refreshed. Media state, associations, and replay markers commit together. Preserve current-revision URL refresh guards, deletion/reactivation behavior, and storage-key fallback.

Code: `src/ingest/canonical-store-db.ts`, `apply-batch.ts`, and connected media replay helpers only where required.

Exit: p1 owns m1; new p2 references the same asset at m2; after reload m2 and both accepted associations survive. Failed saves retain neither m2 nor its marker. Replays and both provider lanes remain correct.

### PS-05: Publish batch events after successful saving

Status: complete locally through [Import 05](../../../.scratch/import-persistence/issues/05-publish-import-events-only-after-successful-save.md). Twelve orchestration cases and six PostgreSQL cases cover rejected application/save/commit, ownership/replay conflicts, timing, payloads, retry/replay, overlapping batches, and delivery failures. The connected run passes 219 checks, including five expected-failure baselines for later items. Publication still has a process-crash gap after canonical commit.

Dependencies: PS-04. Existing owner: Import 05. Review: 11.

Buffer this batch's events during application and release them only after the canonical save succeeds. Preserve event payloads, ordering, trace, and delivery-failure behavior for existing consumers. Do not redesign the global event bus.

Code: `src/ingest/ingest-service.ts`, `apply-batch.ts`, and ingestion orchestration tests; inspect `src/events/event-bus-db.ts` as a dependency.

Exit: rejected batches, save failures, and commit failures publish no events. Successful retry publishes accepted events; replay emits none. Document the remaining process-crash gap between canonical commit and publication. This item does not claim atomic or exactly-once event delivery.

### PS-06: Store hosted session credentials safely

Status: complete locally. See the [session-vault implementation, verification, and cutover record](PS-06-SESSION-VAULT.md). The final connected run passes 146 checks across 24 suites, including 44 PostgreSQL cases; the Windows file-symlink case is skipped because the OS denied link creation. Hosted rollout still requires the additive migration and stopped-writer cutover. No ownership-policy change is included.

Dependencies: PS-00. Review: 5. Serialize shared schema/server wiring with the active owner; independent vault work may proceed while other Phase 1 items are pending.

Add per-creator encrypted cookie persistence in the hosted database using existing encryption and account/tenant guards. Retain the file adapter for local use with coordinated mutation, atomic replacement, and errors that distinguish a missing file from unreadable or corrupt data. Hosted API and workers must read the same store. Never infer a Patreon account match solely from successful cookie storage.

Code: `src/auth/cookie-store.ts`, the existing database-store selection pattern, `src/server.ts`, `prisma/schema.prisma` and a bounded migration if needed. Keep cookie status, local maximum age, remote rejection, and voluntary deletion semantics compatible.

Provide a restartable, idempotent migration from encrypted local records. Preserve original storage age and rejected/deleted state; do not resurrect expired credentials or log cookie material. Keep the source backup until read-back succeeds. Host configuration must select the shared store before multiple instances are enabled.

Exit: simultaneous updates for two creators and updates from two processes preserve both records. Corruption never silently resets the vault. Migration can resume without extending credential lifetime; delete and rejection are visible to all instances.

## Phase 2: Keep posts and members current

### PS-07: Make OAuth requests explicit and bounded

Status: complete locally. [PS-07 evidence](PS-07-OAUTH-RELIABILITY.md) records bounded fielded requests, source-content revisions resolved under the creator lock, list-first enrichment, coordinated refresh across actual processes, and deployment limits. Production rollout remains separate.

Dependencies: Phase 1. Review: 13; supports all later sync items.

Use explicit supported fieldsets for list and single-post requests in `src/patreon/patreon-resource-api.ts`. Include supported embed metadata already consumed by the mapper. Validate sparse/null fields without inventing publication dates or interpreting missing audience information as public access. Where a reliable provider revision is absent, derive the accepted revision from normalized source content and access data, excluding transient signed URLs; retain replay compatibility.

Coordinate creator-token refresh across simultaneous server/worker operations so rotating refresh tokens are not raced. Honor rate-limit retry instructions, bound network time and retry count, and record retriable failure rather than partial success. Prefer OAuth list metadata before per-post fallback so enrichment does not scan a whole campaign after all target posts are resolved.

Code: `src/patreon/patreon-resource-api.ts`, `patreon-sync-service.ts`, `map-patreon-to-ingest.ts`, `src/auth/auth-service.ts`, and existing fetch/retry helpers. Preserve source-specific access normalization.

Exit: request tests reject fixtures that return unrequested required fields. Sparse responses fail safely; normalized content/access changes are accepted while URL renewal alone does not create a content revision. Concurrent refresh, 429, timeout, and interrupted pagination are tested.

### PS-08: Persist signed change work before acknowledging it

Status: complete locally. [PS-08 evidence](PS-08-DURABLE-CHANGE-WORK.md) records committed minimal receipts, capped coalescing, BullMQ recovery, leased execution, provider-aware retries, retention, and PostgreSQL/Redis verification. Deployment and targeted PS-09/PS-10 execution remain separate.

Dependencies: PS-07.

Replace synchronous campaign-wide webhook work and volatile member timers with durable, creator-scoped change work. Keep raw-body signature verification, opaque delivery routing, and campaign ownership checks before acceptance. Retain event type and resource identity, including member and post IDs.

Use the existing BullMQ infrastructure for execution. Persist a minimal delivery/work receipt in shared storage before returning success, and recover queued dispatch after a restart. Add only the provider-specific persistence missing from existing jobs. Queue unavailability must leave recoverable durable work or return a retryable response; it must never acknowledge a volatile timer as completed work. Minimize stored personal data and define receipt retention.

Coalesce refreshes by creator/resource with a maximum wait. Bound duplicate storage and preserve later legitimate repeated changes; a permanent payload-hash filter alone must not suppress an A-to-B-to-A transition. Keep source revision replay checks at application time.

Code: platform webhook route in `src/server.ts`, `src/patreon/patreon-webhook-platform.ts`, `patreon-member-sync-coordinator.ts`, `src/jobs/queue-names.ts`, producers, workers, and shared persistence if required.

Exit: a crash after acknowledgment and before processing loses no accepted work. Duplicate delivery, continuous events, failed dispatch, exhausted retries, and two workers are exercised. Job payloads contain opaque references, not credentials. Domain publication events remain governed by PS-05's separate durability limit.

### PS-09: Refresh the affected post and apply safe deletions

Status: complete locally. [PS-09 evidence](PS-09-TARGETED-POSTS.md) records targeted authoritative refresh, access-first persistence, shared observation fences, stable soft deletions, retained media audit references, and independent review. All 261 connected checks and the root production build pass. Live staging and deployment remain pending.

Dependencies: PS-08. Review: 1.

Use the event's post ID to refresh that post independently of the publication watermark. A post update rereads authoritative access metadata and the available media source, then uses canonical ingest. Handle signed deletions with stable replayable deletion markers and existing soft-deletion rules, preserving Relay-owned records and audit history.

Separate provider timestamps from the time Relay observed a deletion. If Patreon supplies no stable deletion time, persist the first accepted observation for retry identity. Do not turn a timeout or 403 into deletion. Test delayed/out-of-order update and delete events against current upstream state so stale work cannot reopen a deleted item or overwrite a later accepted state. A public-to-paid change must not keep serving known-stale public access while its media download waits.

Code: `patreon-webhook-platform.ts`, `patreon-sync-service.ts`, cookie detail mapping, OAuth access sync, and existing tombstone/access services. Reuse the access-only path where a full media fetch is unnecessary.

Exit: an old post's title, body, media, and audience changes converge; removal disappears from patron delivery without destroying creator overlays. Replay, access change during download failure, and missing upstream resources are covered.

### PS-10: Reconcile member changes and complete rosters

The [platform projection follow-up](PS-10-PLATFORM-PROJECTIONS.md) is independently approved locally. Atomic projections, cancellation/unlink invalidation, unresolved coverage and strict creator-scoped OAuth/refresh admission pass the affected 90 checks and independent 12 PostgreSQL plus 14 guard checks. The latest combined build passes; writer activation and release remain pending.

Status: complete locally. [PS-10 evidence](PS-10-MEMBER-RECONCILIATION.md) records targeted member work, resumable roster reconciliation, atomic entitlement/ledger acceptance, observation fences and unlink/purge continuity. All 243 connected checks, 65 independent checks, strict TypeScript and the production build pass. Legacy unverified bindings, old-writer replacement, production migration and live acceptance remain cutover gates.

Dependencies: PS-08; integrate after PS-09. Review: 6 and 7.

Process targeted member events durably, preserving member resource ID and campaign binding. For deletion, clear only the affected provider's entitlement through the existing identity path. Periodically reconcile a complete creator roster to recover missed events, independently of post publication. Preserve the separate patron OAuth stale-refresh worker and cross-provider entitlement merge.

Persist roster progress across page limits. Only a complete successful scan may interpret an absent member as removed. Failure, a partial scan, missing identity, or an unexpectedly empty response must not revoke the entire roster. Confirm campaign binding and authoritative absence for the affected members before applying anomalous mass removals. Keep identity changes and membership-event derivation consistent across retry so a ledger-write failure cannot silently lose an accepted transition.

Code: `patreon-sync-service.ts`, `patreon-member-sync-coordinator.ts`, `membership-ledger-sync.ts`, webhook registration, existing identity/snapshot services, and job scheduling. Include `members:create` where needed for the supported member lifecycle and reconcile existing registered triggers.

Exit: canceled/deleted members, missed events, more than one capped page window, continuous deliveries, and restarts converge safely. Replays neither duplicate lifecycle events nor clear another provider's tiers. Free membership never becomes paid access.

### PS-11: Resume archives and reconcile changes fairly

Status: complete locally. [PS-11 evidence](PS-11-RESUMABLE-POSTS.md) records atomic page checkpoints, resumable archive/catch-up, verified older-post reconciliation, safe file replay and persisted creator fairness. All 327 connected checks, 131 independent non-PG checks, nine independent PostgreSQL cases, seven final file checks, strict TypeScript and the root build pass. Hosted cutover and live acceptance remain pending.

Dependencies: PS-09 and PS-10. Review: 2 and the fallback limitations behind 1.

Separate initial archive progress, forward catch-up, and older-record reconciliation. Save continuation after each accepted page or bounded batch. Advance the discovery high-water mark only when the corresponding catch-up range is complete; never strand the remaining range after a page limit. Account for equal publication timestamps using stable IDs and replay checks rather than a strict timestamp-only cutoff.

Existing cursors do not prove a historical import finished. Mark their coverage unknown until verified and resume a bounded reconciliation; do not silently label them complete or perform an unbounded backfill. An upstream-newest-post probe may skip new-post discovery, but cannot skip required access checks, older edits, roster work, or media repair. Persist fairness across creator caps so the first creators do not monopolize every cycle.

Code: `patreon-sync-service.ts`, `incremental-sync-worker.ts`, `src/ingest/sync-watermark-store*.ts`, cookie pagination, `SyncCursor`, and existing job scheduling.

Exit: archives larger than the per-run cap finish over repeated runs, including browser/API restarts, same-time posts, new posts arriving during backfill, expired cursors, and legacy unknown coverage. No deletion is inferred from partial coverage.

## Phase 3: Recover media and show verified health

### PS-12: Repair media independently of post discovery

Status: complete locally and independently approved. The [completion record](PS-12-MEDIA-REPAIR.md) records durable repair, current blob/source proof, bounded reads, obsolete-work retirement and preserved provider lanes. Connected checks pass 474/474, final affected checks 56/56 and independent checks 125/125. The latest combined build passes; hosted migration, activation and live acceptance remain pending.

Dependencies: Phase 2. Review: 3 and 14.

Keep the existing download retries and Library Retry control. Add durable bounded repair work for incomplete posts and failed media, independent of the post watermark. A restored cookie makes eligible incomplete records repairable without forcing a new publication or full archive rewrite. Expired URLs trigger a targeted source refresh; export retries use the current accepted asset revision and remain tenant-scoped.

Use `loadForCreator` in `ExportService` instead of loading every creator for each asset. Preserve concurrency safety from PS-02 when recording storage keys. Extend the export index/processing state and existing jobs as needed; do not add a separate blob inventory or replace storage backends.

Exit: OAuth-only import followed by cookie consent recovers old media; an exhausted download retries later after recovery; browser closure does not stop server-capable repair. Repeated repair preserves parent identity, links, metric history, and shared assets. Failed blobs cannot produce a false complete state.

### PS-13: Restrict the extension to verified consent and bounded collection

Status: complete locally and independently approved. The [verification record](PS-13-VERIFIED-EXTENSION.md) covers 127 independent passes, one existing Windows skip, two API processes, the passing combined build and scoped UI rendering. Installed Chrome/Firefox authentication, packaging and full-web limits remain PS-15 gates.

Status: in progress under `later_reliability_scout`. Follow the [extension design](PS-13-DESIGN.md), preserving concurrent cross-post handoff changes.

Dependencies: PS-06 and PS-12. Review: 4 and 12.

Make periodic credential checks reach Relay even when the cookie hash is unchanged, preserving the 30-day sliding grant and 90-day maximum cookie-storage policy. Separate last local observation, last acknowledged credential upload/check, and last successful data sync. Scope cached state to installation, grant, and workspace. Clear or rebind it on consent changes. Capture the current browser cookie after reauthorization; do not restore a remotely rejected session from an old cached upload.

Handle grant expiry/revocation, server-side cookie removal, cookie rotation, missing browser session, request timeout, and rate limiting explicitly. A missing cookie is a visible state and must not retain a new-looking success timestamp. Distinguish disconnecting the extension grant from deleting the server's Patreon session in the existing controls and copy.

Fix extension metrics requests to use browser-managed credentials and permitted extension contexts. Keep collection creator-initiated and scoped to linked resources. A title or one available counter cannot establish completeness of the requested metrics. Do not replace this with a broad endpoint probe or scheduled tab scraper.

Code: `extension/src/lib/sync-now.ts`, `storage.ts`, `patreon-post-metrics-fetch.ts`, external metrics refresh/content scripts, `background.ts`, cookie status/consent routes, and current web status probe. Preserve posting/reminder message contracts.

Exit: grant/workspace switches upload correctly; an unchanged cookie still verifies Relay state; an idle expired grant requests consent; remote rejection does not loop. Chrome and Firefox tests demonstrate the actual authenticated request and failure states, beyond mocked fetch tests. Builds retain their current production-origin restrictions.

### PS-14: Expose completeness and targeted repair

Status: in progress, claimed by `later_reliability_scout` with independent review by `ps09_build`. Follow the [accepted design](PS-14-DESIGN.md); preserve the completed upstream contracts and concurrent Library changes.

Dependencies: PS-11 to PS-13.

Extend the existing sync-state DTO, health store, Patreon menu, and Library retry affordances. Report connection, last server-confirmed check, archive coverage, post/access freshness, member progress, media pending/failures, and next repair action separately. Keep existing clients compatible. A watermark or local extension timestamp cannot imply a complete sync.

Server health uses persisted results from webhook work, reconciliation, and repair. Reads stay side-effect-free; explicit retry/refresh actions use mutations. Show pending, partial, stale, unavailable, and failed states with their owning action, without turning missing information into zero. Reuse current surfaces and permissions; no new dashboard is required.

Exit: the creator can repair one failed item or credential problem without resyncing the Library. Partial imports and old healthy-but-stale records remain visible. Changed controls pass desktop/mobile rendering, keyboard/focus, error, and duplicate-action checks.

### PS-15: Prove and release reliability

Dependencies: PS-01 to PS-14 complete, including the approved ownership policy in PS-03.

Run acceptance R01 to R16 in a disposable database/Redis environment and an authorized staging Patreon connection. Keep saved evidence tied to a commit and configuration. Exercise two API/worker processes, restart after acknowledgment, credential rotation, download recovery, and old-post paywall/deletion behavior. Use test-owned campaigns/content for provider mutations.

Roll out to a bounded creator cohort with explicit stop/recovery controls. Pause affected processing on isolation failures, false completion, or lost acknowledged work. Retain receipts/cursors for replay. Database/schema rollback must not restore the old destructive writer against newly accepted data.

Exit: reliability cases pass and the rollout record names remaining external limits. Phase 4 may begin. If provider/browser access is unavailable, keep those acceptance cases open and continue independent work; do not call the reliability release complete.

## Phase 4: Collect useful evidence

### PS-16: Preserve measurement meaning and freshness

Dependencies: PS-15.

Extend the existing snapshot/CSV contracts with source observation time, provider-update time, reporting window, channel, aggregation kind, unit/currency where applicable, and coverage when those facts are supplied. Missing timestamps remain unknown. Refreshing an old observation does not make its source data fresh.

Use `ExternalPostMetricSnapshot`, `PatreonInsightsImport`, and current rollups; add fields only where existing JSON cannot support necessary querying or validation. Retain source precedence from the performance vocabulary. Distinguish private website API collection from the documented OAuth API in evidence without silently renaming persisted source values. If that distinction requires a taxonomy change, amend the owning vocabulary and migrate callers explicitly.

Exit: snapshots of cumulative totals, daily deltas, and period totals cannot be summed together or assigned invented daily dates. CSV overlapping windows and different channels do not double-count. Zero remains distinct from absent, failed, or unsupported.

### PS-17: Capture conversions and improve bulk CSV history

Dependencies: PS-16. Highest-value new collection item.

Extend the existing Patreon performance-panel parser and CSV importer for verified available fields: new paid memberships, free-member growth, purchases, attributed revenue, and available consumption measures. Save units, windows, currency, and Patreon attribution meaning. Capture provider-update timestamps already requested by the metrics fetcher. A creator's observed payload/export must establish availability before a field becomes supported.

Make metric columns optional where a valid export supplies other supported measures. Preserve post-identity validation, limits, file-hash idempotency, and creator-scoped linking; report row/column omissions without silently accepting an empty import. Retain unmatched observations for later linking without merging posts by title. Keep existing imports with all four metric columns compatible.

Code: `extension/src/lib/patreon-metrics-parser.ts`, `patreon-post-metrics-fetch.ts`, `src/analytics/patreon-insights-csv.ts`, `src/distribution/external-post-metrics-service.ts`, schema/rollups as required, and the existing CSV upload surface.

Exit: panel/CSV fixtures cover available and unavailable measures, localized numbers/currency, partial captures, duplicate uploads, unmatched posts, and overlapping windows. Patreon-reported revenue cannot be counted again as a separate Relay support event. Unsupported fields remain explicitly unavailable.

### PS-18: Retain member lifecycle evidence

Dependencies: PS-16 and PS-17; PS-10 remains authoritative for access.

Request supported member fields needed for charge state, next charge, trial/gift state, and campaign support history. Prefer `campaign_lifetime_support_cents` over the deprecated lifetime field where supported. Preserve provider identity using stable opaque IDs even when email/name is masked. Resolve currency from the campaign or verified source; do not assume USD.

Keep current entitlement separate from payment and acquisition evidence. Do not infer a payment, join date, or cause of cancellation solely from current tier membership. Retain first-observed and provider event times separately. Extend existing membership events/records with bounded privacy-aware retention; do not put patron identities into Coach facts or prompts.

Exit: free-to-paid, trial-to-paid, gifts, upgrades, payment trouble, cancellations, rejoining, masked identities, and repeated scans produce truthful, non-duplicated evidence without changing access semantics. Historical imports do not pretend to reconstruct unobserved transitions.

### PS-19: Retain useful media and post metadata

Dependencies: PS-16 to PS-18; reuse media persistence from PS-04 and PS-12.

Retain verified original filename, file size, dimensions/duration, role, post type, tags, and source ordering when returned. Preserve provider asset identity separately from rotating download URLs. Distinguish cover/attachment relationships and renditions under the existing canonical media contract. Keep downloaded checksums where the export path already produces them; use them for evidence, not automatic work merging.

Code: cookie/OAuth mappers, media finalization, ingest types, canonical persistence, export manifests, and existing metadata readers. Preserve bounded sizes and sanitize any text later shown in UI.

Exit: reload and replay retain metadata and ordering, absent fields do not erase known authoritative values without an explicit source clear, and signed-URL renewal changes neither content identity nor creator presentation. Metadata-only updates do not force downloads or duplicate revisions.

## Phase 5: Use the evidence in existing products

### PS-20: Improve Library search and review

Dependencies: PS-17 and PS-19.

Use retained filenames, types, tags, and completeness in existing Library search, filters, item details, and exports. Expose the source and last verification alongside repair actions from PS-14. Fit new controls to the current design system and mobile Library.

Use existing Creative Work/Platform Instance relationships for cross-platform comparisons. Duplicate or related-work suggestions require creator confirmation; metadata similarity cannot auto-merge canonical records. No second inventory or new navigation section is needed.

Exit: creators can find an older asset, distinguish its source metadata from Relay overrides, inspect missing media, and export a useful manifest without losing their curation.

### PS-21: Feed trustworthy evidence into Coach and Goal Cycle

Dependencies: PS-17 to PS-20.

Extend existing evidence/fact readers to explain which work attracts free members, produces Patreon-reported paid support, or merits another promotion. Keep Patreon-reported attribution distinct from Relay's `deterministic`, `estimated`, and `insufficient` results. Display compatible windows, sample size, freshness, and coverage before making comparisons.

Reuse `src/analytics/goal-cycle-attribution-service.ts`, the existing outcome services, and [the conversion contract](../../analytics/CONVERSION_ATTRIBUTION.md). Preserve its thresholds and creator-local windows. Free joins and clicks remain funnel evidence; no additional deterministic conversion follows from a scraped total. Creator confirmation remains necessary for scheduling/publishing changes.

Exit: sparse, stale, unsupported, mixed-currency, or incompatible-window evidence produces a qualified result or insufficient evidence. No patron identifiers enter model facts, and replay/backfill does not inflate an outcome already counted elsewhere.

### PS-22: Release metadata and product improvements

Dependencies: PS-16 to PS-21 and evidence cases E01 to E07.

Release the smallest supported field set first, then enable dependent views only where coverage exists. Verify source-specific fallbacks, existing CSV and analytics readers, accessible desktop/mobile behavior, and provider schema drift. Disable a broken parser or affected measure without stopping OAuth access sync, media repair, or existing publishing.

Exit: each visible measure has verified provenance, units/window, freshness, and an unavailable state. Use the existing goal outcome/audit surfaces to evaluate usefulness; do not add unrelated telemetry infrastructure.

## Review traceability

| Review finding or opportunity | Owning work |
|---|---|
| 1. Old post updates/deletions | PS-08, PS-09, PS-11 |
| 2. Page-limit archive loss | PS-11 |
| 3. Missing media after recovery | PS-12 |
| 4. Unverified extension success | PS-13, PS-14 |
| 5. Concurrent cookie loss | PS-06 |
| 6. Volatile member timers | PS-08, PS-10 |
| 7. Absent members not reconciled | PS-10 |
| 8. Foreign-owner reassignment | Existing Import 03 / PS-03 |
| 9. Competing creator snapshots | Existing Import 02 / PS-02 |
| 10. Shared-media state skipped | Existing Import 04 / PS-04 |
| 11. Events before save | Existing Import 05 / PS-05 |
| 12. Browser metrics authentication | PS-13 |
| 13. Missing explicit OAuth fields | PS-07 |
| 14. Global loads per media export | PS-12 |
| Already fixed parent deletion | Existing Import 01 / PS-01; regression protection in PS-15 |
| Conversion evidence and bulk history | PS-16, PS-17, PS-21 |
| Member lifecycle | PS-10, PS-18 |
| Rich asset metadata and useful Library views | PS-19, PS-20 |
| Source freshness and actionable completeness | PS-14, PS-16 |
