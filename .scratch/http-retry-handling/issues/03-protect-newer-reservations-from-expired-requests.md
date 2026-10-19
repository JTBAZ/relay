# 03: Protect newer reservations from expired requests

**What to build:** Once an expired operation's key has been acquired by a newer request, the older request can no longer release the newer reservation or replace its saved response. Retries observe the outcome belonging to the current reservation.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Priority:** P2

**Source:** HTTP retry handling Ponytail Review, finding 3. The review reproduced an older request removing a newer reservation and overwriting a newer completed response after the default 60-second lock expired.

**Scope:** Reservation ownership in the existing store/middleware contract and focused tests. Use the existing in-memory store and timeout policy. This is not a distributed locking project or a guarantee of exactly-once writes beyond reservation expiry.

- [ ] Each fresh acquisition has a distinct reservation identity retained by the request that acquired it.
- [ ] Recording a response or releasing a reservation requires matching the current reservation identity. Calls from older requests cannot mutate the newer reservation or its saved result.
- [ ] A deterministic expiry/reacquisition test proves a late release from request A cannot unlock request B; request C still receives the in-flight response while B runs.
- [ ] A deterministic expiry/reacquisition test proves a late completion from A cannot replace B's completed response or change the body fingerprint checked on B's replay.
- [ ] The current owner can still complete or release its reservation, and ordinary expiry, cache bounds, response lifetime, and replay behavior remain intact.
- [ ] Tests exercise middleware completion/cleanup as well as direct store calls. Do not leave any runtime caller using an unchecked completion or release path.
- [ ] Run the existing retry middleware/store suites and ownership regressions, then review only this ticket's diff and connected code with Ponytail Review.
