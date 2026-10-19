# 02: Keep running writes reserved after disconnect

**What to build:** When a creator or patron loses their connection during a write, a retry remains blocked while the original operation is still running and its reservation remains valid. When the original operation succeeds, its result remains available for replay even if its client has disconnected.

**Blocked by:** None (can start immediately).

**Status:** complete

**Priority:** P2

**Source:** HTTP retry handling Ponytail Review, finding 2. The review reproduced two writes after a response close released the first operation's reservation while its handler continued running.

**Scope:** Retry middleware response lifecycle and focused regression tests, with a representative non-deduplicating write such as collection creation. Do not redesign business services, add a new cancellation system, replace the store, or change the reservation timeout.

- [x] Closing or aborting a response alone does not release the reservation for a handler that may still write.
- [x] A controlled test starts a write, disconnects its client before completion, and retries before reservation expiry. The retry receives the existing in-flight response and does not start another write.
- [x] Completing the original write after disconnect records its successful outcome. A subsequent retry replays that outcome, and the persisted write count remains one.
- [x] Normal connected requests, successful replay, and the existing abandoned-reservation timeout continue to work.
- [x] Do not claim duplicate protection beyond the existing reservation lifetime or across process restarts. Those limits are outside this ticket.
- [x] Run the existing retry middleware/store suites and the disconnect regression, then review only this ticket's diff and connected code with Ponytail Review.

## Completion evidence (2026-10-19)

- Removed the response-close release and its now-unused bookkeeping. Client disconnects leave reservations intact; eventual JSON responses still record their results through the existing replay path. The default 60-second reservation timeout is unchanged.
- Added a real HTTP disconnect regression using an aborted client request and gated collection creation in the existing file-backed store. Before the fix, the retry incorrectly returned 201 and started another write. After the fix, it returns 409 until the original completes, then replays the original 201 response with exactly one collection persisted and one handler execution.
- All 34 tests passed across four focused suites: retry middleware, retry store, patron collections API, and Goal Cycle routes. Existing reservation-expiry, connected-request, caller-isolation, and replay checks remain green.
- Backend build and focused TypeScript checking of the changed middleware/test and their imports passed.
- Ponytail Review inspected only this ticket's middleware/test diff against the ticket 01 baseline and the connected store/caller behavior. No blocking findings remained. The production implementation removes code without adding dependencies or changing business services.
- Live database concurrency and process-restart behavior were not tested. Protection still ends at the existing reservation lifetime; tickets 03 and 04 remain separate work.
