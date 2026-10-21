# PS-11: Resumable discovery and fair reconciliation

Status: proposed, 2026-10-20. This is a read-only design handoff; implementation waits for PS-10 approval and an explicit supervisor handoff. [PS-11 requirements](PHASED-BUILD-PLAN.md#ps-11-resume-archives-and-reconcile-changes-fairly), [R11](ACCEPTANCE.md), and [PS-09's accepted boundaries](PS-09-TARGETED-POSTS.md) govern implementation. PS-10 owns member reconciliation and its independent scheduling.

## Existing gap

The [collector](../../../src/patreon/patreon-sync-service.ts) and [cookie paginator](../../../src/patreon/cookie-scraper.ts) restart at the head, stop at `published_at <= watermark`, discard continuation after their page cap, and advance the watermark to the newest accepted post. The [worker](../../../src/patreon/incremental-sync-worker.ts) can skip the whole scrape after a newest-post probe and repeatedly selects the first capped creators. [SyncCursor](../../../prisma/schema.prisma) stores only `lastSyncedAt` and `updatedAt`; neither proves archive coverage.

## Durable state

Extend `SyncCursor` and the [watermark interface](../../../src/ingest/sync-watermark-store.ts) with versioned post-progress state, keeping existing getter/DTO meanings compatible. Make `lastSyncedAt` nullable so a new progress row needs no invented publication timestamp. Legacy non-null timestamps remain discovery observations with archive coverage `unknown`.

Store separate archive and catch-up states: pass/generation, status, source, validated continuation, start/completion time, accepted-page count, candidate maximum publication/ID, and last accepted boundary IDs. Bound boundary storage to one page. Store reconciliation's canonical-ID continuation and next due time separately. Retain the last completed discovery watermark while another pass is partial. Add a short renewable progress lease with an ownership token; expired or superseded workers cannot checkpoint another execution.

Use one small shared scheduler-cursor row for creator selection. Fairness spans creators and has no truthful creator/campaign key, so it should not be hidden in a synthetic `SyncCursor` identity. Apply RLS and revoke browser-role access to new progress/scheduler storage.

## Page acceptance

Fetch outside transactions. Capture PS-09 expected states before each page request, validate campaign/resource identities, and accept through current-snapshot canonical ingest. Commit the page's continuation and generation change with its canonical data under the existing creator transaction. Add a narrow typed checkpoint command to the canonical mutation boundary; do not nest independent Prisma transactions or hold the lock during HTTP/export.

A rejected page, stale PS-09 comparison, or failed checkpoint leaves the previous continuation intact. After a crash, repeat collection from that checkpoint and use existing revision replay. Advance progress after canonical acceptance, independently of blob downloads; media completeness remains PS-12. Keep PS-05's event-publication crash limitation explicit.

Use OAuth pagination for discovery. Enrich accepted IDs through the existing campaign-bound cookie detail path, retaining access-first staging. If the legacy cookie-list entry point remains in use, expose a one-page result with validated continuation and explicit terminal status. Cookie and OAuth continuations must never be interchangeable; changing source restarts that lane without claiming prior completion.

## Three work lanes

**Archive:** Start or resume an `unknown`/`partial` traversal without using the legacy watermark as a lower bound. Checkpoint every accepted page. Only a valid terminal response completes the traversal. New head posts belong to catch-up and cannot reset archive continuation. Completion describes the observed traversal, not a guarantee that Patreon supplied an immutable snapshot.

**Catch-up:** Preserve a separate in-flight traversal and candidate high-water mark. Promote the candidate only when its traversal is complete; a page cap never closes the range. Process equal-time resources by stable ID and canonical replay, including new IDs sharing the old watermark's timestamp. IDs provide identity and a deterministic local tie-break, not evidence of provider ordering. Until ordering/filter behavior is verified, finish the provider traversal rather than stopping at the first older timestamp. This costs more requests but preserves coverage.

**Older records:** Persist a bounded keyset walk over creator/campaign-bound Patreon post IDs, including soft-deleted records that might have been restored. Reuse PS-09 current-source refresh, access helpers, occurrence handling, and fences. Do not pretend scheduled work carried a signed deletion. If missed-delete recovery is enabled, replace the internal boolean with an explicit verified-reconciliation reason requiring the stored binding and fresh authoritative 404/410. Missing rows in a scan, 403, timeout, or a partial traversal never generate tombstones. Keep native posts outside this lane.

Give each due lane a bounded turn; catch-up cannot permanently displace archive or reconciliation. A matching newest probe may omit only a new discovery probe/pass when no catch-up is pending. It cannot suppress unfinished archive, reconciliation, PS-10 roster work, access checks, or PS-12 media repair.

## Provider limits and restart

Checked [official pagination documentation](https://docs.patreon.com/#pagination) on 2026-10-20: v2 uses `page[count]`, opaque `page[cursor]`, response next cursors, and pagination links. [Campaign post lookup](https://docs.patreon.com/#get-api-oauth2-v2-campaigns-campaign_id-posts) requires `campaigns.posts`. These documented contracts do not establish post sort order, stable snapshots, timestamp filters, or cursor lifetime. Do not invent those guarantees or derive offsets from IDs.

Validate stored destinations with PS-07 origin/path rules and detect repeated cursors. For suspected expired continuation, verify that the campaign's first-page request succeeds before restarting that lane. A generic 400, 403, throttle, or transport failure must not silently erase progress. Restart from the head within the same page budget, replay safely, and preserve unknown/partial coverage. Repeated invalidation remains visible partial work; eventual completion depends on the provider allowing a traversal to progress.

## Fairness and configuration

Sort eligible creator IDs, select after the persisted scheduler cursor with wraparound, and advance selection under a short database lock before provider work. Count unhealthy, probe-skipped, and failed selections so they cannot monopolize the cap. Targeted creator jobs do not move the global cursor. Campaign leases prevent overlapping selectors from accepting the same progress concurrently.

Hosted resumable execution requires shared canonical, watermark/progress, OAuth/session stores, and consistent API/worker configuration, including `RELAY_DB_STORE_CANONICAL=1` and `RELAY_DB_STORE_WATERMARK=1`. Reuse the incremental BullMQ tick and PS-10's independent roster tick. Reject mixed shared/file progress configurations for hosted execution.

Keep legacy file documents readable and manual/dry-run callers compatible. Optional file progress must use coordinated atomic replacement and canonical-first/checkpoint-second replay semantics; two separate files cannot claim one atomic commit. PS-09's targeted-refresh guard remains in place. Do not claim cross-process file fairness, reconciliation, or durability equivalent to PostgreSQL; shared-mode prerequisites must be actionable.

## Implementation and proof

Scope: the collector, cookie/resource page helpers, incremental worker, both `sync-watermark-store` adapters, `SyncCursor` and a bounded migration, canonical checkpoint plumbing, server/worker store selection, and existing queue/repeat registration. Rebase these shared-file edits after PS-10 approval.

Convert only PS-11's remaining [baseline assertion](../../../tests/patreon-sync-baseline.test.ts). Extend [watermark tests](../../../tests/patreon-sync-state-watermark.test.ts), [autosync tests](../../../tests/incremental-autosync-worker.test.ts), [scheduler tests](../../../tests/register-workers.test.ts), and PS-09 concurrency regressions. Add dedicated progress-store and disposable PostgreSQL suites for multi-budget archives/catch-up, equal-time IDs, arrivals during backfill, restarts, expired/repeated cursors, legacy unknown state, source changes, lease loss, atomic checkpoint rollback, and persisted capped fairness across independent workers. Prove that partial scans never delete and probes leave other work due. Run focused checks, root build, scoped Ponytail Review, and the connected shared-media/replay suites. No live provider validation or PS-11 implementation is established by this note; PS-15 retains staging acceptance.
