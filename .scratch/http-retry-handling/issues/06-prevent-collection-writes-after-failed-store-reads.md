# 06: Prevent collection writes after failed store reads

**What to build:** A patron's existing collections and saved entries remain intact when storage cannot be read before creating, editing, or deleting a collection, or removing an entry. The request reports a storage failure instead of treating unreadable data as an empty store and potentially replacing it.

**Blocked by:** 05: Reconcile uncertain collection-entry saves (complete; can start immediately). Reuse its strict-read behavior and preserve its recovery contract.

**Status:** complete

**Priority:** P2

**Source:** Ticket 05's Ponytail Review identified remaining collection mutations that turn read failures into an empty aggregate before a later write.

**Scope:** The four remaining read-modify-write operations on the file-backed patron collection aggregate: collection creation, collection editing, collection deletion, and entry removal, including their authenticated API error responses and focused tests. Entry saves and owner detail already use strict reads. Reuse that behavior without changing the default loader behavior for unrelated readers. No repository-wide file-store audit, database redesign, schema or UI changes, locking, atomic-write redesign, backup system, or broader retry work.

- [x] All four operations require a successful, valid store read before modifying or saving collection state. Reuse the existing strict handling of I/O failures, invalid JSON, and malformed collection data. A failed read must never supply an invented empty aggregate to a mutation.
- [x] Read failures produce a generic INTERNAL response with HTTP 500 through each affected API handler. They must not appear as successful operations, ordinary missing-resource responses, or unhandled requests. Storage paths and raw error details remain private.
- [x] A genuinely missing store file retains the existing first-run behavior: collection creation can initialize it, while operations on absent collections or entries retain their established not-found responses. An existing but unreadable or corrupt file is not treated as missing.
- [x] Authentication, creator scope, ownership checks, validation, successful mutation responses, and entry deduplication retain their existing behavior. A failed request must not alter another patron's collections or entries.
- [x] Preserve existing retry coverage and reservation ownership. Unclassified or possibly committed failures remain protected; do not mark a broad mutation catch as pre-write, add automatic resubmission, or bypass an uncertain response with a new key. This ticket does not add retry middleware to routes that currently lack it.
- [x] Focused file-store regressions seed multiple collections and entries, inject a read failure before each operation, and verify no save call and unchanged persisted bytes. Include corrupt JSON, malformed data, and an actual unreadable-path case; restoring readable data must preserve the seeded state and allow normal operations.
- [x] Focused authenticated API regressions verify storage-error responses for all four operations, no persisted mutation after failed reads, genuine missing-file behavior, and denied access across patrons or creators. Keep the existing entry-save, owner read-back, and retry regressions green.
- [x] Update the scoped collection recovery documentation to describe the protected mutation paths and their remaining limits. Run the relevant store/API and retry checks plus scoped Ponytail Review before implementation is considered complete. Concurrency, crash recovery, and durable exactly-once effects remain outside this ticket.


## Completion evidence (2026-10-19)

- Collection creation, editing, deletion, and entry removal reuse the existing strict file-store read. All patron collection read-modify-write operations now reject read, parse, or structural validation failures before calling save. The default load behavior for unrelated read-only helpers is unchanged.
- Each affected authenticated handler returns a generic INTERNAL 500 when its mutation rejects, without exposing storage details. Existing validation, authentication, creator scope, ownership, first-run creation, missing-resource responses, and success envelopes remain intact.
- The four store regressions failed before implementation: corrupt JSON was treated as empty data, with creation succeeding and the other methods reporting absent resources. They now verify no save for corrupt JSON, malformed data, and an actual unreadable path. The original file bytes and another patron's seeded data survive, and normal mutations work after recovery.
- API regressions cover all four failed-read responses with no save or overwrite, first-run creation, genuinely missing-file mutations, and unauthenticated, wrong-creator, and wrong-patron requests. Existing entry-save and strict owner read-back regressions remain green.
- A real file-backed collection creation followed by a simulated post-write failure returns a replayed 500 on same-key retry, with one mutation invocation and one persisted collection. The broader mutation catches never mark an error as pre-write. Retry middleware was not added to any route.
- All 85 focused tests passed across seven suites: patron collection API and file store, database engagement store, detail hydration, entitlements, retry middleware, and retry store. After strengthening access checks, the 31 API/store tests passed again. Backend build and focused TypeScript checking of the four implementation/test files and their imports passed.
- Collection recovery documentation now lists all protected write operations, existing retry coverage, and the limits of current-state read-back. Unknown collection-creation outcomes may still need operator confirmation when no collection ID was returned.
- A baseline comparison confirmed that all 139 unrelated working-tree paths captured at the start were unchanged. Only this ticket's implementation, tests, recovery documentation, and completion evidence are included in its commit.

## Ponytail Review

What this change does: Failed collection-store reads can no longer feed an invented empty aggregate into the remaining mutation paths. Their APIs report a generic failure while retaining the existing handling of missing files, permissions, and retries.

Scope: Ticket 06's diff against `6d308c2`: four strict-read call sites and the loader comment, four bounded mutation error handlers, the two collection test files, scoped recovery documentation, and this ticket's completion evidence. Connected code inspected includes every caller of the affected store methods, the strict loader and persistence code, database alternatives used by the shared handlers, authentication/creator guards, rate-limit ordering, and retry ownership and JSON-response recording.

Looks good. Ship. No blocking findings in the scoped changes. The review checked that failed reads cannot reach save, error handlers do not expose storage details or release uncertain reservations, all mutation paths are covered, and unchanged read-only callers retain their existing behavior. The existing single-API-process retry assumption remains; no extra storage reads or new shared state were introduced.

Not checked: Live database fault recovery, concurrent writes, crash/interrupted-write recovery, production topology, or the full repository suite. Read-only listing helpers still retain their legacy fallback behavior; they do not write state, and their empty results cannot prove an uncertain write never committed. No locking, atomic-write, backup, or durable exactly-once changes were made.
