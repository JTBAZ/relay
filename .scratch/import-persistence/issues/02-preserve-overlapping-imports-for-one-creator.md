# 02: Preserve overlapping imports for one creator

**What to build:** Two imports arriving together for the same creator both retain their accepted content and replay protection, so one successful import cannot overwrite the other.

**Blocked by:** None (can start immediately).

**Status:** complete

**Source:** Import persistence audit, finding 2. Creator snapshots are loaded before the save transaction. Overlapping requests can load the same old snapshot, then serially save competing replacements that lose the first request's post and replay marker.

**Scope:** Protect the full creator-scoped load, apply, and save operation using database coordination acquired before loading. Cover ingestion callers that bypass provider-specific exclusivity. Keep different creators independent. No queue replacement, Redis dependency, generic locking framework, or broader store rewrite.

- [x] Overlapping imports of distinct posts for one creator both survive database reload with their revision histories and replay markers intact.
- [x] Coordination covers the initial creator snapshot read through transaction completion; serializing only writes or one provider adapter is insufficient.
- [x] A later request applies against the preceding committed state. Repeating either accepted batch remains a no-op.
- [x] A failed or rolled-back import releases coordination, leaves no partial content or false replay markers, and permits a later retry.
- [x] Creator isolation and provider-lane preservation remain intact. Imports for different creators do not share a global lock.
- [x] Add a deterministic overlapping-transaction regression through the database store, including rollback and retry. Run focused creator-boundary and persistence checks plus scoped Ponytail Review; preserve unrelated work.

## Implementation and verification (2026-10-20)

Creator mutations now take a namespaced PostgreSQL transaction advisory lock before reading canonical rows. The load, callback, and save share that transaction connection at explicit Read Committed isolation. A waiting import therefore loads the preceding committed state instead of saving a stale replacement. The lock releases on commit or rollback and uses a creator-specific key. The existing 30-second transaction budget covers the full operation. The implementation follows the advisory-lock pattern already used by distribution handoff.

The existing save transaction body was extracted into a private method so a mutation can reuse it without opening a nested transaction. A comparison against the parent commit confirmed that body is unchanged except for indentation. Public method signatures, explicit snapshot saves, file-store behavior, provider preservation, and the ticket 01 parent-update fix remain intact. Existing test adapters now expose reads through the transaction client; replay conflicts still stop before persistence writes.

- The new overlap regressions failed against the original code: a second request completed while the first creator mutation was held open. After the fix, six tests passed on an isolated temporary PostgreSQL cluster using separate Prisma clients. They observe actual advisory-lock waits and verify same-provider and mixed-provider imports, revision histories, replay markers, rollback after a callback error, a real tier foreign-key write failure, an injected pre-commit failure, retry, and independent creators.
- All 175 focused tests passed across 17 suites, including the six live PostgreSQL cases and connected persistence, replay, platform-link/metric, presentation, backfill, and export checks. After final fixture/guard adjustments, all 40 tests in the four affected suites passed again.
- Strict TypeScript checks passed for the four affected test files and their connected source imports. Scoped whitespace checks passed. All 69 pre-existing tracked working-tree changes remained byte-identical during the preservation comparison.
- The PostgreSQL test URL is an explicit opt-in, accepts only a dedicated loopback test database name, and does not fall back to the ordinary database URL. The current schema was applied only to that temporary cluster. No repository schema, migration, dependency, application configuration, or shared database was changed.
- The temporary PostgreSQL instance was stopped after verification. Its files remain in the task's temporary directory because automatic approval review blocked the combined stop-and-delete cleanup command with `blocked by policy`.

## Ponytail Review

What this change does: Overlapping database-backed creator mutations wait before reading, then apply and save against the latest committed creator state. A failed transaction rolls back its content and replay markers and releases the creator for the next request.

Scope: The task diff against `7cb5c70`: transactional creator loading, extraction of the unchanged save body, the creator mutation lock/transaction boundary, database-adapter fixture updates, the new PostgreSQL concurrency regressions, and the contract/completion notes. Connected code inspected includes every canonical mutation/save caller, HTTP and queued ingestion through the shared ingestion service, export storage-key callbacks, operator reconciliation/backfill, provider mapping, replay preflight, the existing distribution advisory-lock pattern, event publication, transaction pooling guidance, and ticket 01 relationship preservation. Expected load is the documented long-lived API and worker processes; coordination lives in PostgreSQL and works across clients/processes.

Looks good. Ship. No blocking findings remain in scope. The lock key is parameterized and namespaced. Explicit Read Committed isolation ensures a waiter sees the preceding commit; all snapshot reads and writes use the transaction client. The change adds one lock query per creator mutation, with no new query per entity, process-local lock map, queue, schema change, or dependency. Existing callbacks perform local snapshot updates and do not add provider calls inside the transaction.

Rollout: Drain ingestion and replace API/worker writers together; old writers do not acquire this lock. Explicit snapshot replacement and global maintenance mutation remain offline operations with stopped writers. Foreign-owner reassignment policy, shared-media persistence, and pre-save event publication remain tracked separately in tickets 03–05. This ticket does not implement those behaviors or choose a migration policy.

Not checked: Full repository build/suite, live provider traffic, production pool saturation, mixed-version deployment, or process/network failure during commit. The pre-commit failure case is injected; the write-failure and lock/rollback cases execute on real PostgreSQL.
