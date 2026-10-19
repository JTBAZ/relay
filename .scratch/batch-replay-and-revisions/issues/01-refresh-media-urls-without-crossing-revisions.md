# 01: Refresh media URLs without crossing revisions

**What to build:** Replaying an imported post can refresh a download URL for its current media revision, while an older media revision cannot replace the URL used to download the current asset.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Priority:** P2

**Source:** Batch replay and revisions audit, finding 1. An already-seen media revision can overwrite the current revision's URL, while a duplicate post skips a legitimate URL refresh entirely.

**Scope:** Batch application, duplicate-post handling, and focused ingestion/export regressions. Preserve existing revision history and event behavior. No provider refresh service, downloader redesign, persisted-key encoding change, or broader replay refactor.

- [ ] A repeated media revision may refresh its nonempty upstream URL only when it matches the stored current media revision. Replaying an older, already-seen media revision leaves the current revision and its URL intact.
- [ ] A duplicate post can refresh URLs for media already associated with that post and matching the current media revision. This path cannot import a different media revision, attach a new asset, change post content or access, or reactivate a deleted entity.
- [ ] A URL-only refresh adds no post or media version, emits no post-published event, and does not report an additional post or media revision upsert. Ordinary new revisions retain their existing behavior.
- [ ] Regression coverage imports media revision m1, then m2 through another post, then submits a new post referencing already-seen m1. The stored current revision remains m2 and its URL still downloads m2.
- [ ] Coverage also replays the current post with a refreshed URL for the same current media revision. The refreshed URL reaches the existing uncached export/download path without duplicate versions or events. Use controlled download responses, without live provider calls.
- [ ] Run the focused ingestion and affected export checks plus scoped Ponytail Review before marking implementation complete. Preserve unrelated work.
