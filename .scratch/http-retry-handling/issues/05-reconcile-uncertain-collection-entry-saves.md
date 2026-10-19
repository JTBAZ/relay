# 05: Reconcile uncertain collection-entry saves

**What to build:** After a collection-entry save reports an uncertain failure, a patron can check their collection to see whether the entry is present without submitting another write. A missing collection and a storage failure produce distinct responses, while retrying the original save remains protected from duplicate execution.

**Blocked by:** 04: Retry known failures without repeating uncertain writes (complete; can start immediately).

**Status:** complete

**Priority:** P2

**Source:** Ticket 04's collection-entry error reporting and reconciliation follow-up. Its regression showed a saved entry followed by a store error returning a replayed 404.

**Scope:** One collection-entry save and authenticated read-back flow. Use the existing collection-detail read for reconciliation, with only the necessary store error distinction, response handling, tests, and retry documentation. No new reconciliation service, schema changes, UI work, shared retry-policy redesign, transaction rewrite, or expansion to other mutations.

- [x] The entry-save response uses 404 only for a confirmed missing collection, retaining the existing protection against revealing another patron's collection. Storage failures with an uncertain write outcome return the existing INTERNAL error envelope with HTTP 500 and no raw storage details.
- [x] An uncertain failure never receives the pre-write failure signal. Retrying the same caller, target, body, and key replays the original error and does not invoke the write again. Preserve successful replay, known pre-write recovery, reservation ownership, and requests without a key.
- [x] A patron can use the existing collection-detail read to determine whether the requested entry is currently present, using the existing collection/media identity rules. The read performs no mutation and preserves authentication, creator scope, ownership, and entitlement filtering.
- [x] A failed or corrupt persistence read in this flow surfaces a server error; it must not masquerade as an empty collection or a confirmed missing entry. A later successful read can reconcile the current state. An absent entry does not prove an earlier write never committed or authorize an automatic resubmission.
- [x] A focused authenticated regression saves an entry, injects a failure after persistence, receives HTTP 500, then confirms the entry through collection detail. A same-key retry replays the error with one write call and one persisted entry.
- [x] Focused regressions cover a genuinely missing collection, a storage failure without a confirmed commit, an unavailable reconciliation read followed by recovery, and another patron's denied read. Reads and retries must neither add entries nor expose another patron's data.
- [x] Document the caller procedure: after an uncertain save response, inspect collection detail; preserve the original key when retrying the request. Do not instruct callers to use a new key or automatically resubmit after an inconclusive read. Read-back confirms current collection state, not the historical outcome of a specific request.
- [x] Run focused collection-entry and retry middleware/store checks and scoped Ponytail Review before implementation is considered complete. Preserve the existing process/cache/expiry limits; this ticket adds no durable exactly-once guarantee.


## Completion evidence (2026-10-19)

- Both collection stores now return null only when the collection lookup finds nothing in the caller's scope. Persistence and follow-up failures still reject. The save handler returns the existing 404 for null and a generic INTERNAL 500 for rejected operations, without classifying them as safely retryable.
- Entry saves and owner detail use strict file-store reads. Read and parse errors, malformed root arrays, and incomplete row fields propagate instead of becoming an empty aggregate. A missing file retains the existing empty-store meaning. Other callers keep the legacy read behavior.
- The existing authenticated detail route catches failed reads and enrichment, returning a generic 500. Account ownership, creator scope, entitlement decisions, mature-content filtering, and successful response enrichment retain their existing behavior.
- The committed-save regression first failed with the old 404 response. It now verifies a 500 followed by owner read-back of the persisted entry, replay of the original error, one write call, and one saved entry. Read-back does not rewrite the saved retry response.
- Actual corrupt-file tests verify no persistence call, no overwrite of the corrupt data, successful read-back after recovery, and continued protection of the original uncertain save. Tests also cover unreadable storage, genuinely missing collections, account/member scope, denied access, and database failure after entry creation.
- All 75 focused tests passed across seven suites: collection API, file store, database engagement store, detail hydration, entitlements, retry middleware, and retry store. The four database store tests passed again after strengthening the account-isolation assertion. Backend build and focused TypeScript checking of the six implementation/test files and their imports passed.
- Caller recovery steps and the limits of read-back are documented in `docs/qa/COLLECTION_ENTRY_RECONCILIATION.md`. No schema, UI, shared retry policy, transaction, or notification recovery changes were made.
- Unrelated working-tree changes were left in place, including concurrent edits to existing design and recipe documentation. Only this ticket's implementation, tests, recovery documentation, and completion evidence are included in its commit.

## Ponytail Review

What this change does: Collection-entry saves distinguish a scoped missing collection from an uncertain storage failure. Patrons can check current saved entries through the existing owner detail read without re-executing the save.

Scope: Ticket 05's diff against `503efc3`: strict-read handling and nullable missing results in the two collection stores; the entry-save error/result handling and owner-detail error boundary; the three focused test files; recovery documentation; and this ticket's completion evidence. Connected code checked includes all entry-save and owner-detail callers, file persistence, database post-write updates and notification emission, authentication/account scope, entitlement and mature-content handling, detail hydration, and retry response recording and ownership.

Assumed load: the existing single-API-process retry store and existing file/database storage choices. Strict validation adds a linear pass over the already-loaded file aggregate, with no additional storage read or write. No blocking findings remained in the scoped changes.

### Pre-existing risk outside this ticket

1. **Other file-store mutations retain fallback reads.**
   - What this is: Legacy collection operations, including collection creation, still use the default load behavior that converts a read failure into an empty aggregate.
   - Problem: If a transient read fails and a later write succeeds, one of those operations can replace existing state using that empty aggregate.
   - Smallest follow-up: Separately harden those remaining mutation paths to distinguish a missing file from a failed read and return an appropriate error through their callers. This needs its own caller and failure tests.
   - If skipped: The entry-save and owner-read flow is protected by this ticket, while other legacy mutations retain that existing data-loss risk. Those operations were not changed here.

Verdict: Ship. No blocking findings in this ticket's changes.

Not checked: Live database fault recovery, production topology, cross-process concurrency, and the full repository test suite. Database behavior was checked with focused Prisma mocks; the authenticated end-to-end regression persists to a real temporary file. Existing process/cache/expiry limits still apply.
