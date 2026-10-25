# Grounded performance findings and interpretation

Status: SPP-02 accepted, 2026-10-23. Sol planned this ticket, Luna implemented it, and the supervisor reviewed and independently verified the tests and backend build. Routes, session persistence, and UI remain later tickets.

## Implementation scope

Add a pure findings/answer module over the accepted `PiecePerformanceFacts`. Each server-rendered finding cites existing metric or coverage IDs. Validate the model's exact selection shape and its referenced finding IDs. The model chooses emphasis and ordering; it supplies no new numbers, citations, actions, or free-form factual sentences. Mandatory freshness and missing-data notices survive that choice. A valid no-data result needs no second model call. A provider failure after evidence is loaded returns deterministic findings while the client request remains active.

Extend the existing editor read-tool contract with an opt-in `readPiecePerformance` tool whose arguments contain only range and destination. The route adapter will bind the subject in SPP-03. Both legacy and compiled interpreters may enter this branch only when the first provider response requests that one tool, without other tool calls or prior repair/escalation. Read once, then make at most one final finding-selection call. Preserve the current cart and return no patch. Disabled capability and normal editing paths retain their existing behavior.

Expected edit scope is a new `src/analytics/piece-performance-findings.ts`, a small shared performance interpreter helper if useful, `src/gallery-editor/intent.ts`, the active compiled interpreter, and focused findings/interpreter tests. The existing provider file contains unrelated changes and is outside this ticket. Do not change accepted SPP-01 code, routes, service persistence, Prisma schema, web, runtime model configuration, or the credit product.

## Request bound refinement

The existing editor's first request includes current cart/context and history before it knows whether the creator is asking about performance. Enforcing the originally proposed 16 KiB limit on that shared first request would change valid editing behavior or require another routing call. Preserve its established limits, exact provider configuration, deadline, and durable budget. Apply the 16 KiB complete-request limit to the new performance-specific synthesis call. This changes no existing request ceiling and adds no hidden classifier or provider retry.

The supervisor records this implementation refinement in the parent plan. Count all provider attempts from the start of the submitted turn; entering performance never resets call counts. The performance branch permits two attempts total, including the first tool-selection call. Both remain accounted through the existing injected provider budget.

## Acceptance checks

Use injected read adapters and fake providers for legacy and compiled modes. Cover strict tool arguments, valid/invalid/duplicate finding IDs, extra fields, unavailable evidence, no-data without a second call, failure/budget/timeout fallback, cancellation, and unchanged cart/session input. Check that actual fact values alone supply rendered numbers and that missing/zero/stale evidence yields the right sentences. Unsupported scopes and mixed write requests must not stage edits through this branch.

Run focused findings/interpreter tests and the existing editor intent/compiled-intent suites, plus the accepted SPP-01 regression suite and backend build. Review only the ticket's exact new files and shared-file hunks, with connected callers. Record results and any remaining limitations before accepting SPP-02.

## Implemented contract and review

The new findings module validates facts, renders cited counts and changes, and adds mandatory missing-data and freshness notices. A reach-with-zero-response finding requires positive captured reach and measured zero likes and comments for the same post, platform, source and capture time. It never treats missing response data as zero. The optional model call selects finding IDs only; it cannot author factual prose or metric values.

Both interpreters expose the read tool only on the first response when enabled. The dedicated branch returns cloned actions, no patch, and a typed `performanceOutcome`. Clarifications and limitations use that same read-only marker so SPP-03 can preserve the cart. At the SPP-02 handoff, routes contained only an unsupported-adapter compatibility case. The authenticated adapter and history path were subsequently connected and verified in SPP-03.

The scoped Ponytail Review covered both new modules, the performance hunks in `intent.ts` and `compiled-intent.ts`, the one route compatibility case, their tests, and the connected SPP-01/provider/compiler contracts. Sol provided a separate read-only contract review. Fixes address source-failure wording, mandatory no-data notices, malformed evidence, response-size narrowing before synthesis, deadline versus cancellation, invalid model output, and known versus unknown provider charges. A shared helper owns the synthesis prompt.

On 2026-10-23 the supervisor independently ran the five focused suites: 122 tests passed (25 subject/evidence, 7 findings, 36 performance interpreter, 33 legacy interpreter and 21 compiled interpreter tests). The separate accepted analytics regression run passed 82 tests; these counts overlap in the 25 subject/evidence tests. The independent backend build passed. Luna also ran a strict, no-emit NodeNext TypeScript check of all three new test files and their imports; it passed. The backend build excludes tests, so that separate check supplies test type verification.

These checks use injected adapters and provider responses. They establish the contracts and failure handling, not live model routing quality, real-account coverage, PostgreSQL execution or chat/browser integration. No live or paid model call was made.

No blocking finding remains in the reviewed scope. SPP-03 may connect the authenticated adapter and append-only history path.
