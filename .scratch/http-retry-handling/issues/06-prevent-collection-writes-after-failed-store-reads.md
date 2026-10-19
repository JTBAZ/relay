# 06: Prevent collection writes after failed store reads

**What to build:** A patron's existing collections and saved entries remain intact when storage cannot be read before creating, editing, or deleting a collection, or removing an entry. The request reports a storage failure instead of treating unreadable data as an empty store and potentially replacing it.

**Blocked by:** 05: Reconcile uncertain collection-entry saves (complete; can start immediately). Reuse its strict-read behavior and preserve its recovery contract.

**Status:** ready-for-agent

**Priority:** P2

**Source:** Ticket 05's Ponytail Review identified remaining collection mutations that turn read failures into an empty aggregate before a later write.

**Scope:** The four remaining read-modify-write operations on the file-backed patron collection aggregate: collection creation, collection editing, collection deletion, and entry removal, including their authenticated API error responses and focused tests. Entry saves and owner detail already use strict reads. Reuse that behavior without changing the default loader behavior for unrelated readers. No repository-wide file-store audit, database redesign, schema or UI changes, locking, atomic-write redesign, backup system, or broader retry work.

- [ ] All four operations require a successful, valid store read before modifying or saving collection state. Reuse the existing strict handling of I/O failures, invalid JSON, and malformed collection data. A failed read must never supply an invented empty aggregate to a mutation.
- [ ] Read failures produce a generic INTERNAL response with HTTP 500 through each affected API handler. They must not appear as successful operations, ordinary missing-resource responses, or unhandled requests. Storage paths and raw error details remain private.
- [ ] A genuinely missing store file retains the existing first-run behavior: collection creation can initialize it, while operations on absent collections or entries retain their established not-found responses. An existing but unreadable or corrupt file is not treated as missing.
- [ ] Authentication, creator scope, ownership checks, validation, successful mutation responses, and entry deduplication retain their existing behavior. A failed request must not alter another patron's collections or entries.
- [ ] Preserve existing retry coverage and reservation ownership. Unclassified or possibly committed failures remain protected; do not mark a broad mutation catch as pre-write, add automatic resubmission, or bypass an uncertain response with a new key. This ticket does not add retry middleware to routes that currently lack it.
- [ ] Focused file-store regressions seed multiple collections and entries, inject a read failure before each operation, and verify no save call and unchanged persisted bytes. Include corrupt JSON, malformed data, and an actual unreadable-path case; restoring readable data must preserve the seeded state and allow normal operations.
- [ ] Focused authenticated API regressions verify storage-error responses for all four operations, no persisted mutation after failed reads, genuine missing-file behavior, and denied access across patrons or creators. Keep the existing entry-save, owner read-back, and retry regressions green.
- [ ] Update the scoped collection recovery documentation to describe the protected mutation paths and their remaining limits. Run the relevant store/API and retry checks plus scoped Ponytail Review before implementation is considered complete. Concurrency, crash recovery, and durable exactly-once effects remain outside this ticket.
