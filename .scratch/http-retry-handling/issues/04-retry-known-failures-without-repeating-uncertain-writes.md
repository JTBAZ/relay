# 04: Retry known failures without repeating uncertain writes

**What to build:** A creator or patron can retry after a temporary failure known to have happened before any write. A failed response with an uncertain or already committed write remains protected from automatic re-execution rather than being treated as safely retryable.

**Blocked by:** 03: Protect newer reservations from expired requests. Failure cleanup must only release the reservation owned by that request.

**Status:** ready-for-agent

**Priority:** P2

**Source:** HTTP retry handling Ponytail Review, finding 4. The review reproduced a transient HTTP 500 being replayed after recovery because every JSON response receives the same 24-hour cache lifetime.

**Scope:** Failure outcome classification at the retry middleware boundary and the smallest affected handler changes needed to demonstrate a known pre-write failure and an uncertain outcome. Inspect enabled routes only far enough to establish safe classification. Do not rewrite their transactions or silently extend this ticket into business-service refactoring.

- [ ] Establish an explicit, minimal distinction between a failure known to precede any write and an uncertain or committed outcome. HTTP 500 alone is not evidence that a write did not happen.
- [ ] A representative authenticated mutation that fails before writing can release its owned reservation. Retrying the same key after recovery reaches the handler, succeeds, and produces exactly one persisted mutation.
- [ ] A representative operation that commits and then fails in follow-up work does not execute its write again on retry. Preserve duplicate protection and document its retry response.
- [ ] Unclassified failures default to preserving duplicate protection. Do not implement a blanket release or cache bypass for every server error.
- [ ] A late failure from an expired request cannot release a newer reservation, using the ownership contract delivered by ticket 03.
- [ ] Successful responses, existing deterministic client-error replay, caller/target isolation, and unchanged no-key requests retain their behavior.
- [ ] Add focused regressions for pre-write recovery, uncertain post-write failure, and stale-owner cleanup. Align the retry contract documentation with the implemented behavior.
- [ ] If safely resolving an uncertain outcome requires changing a business transaction or another feature, report that as a separate scoped follow-up; do not expand this ticket or claim that outcome is safe.
- [ ] Run the existing retry middleware/store suites and affected handler checks, then review only this ticket's diff and connected code with Ponytail Review.
