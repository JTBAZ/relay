# 01: Isolate replay responses by caller and target

**What to build:** A creator or patron can retry an operation and receive only that caller's response for the intended target. Reusing a client key across accounts or different posts or collections must never replay another operation's result or skip the intended write.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Priority:** P1

**Source:** HTTP retry handling Ponytail Review, finding 1. The review reproduced replay across authenticated accounts and across collection targets because the cache identity includes only the route scope and client key.

**Scope:** Shared retry middleware, its existing authenticated route wiring, and focused regression tests. Preserve authentication and resource authorization. Do not replace the store, introduce dependencies, change business services, or refactor unrelated routes.

- [ ] Two authenticated callers using the same client key and request body execute independently and cannot receive each other's cached response, in-flight conflict, or body-mismatch result.
- [ ] The same caller using the same key and body for different concrete post or collection targets cannot receive the first target's success for the second target. Execute independently or reject changed-target reuse explicitly.
- [ ] The replay identity uses server-established caller context and the HTTP method and concrete target. It does not use a client-supplied account identity or store raw session credentials.
- [ ] A retry by the same caller for the same operation replays the original response; changed-body reuse retains its existing rejection behavior.
- [ ] All 11 enabled route call sites retain authentication before replay handling. Missing required caller context fails closed when a replay key is supplied.
- [ ] Requests without a replay key retain their existing behavior.
- [ ] Focused regression tests cover two accounts, two concrete targets, legitimate replay, changed bodies, and missing caller context. Include representative authenticated route wiring rather than testing key formatting alone.
- [ ] Run the existing retry middleware/store suites and relevant route checks, then review only this ticket's diff and connected code with Ponytail Review.
