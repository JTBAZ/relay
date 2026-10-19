# 03: Protect newer reservations from expired requests

**What to build:** Once an expired operation's key has been acquired by a newer request, the older request can no longer release the newer reservation or replace its saved response. Retries observe the outcome belonging to the current reservation.

**Blocked by:** None (can start immediately).

**Status:** complete

**Priority:** P2

**Source:** HTTP retry handling Ponytail Review, finding 3. The review reproduced an older request removing a newer reservation and overwriting a newer completed response after the default 60-second lock expired.

**Scope:** Reservation ownership in the existing store/middleware contract and focused tests. Use the existing in-memory store and timeout policy. This is not a distributed locking project or a guarantee of exactly-once writes beyond reservation expiry.

- [x] Each fresh acquisition has a distinct reservation identity retained by the request that acquired it.
- [x] Recording a response or releasing a reservation requires matching the current reservation identity. Calls from older requests cannot mutate the newer reservation or its saved result.
- [x] A deterministic expiry/reacquisition test proves a late release from request A cannot unlock request B; request C still receives the in-flight response while B runs.
- [x] A deterministic expiry/reacquisition test proves a late completion from A cannot replace B's completed response or change the body fingerprint checked on B's replay.
- [x] The current owner can still complete or release its reservation, and ordinary expiry, cache bounds, response lifetime, and replay behavior remain intact.
- [x] Tests exercise middleware completion/cleanup as well as direct store calls. Do not leave any runtime caller using an unchecked completion or release path.
- [x] Run the existing retry middleware/store suites and ownership regressions, then review only this ticket's diff and connected code with Ponytail Review.

## Completion evidence (2026-10-19)

- Fresh acquisitions return a distinct reservation ID. The existing middleware retains it and supplies it when recording a response. Recording and release ignore absent or superseded reservations; no runtime completion path bypasses the ownership check.
- Reacquisition replaces expired entry state instead of merging it, so a stale response cannot remain attached to a newer lock. Late completions also cannot resurrect evicted entries. The in-memory store, cache cap, reservation timeout, and response lifetime remain unchanged.
- Two controlled HTTP regressions failed before the fix: an older request completing before or after the newer request corrupted the newer request's replay behavior. Both now pass, preserving the newer response and its body fingerprint.
- Direct store regressions cover stale release, stale completion during a newer operation and after its completion, eviction/reacquisition, and response expiry without deleting a new lock. The ticket 02 disconnect regression remains green; response-close cleanup was not reintroduced.
- All 39 tests passed across four focused suites: retry middleware, retry store, patron collections API, and Goal Cycle routes. Backend build and focused TypeScript checking of the four changed implementation/test files and their imports passed.
- Ponytail Review covered only this ticket's implementation/test diff against the ticket 02 baseline and connected callers/store behavior. No blocking findings remained.
- Reservation expiry can still permit another write; this ticket protects reservation and replay ownership rather than guaranteeing exactly-once effects. Live production topology and database concurrency were not tested. Ticket 04's failure policy remains unchanged.
