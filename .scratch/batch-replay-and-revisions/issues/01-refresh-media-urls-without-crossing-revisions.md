# 01: Refresh media URLs without crossing revisions

**What to build:** Replaying an imported post can refresh a download URL for its current media revision, while an older media revision cannot replace the URL used to download the current asset.

**Blocked by:** None (can start immediately).

**Status:** complete

**Priority:** P2

**Source:** Batch replay and revisions audit, finding 1. An already-seen media revision can overwrite the current revision's URL, while a duplicate post skips a legitimate URL refresh entirely.

**Scope:** Batch application, duplicate-post handling, and focused ingestion/export regressions. Preserve existing revision history and event behavior. No provider refresh service, downloader redesign, persisted-key encoding change, or broader replay refactor.

- [x] A repeated media revision may refresh its nonempty upstream URL only when it matches the stored current media revision. Replaying an older, already-seen media revision leaves the current revision and its URL intact.
- [x] A duplicate post can refresh URLs for media already associated with that post and matching the current media revision. This path cannot import a different media revision, attach a new asset, change post content or access, or reactivate a deleted entity.
- [x] A URL-only refresh adds no post or media version, emits no post-published event, and does not report an additional post or media revision upsert. Ordinary new revisions retain their existing behavior.
- [x] Regression coverage imports media revision m1, then m2 through another post, then submits a new post referencing already-seen m1. The stored current revision remains m2 and its URL still downloads m2.
- [x] Coverage also replays the current post with a refreshed URL for the same current media revision. The refreshed URL reaches the existing uncached export/download path without duplicate versions or events. Use controlled download responses, without live provider calls.
- [x] Run the focused ingestion and affected export checks plus scoped Ponytail Review before marking implementation complete. Preserve unrelated work.

## Completion evidence (2026-10-19)

- URL refresh now happens after checking the current media revision. Accepting a new revision no longer overwrites the previous version's URL, and an already-seen older revision cannot replace the current download URL.
- Duplicate posts refresh only nonblank URLs for media already in the stored current post's media list and matching the current media revision. They retain existing content, access, associations, storage keys, statuses, versions, replay markers, counters, and event behavior.
- Database persistence previously skipped all media writes for preserved posts. It now reads preserved mirrored media once per provider lane and updates only changed URLs for matching revisions. Each update checks creator, media ID, primary post, provider, stored revision, and the previously read URL. It writes no other media fields and does not recreate preserved posts or media.
- Seven regressions failed before implementation, demonstrating stale URL replacement, missing duplicate refreshes, and discarded database refreshes. The focused run then passed 63 tests in 12 suites, including real HTTP ingest/export, file-backed download/reload, database persistence mocks for both provider lanes, creator isolation, presentation preservation, storage keys, and the existing database Relay-native preservation integration. Adding a matching-revision/new-post regression brought the media suite to 14 passing tests and the total unique focused tests to 64. Controlled downloads made no live provider requests.
- Backend build and focused strict TypeScript checks passed. After the final URL guards and test addition, the media regressions and focused TypeScript check passed again. The canonical ingest contract and its pattern-library pointer describe the bounded refresh behavior.
- Only this ticket's two implementation files, two test files, two scoped documentation changes, and completion evidence belong to this change. The preservation comparison found 186 unrelated paths unchanged, two editor-bench files changing during this run, and five locked service logs excluded from hashing. Those unrelated files were not edited or staged by this task. Tickets 02 through 05 remain unstarted, including the stored-key compatibility decision.

## Ponytail Review

What this change does: Replayed posts can refresh a download URL for the current media revision without publishing the post again. Older media revisions cannot replace that URL, and the database retains these URL-only refreshes while preserving unchanged posts.

Scope: The diff against `cab68ef` in the duplicate-post branch and media URL assignment of `apply-batch`, the preserved-media URL write in `canonical-store-db`, the new media replay regressions, the database save regressions, the canonical ingest documentation and pattern pointer, and this ticket's completion evidence. Connected code inspected includes ingestion validation, enrichment, service and queue callers, creator mutation authorization, both canonical stores, provider partitioning, post preservation and presentation handling, export URL selection/cache behavior, storage-key updates, and event publication.

No blocking findings in the scoped changes. Review checked revision/association guards, creator and provider isolation, history and blob preservation, blank URLs, missing/deleted entities, event/upsert counts, and guarded database writes. Duplicate-post media matching uses a set, keeping the added batch work linear in the media list. Database saves add at most one preserved-media read per provider lane and update only changed matching URLs, within the existing transaction. This review assumes the existing creator-scoped batch and store mutation model; it adds no concurrency guarantee.

### Existing finding outside ticket 01

1. **A fresh shared-media revision can still be skipped by database persistence** (`src/ingest/canonical-store-db.ts:724`).
   - **What this is:** Media recreation is restricted to rows whose primary post is being materialized.
   - **Problem:** If post p1 remains unchanged while a new post p2 supplies m2 for media primarily owned by p1, the snapshot accepts m2 but the preserved-primary-post filter skips persisting that media revision. This filter predates ticket 01. The new URL-only path deliberately requires a matching stored revision and cannot replace a complete revision save.
   - **Smallest proposed fix:** Save accepted media revision changes independently of primary-post recreation, preserving ownership, versions, and Relay-native media safeguards. Add a database regression for unchanged p1 plus new p2 sharing the revised media.
   - **If we skip it:** That database case can keep serving the older media revision after sync. It needs a separate scoped follow-up; no fix is included here.

Verdict: Ship ticket 01. The existing shared-media persistence finding is outside this ticket.

Not checked: Live-provider URL renewal, live-database URL-refresh round trips, production-scale refresh throughput, concurrent/crash recovery, or the full repository suite. The existing database preservation integration ran successfully, while URL-refresh database writes were verified with transaction mocks.
