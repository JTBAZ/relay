# 01: Isolate replay responses by caller and target

**What to build:** A creator or patron can retry an operation and receive only that caller's response for the intended target. Reusing a client key across accounts or different posts or collections must never replay another operation's result or skip the intended write.

**Blocked by:** None (can start immediately).

**Status:** complete

**Priority:** P1

**Source:** HTTP retry handling Ponytail Review, finding 1. The review reproduced replay across authenticated accounts and across collection targets because the cache identity includes only the route scope and client key.

**Scope:** Shared retry middleware, its existing authenticated route wiring, and focused regression tests. Preserve authentication and resource authorization. Do not replace the store, introduce dependencies, change business services, or refactor unrelated routes.

- [x] Two authenticated callers using the same client key and request body execute independently and cannot receive each other's cached response, in-flight conflict, or body-mismatch result.
- [x] The same caller using the same key and body for different concrete post or collection targets cannot receive the first target's success for the second target. Execute independently or reject changed-target reuse explicitly.
- [x] The replay identity uses server-established caller context and the HTTP method and concrete target. It does not use a client-supplied account identity or store raw session credentials.
- [x] A retry by the same caller for the same operation replays the original response; changed-body reuse retains its existing rejection behavior.
- [x] All configured replay consumers (11 direct route handlers and 21 delegated Goal Cycle handlers) authenticate before replay handling. Missing required caller context fails closed when a replay key is supplied.
- [x] Requests without a replay key retain their existing behavior.
- [x] Focused regression tests cover two accounts, two concrete targets, legitimate replay, changed bodies, and missing caller context. Include representative authenticated route wiring rather than testing key formatting alone.
- [x] Run the existing retry middleware/store suites and relevant route checks, then review only this ticket's diff and connected code with Ponytail Review.

## Completion evidence (2026-10-19)

- Reservations now distinguish the server-authenticated caller, method, full mounted target path, route scope, and client key. Body mismatch checks remain unchanged.
- The caller audit found 21 delegated Goal Cycle consumers beyond the original 11 direct call sites. A shared guard establishes creator identity before their replay middleware; feature-disabled, database-unavailable, and no-key requests preserve their existing behavior.
- All 46 tests passed across six focused suites: retry middleware, retry store, patron collections API, Goal Cycle routes, creator profile API, and account authorization. Regressions exercise real authenticated collection creation and attachment, mounted router paths, method isolation, and Goal Cycle replay with invalid credentials.
- Backend build and focused TypeScript checking of the changed implementation/tests and their imports passed.
- Ponytail Review covered only this ticket's implementation/test diff and connected callers/store code. No blocking findings remained. The single-API-process assumption is unchanged; live production topology and database concurrency were not tested.
- Tickets 02, 03, and 04 remain separate work. This change does not alter disconnect cleanup, reservation expiry ownership, or server-error replay policy.
