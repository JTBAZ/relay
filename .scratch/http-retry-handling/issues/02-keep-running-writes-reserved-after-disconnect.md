# 02: Keep running writes reserved after disconnect

**What to build:** When a creator or patron loses their connection during a write, a retry remains blocked while the original operation is still running and its reservation remains valid. When the original operation succeeds, its result remains available for replay even if its client has disconnected.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Priority:** P2

**Source:** HTTP retry handling Ponytail Review, finding 2. The review reproduced two writes after a response close released the first operation's reservation while its handler continued running.

**Scope:** Retry middleware response lifecycle and focused regression tests, with a representative non-deduplicating write such as collection creation. Do not redesign business services, add a new cancellation system, replace the store, or change the reservation timeout.

- [ ] Closing or aborting a response alone does not release the reservation for a handler that may still write.
- [ ] A controlled test starts a write, disconnects its client before completion, and retries before reservation expiry. The retry receives the existing in-flight response and does not start another write.
- [ ] Completing the original write after disconnect records its successful outcome. A subsequent retry replays that outcome, and the persisted write count remains one.
- [ ] Normal connected requests, successful replay, and the existing abandoned-reservation timeout continue to work.
- [ ] Do not claim duplicate protection beyond the existing reservation lifetime or across process restarts. Those limits are outside this ticket.
- [ ] Run the existing retry middleware/store suites and the disconnect regression, then review only this ticket's diff and connected code with Ponytail Review.
