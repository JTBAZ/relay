# 03: Reactivate media on fresh revisions

**What to build:** When ingestion accepts a fresh revision of a previously deleted media asset, the asset becomes active and appears in the gallery again.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Priority:** P2

**Source:** Batch replay and revisions audit, finding 3. A fresh media revision updates the current version while leaving the media row marked deleted, so the gallery still hides the asset.

**Scope:** Media status when accepting a fresh revision, with focused ingestion and gallery regressions. No general restoration workflow, blob-cache redesign, deletion replay changes, or persisted-key encoding changes.

- [ ] Accepting a fresh media revision sets that media entity active as part of the existing revision update. Preserve version sequencing, post associations, metadata, and upsert counts.
- [ ] Replaying an already-seen or unchanged media revision cannot reactivate deleted media. A permitted same-revision URL refresh alone does not restore visibility.
- [ ] An explicit media deletion later in the same batch still wins. Creator isolation and the existing treatment of deleted posts remain intact.
- [ ] A regression imports m1, deletes it, and imports a fresh post revision containing m2. The stored media is active at m2 and the gallery returns the real asset instead of only the synthetic post-only entry.
- [ ] Cover duplicate/old revision attempts after deletion and a fresh revision followed by deletion in the same batch. Replaying the successful fresh batch adds no versions or events.
- [ ] Run focused ingestion and affected gallery checks plus scoped Ponytail Review before marking implementation complete. Preserve unrelated work.
