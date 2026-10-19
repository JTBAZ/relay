# 03: Reactivate media on fresh revisions

**What to build:** When ingestion accepts a fresh revision of a previously deleted media asset, the asset becomes active and appears in the gallery again.

**Blocked by:** None (can start immediately).

**Status:** complete

**Priority:** P2

**Source:** Batch replay and revisions audit, finding 3. A fresh media revision updates the current version while leaving the media row marked deleted, so the gallery still hides the asset.

**Scope:** Media status when accepting a fresh revision, with focused ingestion and gallery regressions. No general restoration workflow, blob-cache redesign, deletion replay changes, or persisted-key encoding changes.

- [x] Accepting a fresh media revision sets that media entity active as part of the existing revision update. Preserve version sequencing, post associations, metadata, and upsert counts.
- [x] Replaying an already-seen or unchanged media revision cannot reactivate deleted media. A permitted same-revision URL refresh alone does not restore visibility.
- [x] An explicit media deletion later in the same batch still wins. Creator isolation and the existing treatment of deleted posts remain intact.
- [x] A regression imports m1, deletes it, and imports a fresh post revision containing m2. The stored media is active at m2 and the gallery returns the real asset instead of only the synthetic post-only entry.
- [x] Cover duplicate/old revision attempts after deletion and a fresh revision followed by deletion in the same batch. Replaying the successful fresh batch adds no versions or events.
- [x] Run focused ingestion and affected gallery checks plus scoped Ponytail Review before marking implementation complete. Preserve unrelated work.

## Completion evidence (2026-10-19)

- The implementation adds one status assignment when the existing media update accepts a fresh revision. It runs after the unchanged/current and already-seen revision guards. Version sequencing, metadata/storage-key fallback, associations, counters, replay keys, and event behavior are unchanged.
- Regressions cover restoration and the real gallery row, preserved metadata/history, successful replay without extra versions/events, already-seen and unchanged revisions supplied through new posts, a fresh media revision hidden behind a duplicate post, explicit deletion later in the same batch, deleted-post isolation, and creator isolation.
- Ticket 02's pure and real HTTP/file-store deletion-replay tests now use actual fresh-revision reactivation instead of manually setting media active. They verify persisted m2 is active, remains visible in the gallery, and survives an old deletion replay without changing stored bytes. Database save regressions verify active m2, version sequence, and both media and post history through the normal fresh-post-revision persistence path for Patreon and SubscribeStar. The database implementation itself is unchanged.
- Six tests failed before the fix, demonstrating the deleted status in snapshot application, real HTTP ingestion, and both database provider lanes. All 89 focused tests then passed across 11 suites: media URL/reactivation, deletion replay, HTTP ingest and gallery, database save, creator-scoped storage, presentation preservation, idempotency, mirrored source mapping, shadow covers, and storage keys. After strengthening the deleted-post case to start with deleted media too, all 21 media tests passed again.
- Backend build and focused strict TypeScript checks of the four affected test files and their imports passed. The canonical contract and pattern-library pointer now describe fresh-revision restoration and its boundaries.
- A preservation comparison verified 387 unrelated paths unchanged; seven locked service/log files could not be hashed. Only this ticket's implementation line, four test files, two scoped documentation updates, and completion evidence belong to this change. Other working-tree edits and tickets 04/05 remain outside it.

## Ponytail Review

What this change does: Ingestion marks deleted media active when it accepts a fresh media revision, allowing the gallery to show that asset again. Already-seen revisions, duplicate posts, and URL-only refreshes cannot restore deleted media; an explicit new deletion later in the batch still wins.

Scope: The diff against `9e86c0c`: the fresh-media status assignment in `apply-batch`, seven new media regression cases, removal of manual reactivation from deletion/HTTP tests, database save regressions and required mock support, the canonical ingest contract and pattern pointer, and this ticket's completion evidence. Connected code inspected includes every batch-application caller, post replay guards and publication, media version keys/history/metadata fallback, tombstone replay and ordering, canonical file load/save, database provider lanes and post preservation/materialization, gallery deletion filtering, and the existing URL-refresh regressions.

Looks good. Ship. No blocking findings in this scope. Review confirmed the assignment is reachable only after an accepted fresh revision, changes no post status or replay key, adds no extra work to duplicate revisions, and preserves deletion precedence and creator boundaries. The database's existing fresh-post-revision save path persists the active status and both histories without a new persistence mechanism. The added production work is one constant-time assignment per accepted media revision, with no added queries, network calls, or shared state under the existing creator-scoped batch model.

Not checked: Live-provider imports, live-database reactivation round trips, concurrent/crash recovery, blob invalidation or redownload, or the full repository suite. Existing storage-key fallback is preserved. The previously reported database limitation for a fresh shared-media revision whose primary post is preserved remains a separate follow-up, as recorded in ticket 01; no general media persistence redesign or stored-key compatibility decision is included here.
