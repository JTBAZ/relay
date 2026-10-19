# 02: Deduplicate deletion records before reapplying

**What to build:** Retrying a deletion that was already processed cannot hide a newer imported post or media revision. A distinct later deletion can still remove that entity.

**Blocked by:** None (can start immediately). New deletion markers have no legacy deletion-key format to migrate; changing existing replay-key encoding belongs to ticket 05.

**Status:** complete

**Priority:** P2

**Source:** Batch replay and revisions audit, finding 2. Deletion records are reapplied on every batch, including after a newer revision has restored the entity.

**Scope:** Stable deletion input, deletion replay markers in existing persistence, batch application, and focused API/store regressions. No general event-ordering engine, timestamp-based conflict resolution, schema redesign, or historical deletion reconstruction.

- [x] Require stable caller-supplied deletion metadata. Missing or unusable `deleted_at` returns a field-scoped validation failure before mutation; retries must not acquire a new identity from the server's current time. Update affected first-party producers or fixtures within this contract.
- [x] Identify a deletion unambiguously by creator, entity type, entity ID, and stable deletion metadata in a separate deletion-marker namespace. Persist the marker using the existing replay store without altering established campaign, tier, post, or media keys.
- [x] Once a deletion has been processed, an identical replay changes no entity status and adds no applied-deletion count. Remember processed deletions even when their target is absent, so a replay cannot delete an entity imported afterward.
- [x] A distinct later deletion still applies. Creator boundaries and post/media namespaces remain isolated, including identifiers containing delimiters. Deletions appearing after revisions in the same batch retain their existing precedence.
- [x] Regressions cover deletion, fresh revision, and repeated deletion for posts and media; duplicate deletion within a batch; absent targets; distinct later deletions; and persistence/reload of markers. Verify that a previously restored asset remains visible after the old deletion is retried.
- [x] Document that a stale deletion arriving for the first time remains outside this duplicate-protection guarantee. Existing processed deletions cannot be reconstructed from state that never recorded their identity.
- [x] Run focused validation, ingestion, and affected persistence checks plus scoped Ponytail Review before marking implementation complete. Preserve unrelated work.

## Completion evidence (2026-10-19)

- Deletion input requires a real ISO date-time with seconds, an explicit timezone, and up to three fractional second digits. Validation rejects missing, blank, malformed, timezone-free, and impossible calendar values before applying or queuing any content. UTC normalization gives equivalent timezone representations the same identity. No active first-party producer needed updating; the existing deletion fixture already supplied a stable time. The SubscribeStar mapping contract now records the requirement for future producers.
- New deletion markers use `ingest_deletion:v1:` plus SHA-256 of the JSON tuple containing creator, entity type, entity ID, and normalized deletion time. This tuple avoids delimiter ambiguity and its stored prefix separates it from legacy digests. The existing campaign/tier/post/media key function is unchanged. No marker clearing, key migration, schema change, or ticket 05 compatibility decision is included.
- Batch application remembers even absent targets before returning success. Replays increment only `idempotent_skips`; they do not change entity status, versions, events, or applied-deletion counts. A distinct deletion still applies after revisions in the same batch.
- Database saves now persist media deletion status under preserved parent posts in both mirrored provider lanes. Status updates retain ownership, current revision, history, and blob safeguards; they do not reactivate media or replace media history. A guarded deletion that affects no row rejects the transaction, preventing its marker from committing alone. Synchronous ingest failures now return a generic INTERNAL 500 and retain private error details in server logs; queued retry/DLQ behavior is unchanged.
- Twenty-three tests failed before implementation, reproducing missing input checks, unprotected deletion replays, and missing database persistence. Final verification passed 79 tests across 12 focused suites: deletion input/application, real HTTP ingest and gallery visibility, database persistence mocks, URL replay, existing idempotency, creator isolation, presentation preservation, health metrics/routes, retry/DLQ, backfill parity, and gallery shaping. Database marker save/reload and guarded-delete rejection are covered. Media restoration is explicit fixture setup; automatic reactivation remains ticket 03.
- Backend build and focused strict TypeScript checking of all three affected test files and their imports passed after the final failure-path fix. Earlier checks encountered an unrelated distribution signature mismatch during concurrent workspace edits; it no longer reproduced in the in-memory baseline or final checks. This ticket includes no distribution fix.
- The canonical ingest contract and pattern pointer describe the new behavior, required timestamps, and remaining limits. Unrelated working-tree work remains outside this ticket. In the shared server file, only the synchronous-ingest error handler belongs to this change; unrelated posting-rhythm imports and route registration are preserved separately.

## Ponytail Review

What this change does: A deletion already processed by ingestion is skipped when retried, so it cannot hide content that has since been restored. Deletion timestamps remain stable across retries, and markers persist through the existing file and database stores.

Scope: The diff against `6cabf84` in deletion timestamp validation and its type comment, the new deletion-key helper, the batch tombstone loop, preserved-media deletion persistence, and only the synchronous-ingest error handler in the server. Also reviewed the deletion regressions, affected HTTP/database tests, canonical ingest documentation, pattern pointer, SubscribeStar mapping requirement, and this ticket's completion evidence. Connected code inspected includes every validator and batch caller, enrichment, authenticated creator mutation checks, retry/DLQ handling, both canonical stores and database transaction/marker paths, provider lanes, post preservation, gallery deletion filtering, URL-refresh guards, events, and health counters.

Review caught two failure-path gaps and they were fixed within this scope: a guarded database deletion must abort if it affects no row, and a rejected synchronous save must return a bounded API error. The final focused checks cover both. No blocking findings remain.

Looks good. Ship. Review checked namespace isolation, timestamp normalization and rollover rejection, absent-target markers, replay counters, restored-content visibility, transaction failure propagation, generic API errors, and preservation of URL-refresh behavior, history, blobs, and creator/provider boundaries. The added batch work is linear in deletion count with one map lookup per deletion; the database reuses the preserved-media read added by ticket 01. This assumes the existing creator-scoped store model and successful serialized persistence, with no new concurrency guarantee.

Not checked: Live-provider deletion delivery, live-database deletion/rollback round trips, concurrent or crash recovery, production-scale marker retention, or the full repository suite. A stale deletion arriving for the first time, and deletions processed before markers existed, remain outside this guarantee. Media reactivation, the previously reported fresh shared-media revision persistence limit, and the broader stored-key compatibility decision remain separate work.
