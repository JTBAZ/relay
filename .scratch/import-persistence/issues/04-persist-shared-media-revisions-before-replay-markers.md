# 04: Persist shared-media revisions before replay markers

**What to build:** An accepted revision of a shared media asset survives saving and reloading, even when the asset's original post is unchanged. Replay protection must not mark an unpersisted media revision as processed.

**Blocked by:** None (can start immediately).

**Status:** complete locally (2026-10-20, Review Patreon sync flow)

PS-04 is owned by the current sync chat. Regression preparation used a separate test file while the other chat completed PS-03. The shared source edit started after PS-03 committed as `c82c9ed`; ownership-policy work remains outside this ticket.

**Source:** Import persistence audit, finding 4. When a new post carries a fresh revision of an asset whose first post is preserved, database saving can skip the media update while committing its replay marker. Subsequent imports then suppress the missing update.

**Scope:** Persist accepted media changes independently of whether their original parent post is recreated. Keep media state and its replay marker in the same successful save. Preserve current URL revision guards, deletion and reactivation rules, provider/creator boundaries, and storage-key fallback behavior. No schema migration, general media framework, blob-cache redesign, or bulk redownload.

- [x] Seed post p1 with asset revision m1. Import new post p2 carrying that asset at m2 while p1 stays unchanged. After database reload, the asset reflects m2 and the accepted post associations.
- [x] Accepted media metadata, version history, and status persist consistently with the replay marker. A failed media write rolls back the save without recording m2 as processed.
- [x] Replaying the accepted batch, or referencing m2 from another fresh post, retains the correct media state without duplicate media versions or publication events for replayed posts.
- [x] Duplicate revision URL refreshes stay within the current revision. Older revisions cannot replace its download URL; duplicate revisions cannot reactivate deleted assets, while fresh revisions retain the existing reactivation behavior.
- [x] Verify the shared-media persistence case for Patreon and SubscribeStar lanes while preserving creator ownership, Relay-native media, and existing storage-key fallback behavior.
- [x] Run focused media replay, database reload, and deletion/reactivation checks plus scoped Ponytail Review before completion. Preserve unrelated work.

## Regression evidence (2026-10-20)

An isolated loopback PostgreSQL database reproduced the failure in both provider lanes. All eight initial integration cases failed before the fix: m2 metadata and associations stayed at m1, and a database constraint rejecting m2 never fired because no media write was attempted. The import still returned success. The expanded suite also checks missed guarded updates, stale snapshot saves, and overlapping imports of the same asset.

The suite opts in through `CANONICAL_STORE_TEST_DATABASE_URL` and rejects targets outside a dedicated loopback `relay_ingest_test_<uuid>` database. It does not fall back to the configured application database. No production database, schema migration, or blob download is part of this work.

## Implementation and verification

`src/ingest/canonical-store-db.ts` now updates an accepted shared-media revision under a preserved parent. The full metadata/history mapping is shared with normal media creation. Fresh post references also persist when the media revision is unchanged or already seen. Updates retain creator, provider, parent, revision, URL, and applicable status guards; a missed revision/association write aborts the transaction. A stale snapshot cannot mark an unsaved newly referenced revision as processed.

The PostgreSQL suite in `tests/canonical-store-shared-media.integration.test.ts` passes all fourteen cases. The real constraint failure rolls back the new post and media marker, and retry succeeds after removing the constraint. A separate missed-update test verifies rollback when the guarded update affects no row. Both provider lanes retain history and associations through overlap, replay, deletion, and reactivation. Relay uploads, another provider's assets, and another creator's rows remain unchanged.

The integrated command `node node_modules/vitest/vitest.mjs run` passed all 178 checks across these thirteen suites: `canonical-store-shared-media.integration`, `canonical-store-concurrency.integration`, `canonical-store-db-save`, `canonical-store-presentation-ingest`, `creator-scoped-canonical-store`, `ingest-media-url-replay`, `ingest-deletion-replay`, `ingest-replay-compatibility`, `media-storage-key`, `ingest-all-paid-replay`, `patreon-sync-baseline`, `workstream-b.ingest`, and `export-media-retry`. Thirty cases used the isolated PostgreSQL database. The total includes six expected-failure baseline assertions assigned to later items; they remain unresolved. Strict TypeScript checks also passed for the new test and connected source against the temporary validated copy before applying the same media patch to the shared file.

No schema, dependency, application configuration, provider request, replay-key encoding, batch result, or event contract changed. The canonical ingest contract and sync program record this local R04 evidence. No commit, push, deployment, or shared-database migration is included.

`npm run build` passed, including Prisma generation, backend TypeScript compilation, and asset copying. The first attempt hit a Windows file lock during Prisma generation while tests were running; the sequential retry passed after they finished. The scoped whitespace check passed. The temporary source copy used during concurrent preparation was removed before the final integration run.

The disposable PostgreSQL server was stopped after verification. The initial file hashes were rechecked: changes outside PS-04 belong to the separate PS-03 commit and ongoing editor-bench work; none were reset or included in this implementation.

## Ponytail Review

What this change does: A fresh revision of shared media survives a database save even when its original post is unchanged. Media state, associations, and replay protection agree after commit or roll back together.

Scope: Only the PS-04 helper and media-persistence hunks against `c82c9ed`, the new shared-media integration test, this ticket, the shared-media paragraph in `docs/patreon-ingest-canonical.md`, and the PS-04 completion/status notes under `docs/studio/patreon-sync-build-plans/`. PS-03's ownership implementation and unrelated dirty files are excluded. Connected code inspected includes canonical loading/saving, creator transaction locking, batch media upsert/replay/tombstones, storage-key mutation, ingestion orchestration, media creation, and packaging callers. Expected load is multiple API/worker processes sharing PostgreSQL and using the existing creator mutation lock.

Looks good. Ship. No blocking finding remains in scope. The fix reuses the existing transaction and provider lanes, adds no query per unchanged asset, and keeps full media mapping in one place. Guard failures are tested, accepted state is not silently skipped, and the existing URL/deletion behavior remains covered.

Not checked: The full repository suite, live provider traffic, production rollout, or repairs to historical assets already affected by this defect. Old deployed writers must be replaced consistently. Pre-save publication remains PS-05; its event leak on failed saves is outside PS-04 and is not claimed fixed.

Next unblocked persistence item: PS-05, after a fresh concurrency check and authorization to proceed. This ticket does not start it or amend ownership policy.
