# 04: Retry known failures without repeating uncertain writes

**What to build:** A creator or patron can retry after a temporary failure known to have happened before any write. A failed response with an uncertain or already committed write remains protected from automatic re-execution rather than being treated as safely retryable.

**Blocked by:** 03: Protect newer reservations from expired requests. Failure cleanup must only release the reservation owned by that request.

**Status:** complete

**Priority:** P2

**Source:** HTTP retry handling Ponytail Review, finding 4. The review reproduced a transient HTTP 500 being replayed after recovery because every JSON response receives the same 24-hour cache lifetime.

**Scope:** Failure outcome classification at the retry middleware boundary and the smallest affected handler changes needed to demonstrate a known pre-write failure and an uncertain outcome. Inspect enabled routes only far enough to establish safe classification. Do not rewrite their transactions or silently extend this ticket into business-service refactoring.

- [x] Establish an explicit, minimal distinction between a failure known to precede any write and an uncertain or committed outcome. HTTP 500 alone is not evidence that a write did not happen.
- [x] A representative authenticated mutation that fails before writing can release its owned reservation. Retrying the same key after recovery reaches the handler, succeeds, and produces exactly one persisted mutation.
- [x] A representative operation that commits and then fails in follow-up work does not execute its write again on retry. Preserve duplicate protection and document its retry response.
- [x] Unclassified failures default to preserving duplicate protection. Do not implement a blanket release or cache bypass for every server error.
- [x] A late failure from an expired request cannot release a newer reservation, using the ownership contract delivered by ticket 03.
- [x] Successful responses, existing deterministic client-error replay, caller/target isolation, and unchanged no-key requests retain their behavior.
- [x] Add focused regressions for pre-write recovery, uncertain post-write failure, and stale-owner cleanup. Align the retry contract documentation with the implemented behavior.
- [x] If safely resolving an uncertain outcome requires changing a business transaction or another feature, report that as a separate scoped follow-up; do not expand this ticket or claim that outcome is safe.
- [x] Run the existing retry middleware/store suites and affected handler checks, then review only this ticket's diff and connected code with Ponytail Review.


## Retry contract

- Handlers call `markIdempotencyPreWriteFailure(res)` only when the target mutation has not been attempted and cannot still be running. They must immediately return a JSON 5xx. The signal is held on the server; request headers and body fields cannot set it.
- The middleware releases only that request's reservation, using its reservation ID. A successful release lets the same key execute again. A failed release leaves duplicate protection in place until reservation expiry. A stale request cannot release a newer reservation or remove its saved response.
- The collection-entry POST marks only a rejected catalog load, before entry validation and `addEntry`. It returns 503. After the read recovers, the same authenticated request and key can add the entry once. Authentication, entitlement checks, and the write path retain their existing behavior.
- All other JSON outcomes retain the original replay policy. Successes, deterministic client errors, and unclassified server errors replay the original status and body, with `Idempotency-Replayed: true`. The default snapshot lifetime is 24 hours. A 500 alone never releases a reservation.
- An uncertain post-write failure remains an error on retry; replay does not prove the write failed or report it as successful. Reconcile the persisted business state before taking further action. Requests without a key continue through the handler normally.
- The existing in-memory limits still apply: process restart, cache eviction, snapshot expiry, and the 60-second running-reservation expiry can permit re-execution. This ticket adds no durable or cross-process exactly-once guarantee. A handler that never emits JSON retains its running reservation until expiry.

## Completion evidence (2026-10-19)

- The pre-write recovery regression failed before implementation because the retry received the cached 503. It now succeeds, and a real authenticated collection-entry regression verifies no initial write, one persisted entry after recovery, and replay without another write call.
- A real file-backed write followed by a simulated follow-up error returns a replayed 500 in the middleware test. An authenticated collection-entry test commits an entry and then reports a store error; its existing 404 response replays without calling `addEntry` again. Both keep one persisted mutation.
- Regressions cover unclassified failures without a confirmed write, client attempts to spoof the signal, success/client-error replay despite an erroneous marker, release failure, and stale failure cleanup both during a newer reservation and after its completion. Existing disconnect and caller/target isolation checks remain green.
- All 49 tests passed across the retry middleware, retry store, patron collections API, and Goal Cycle route suites, using the repository Vitest configuration with caching disabled.
- Backend build (`npm run build`) and focused TypeScript checking of the five implementation/test files and their imports passed. Tests inject failures at the store boundary; live database fault recovery and cross-process concurrency were not tested.

## Ponytail Review

What this change does: Known pre-write failures can release their own retry reservation. Uncertain outcomes keep their original replay protection.

Scope: Only ticket 04's changes against `0cccad8`: the middleware marker and release branch, store lifecycle comments, the two server imports and collection-entry catalog-read catch, the middleware/API regression hunks, and this ticket's status and evidence. Connected code inspected includes authentication and entitlement reads, both canonical store load implementations, collection-entry persistence, reservation ownership/expiry, middleware callers, and the comment creation path's post-write follow-up work.

Assumed load: the existing single-API-process in-memory deployment contract. The new marker and ownership checks take constant time, and the marker does not retain response objects after garbage collection. Production topology was not verified.

Looks good. Ship. No blocking findings in this ticket's changes. The review checked classification safety, reservation ownership, failure defaults, caller/target compatibility, and focused regression coverage.

## Separate follow-up: collection-entry error reporting and reconciliation

The existing collection-entry catch maps every store error to 404, including an error reported after a write committed. Keep the reservation protected. A separate task should distinguish a missing collection from a storage failure and define how a caller can reconcile an ambiguous save against persisted entries. Cover a committed save followed by failure without issuing another write. This ticket preserves that response contract and does not change business transactions.
