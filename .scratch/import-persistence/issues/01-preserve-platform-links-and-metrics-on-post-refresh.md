# 01: Preserve platform links and metrics on post refresh

**What to build:** Refreshing an imported post keeps the creator's confirmed platform links and their metric history attached to that post.

**Blocked by:** None (can start immediately).

**Status:** complete

**Source:** Import persistence audit, finding 1. Saving a fresh post revision deletes and recreates the parent post. Cascading deletion removes platform instances and external metric snapshots, even though presentation overrides and creative-work membership are restored.

**Scope:** Update an existing imported post in place and synchronize its imported revision history and tier links. Preserve existing provider, creator, status, campaign, presentation, and creative-work behavior. No schema migration, general relationship-copying framework, or unrelated persistence redesign.

- [x] A creator-confirmed X link on an imported Patreon post survives a fresh provider revision with its identity and provenance intact.
- [x] Existing external metric snapshots remain attached to the same post and platform instance after refresh; inferred provider links do not replace confirmed links.
- [x] Imported post fields, version history, and tier access reflect the accepted revision without deleting the existing parent post.
- [x] Presentation overrides, creative-work membership, creator boundaries, provider lanes, and Relay-native posts retain their existing behavior.
- [x] Focused persistence regressions seed a confirmed platform link and metric history, apply a fresh revision, reload, and verify both survive. Replaying that revision adds no duplicate rows or history.
- [x] Run the affected persistence and presentation checks plus scoped Ponytail Review before completion. Preserve unrelated working-tree changes.

## Implementation and verification (2026-10-20)

Existing posts are updated within their creator and provider lane. Fresh versions, campaign changes, upstream status, and tier links still synchronize inside the existing transaction. Only posts omitted from the snapshot use the existing parent-deletion path. Presentation overlays, creative-work membership, platform links, and external metric history survive because their parent post remains. The presentation and membership backup/restore code is removed. Orphan campaign/tier cleanup runs after post updates so a campaign move can release its former campaign safely. Media replacement and replay behavior remain unchanged.

The new stateful database-adapter regressions failed against the original parent-deletion path for both Patreon and SubscribeStar. They now verify confirmed X/provider links, metric records, parent identity, revision history, tier links, reload, replay, and deletion status. Another regression covers campaign moves and deletion of an omitted post. Existing presentation, all-paid access, reactivation, and migration fixtures were adjusted for updates and query ordering without changing their product expectations.

- All 154 focused tests passed across 14 suites covering persistence, creator boundaries, replay compatibility, media URLs, deletion, all-paid access, platform links, metrics, presentation, and backfill helpers.
- After review corrections to fixture provenance and comments, all 34 tests in the three affected persistence suites passed again. Strict TypeScript checks passed for those test files and their connected imports. Scoped whitespace checks passed.
- Of 69 pre-existing tracked working-tree changes checked by content hash, 67 remained unchanged. Two files in extension and editor-bench changed concurrently; this task did not edit or stage them. Unrelated work remains outside the commit allowlist. A repository-wide whitespace check also reported existing issues in unrelated work; those were left untouched.

## Ponytail Review

What this change does: Fresh imported post revisions keep their existing parent row, so confirmed platform links and metrics survive. Revision history, tier links, campaign moves, and upstream status continue to save in the same transaction.

Scope: The task diff against `063034b` in the database canonical store, its save regressions, presentation-preservation regression, and the migration fixture's query-aware mock, plus this completion record. Connected code inspected includes creator/global load and save callers, ingestion orchestration and batch application, provider-source mapping, platform identity/link helpers, creative-work membership, backfill, the canonical ingest contract, and Prisma relationship deletion rules. Expected load is the documented long-lived API process; this ticket adds no concurrency guarantee.

Looks good. Ship. No blocking findings remain in scope. Existing-post updates include creator and provider guards; refreshed posts are excluded from parent deletion. Replay retains the unchanged-post fast path. The change removes backup/restore reads and writes and adds no dependencies, schema changes, background work, or additional queries per post.

Not checked: Live PostgreSQL foreign-key execution, live provider sync, browser UX, full repository build/suite, or crash/concurrent-import recovery. Persistence coverage uses a stateful mocked database adapter. Existing concurrency, foreign-owner migration policy, shared-media persistence, and pre-save event publication risks remain assigned to tickets 02–05; their implementation is unstarted.
