# Performance turns and saved answers

Status: SPP-03 accepted, 2026-10-23, after SPP-02 acceptance. Planned by Sol and implemented by Luna, with supervisor review and independent verification. No deployment or live-account writes are included.

## Route and session contract

Extend the existing editor turn with one optional exact `performanceSubject` reference. Freeze validated context and selection before provider work. Authenticate the actor, creator and session and check the session revision first. Bind `readPiecePerformance` to those server-controlled values; its model arguments remain range and destination only.

Pass the submitted subject scope to both interpreters as selection context. An explicit work hint must remain visible when it has several selected anchors; otherwise the interpreter sees multiple posts and may ask for a selection that the creator already supplied. This descriptor conveys intent only. The authenticated adapter still owns ID resolution, complete membership and ownership checks.

Enable the capability only when `RELAY_GALLERY_EDITOR_PERFORMANCE_ENABLED=1`, the editor creator allowlist permits the account, and the required stores are ready. Return `performance: { enabled, aiAvailable }` in capabilities. Preserve the existing mutation authorization restrictions and feature-off editing path.

Use the SPP-02 typed performance outcome to choose an append-only completion. Answers and analytics clarifications must bypass `service.revise`. Add `appendPerformanceTurn` to the existing service and serializable transaction: read the owned session, compare its revision, re-read the subject binding through the transaction, check the fingerprint, then compare-and-set the session row. Append to the transaction's current messages with the existing 40-message limit. Update session revision and submitted validated context as needed. Preserve the stored cart exactly, including its own revision, actions, dependencies, conflicts, origins and manual choices.

A message-only turn can make session revision exceed cart revision. Verify that the next compiled edit uses cart revision and Apply uses session revision. Subject deletion, membership/link changes, stale revision, and cancellation save no answer. Evidence collected after the frozen cutoff does not invalidate a saved report.

Persist an assistant-only optional `performanceAnswer` in existing JSON. Validate its schema, evidence references, findings and local analytics links on creation and session read-back. Legacy text messages remain readable; malformed attachments must never render as trusted metrics. Use type-only imports in shared browser-facing types. No new table or conversation store is needed.

Connect request cancellation to `req.aborted` and premature response close. Normal request-body completion must not cancel the turn. Recheck cancellation before the compare-and-set. Preserve the existing deadline and provider accounting. Extend the web send wrapper with the optional subject and AbortSignal.

## Verification

Cover capabilities off/on, authorization, invalid/foreign hints, frozen selection, authenticated adapter binding, typed read-only versus legacy edit completion, disconnect and no unintended writes. Service tests must cover exact cart equality, saved attachment read-back, malformed JSON, retention, actor isolation, subject changes, stale-session races, and the next edit/Apply after an answer.

Use the existing isolated PostgreSQL test harness only when its explicit local test URL is configured. Never substitute the ordinary database URL. At planning time the test URL is absent and no PostgreSQL Windows service was found; record skipped database verification separately from fake-adapter tests. Run affected tests, accepted analytics/interpreter regressions, and the backend build. Review exact task hunks and connected callers before accepting this ticket.

## Implemented behavior and review

The authenticated route now freezes the submitted context, resolves its owned binding, and supplies only range/destination arguments to the read adapter. Both interpreter modes receive the selected subject kind. Answers and tagged analytics clarifications use `appendPerformanceTurn`; ordinary edits retain `revise`.

The append transaction validates the saved attachment, rechecks actor/creator ownership and revision, compares the current subject binding, and writes only messages, context and session revision. It checks cancellation before and after the compare-and-set and read-back. The route keeps disconnect listeners installed until that awaited transaction finishes. The stored conversation context remains server-owned.

Saved-answer validation rebuilds deterministic finding templates from the attached facts, checks citation membership and local inspector links, and enforces the complete 64 KiB bound. Comparisons tolerate JSON object key reordering. Summary validation follows the finalizer's ordered finding prefixes instead of searching permutations. Malformed attachments become an explanatory message; valid text-only history remains compatible. The assistant attachment type uses a discriminated message union.

The subject reader also now uses the existing Relay naming resolver for custom and inherited post/work/series titles. This is a scoped SPP-01 integration correction: the report identifies the piece under its displayed Relay name, and that name participates in binding changes. Creator checks on each naming relation prevent a foreign title from entering the report. Existing analytics inspectors and Coach output are unchanged.

The supervisor's scoped Ponytail Review and Sol's independent read-only pass found and resolved object-key-order comparison, cancellation listener lifetime, in-transaction cancellation, subject equality, and whole-attachment bounds issues. Review covers this ticket's exact service/route/type/API hunks, the new attachment validator and naming projection, focused tests, and their connected callers. No unrelated working-tree change was included.

## Acceptance verification

After the final route disconnect and SQL test additions, the supervisor independently ran 12 affected and regression suites: all 208 tests passed. These cover subject/evidence, findings, both interpreters, persistence, routes, existing analytics and Coach. Luna's strict focused test TypeScript check passed. The supervisor's backend build after the final source changes passed.

The supervisor found the already-installed PGlite and socket packages and generated an empty-to-current schema script with read-only Prisma diff. A temporary runner created an in-memory database on a random loopback port and set both database variables to that disposable URL in its child process. Two integration cases passed after the final source changes: save/read-back, exact cart preservation, subsequent compiled edit and Apply; and actual native Relay SQL projection, with three views reported as window activity and no captured-total claim. The 26 unrelated PostgreSQL cases were excluded by the test-name filter. The runner closed the database afterward. No ordinary database URL, installed dependency, runtime environment file, or running application server was changed.

PGlite executes the Postgres engine through WebAssembly and exercises JSONB and transaction behavior. Its connection multiplexer does not establish native Postgres concurrency, production load, migration deployment, query latency, or real-account coverage. The adapter emitted a `pg` concurrent-query deprecation warning during execution; both cases passed. No blocking finding remains in this scope. SPP-04 may mount the result in the product chat.
