# Goal Cycle Dream Flow Acceptance

**Purpose:** Pass/fail contract for the complete Library-first Goal Cycle experience  
**Product contract:** [`../studio/GOAL_CYCLE_PRODUCT_CONTRACT.md`](../studio/GOAL_CYCLE_PRODUCT_CONTRACT.md)  
**Program:** [`../studio/goal-cycle-build-plans/00-README.md`](../studio/goal-cycle-build-plans/00-README.md)

## Fixture persona

Use one creator with:

- linked Patreon plus at least one linked posting destination;
- six months of mixed post performance;
- one paid-support campaign with deterministic and estimated fixtures;
- fresh, weak, and unavailable trend-evidence fixtures;
- one Coach Plan credit;
- extension grant in a test profile;
- no active Goal Cycle at test start.

The canonical Dream fixture is owned by VS0. Tests must not depend on a live trend vendor.

## Dream UX steps

### DF-01 — Enter from Library

The creator sees the correct Library entry state: **plan this month** when no cycle exists, **resume Plan** when one is active, or **review completion / plan next cycle** when completion is suggested/confirmed. The creator starts or resumes from Library. The Schedule Rail remains mounted and visible. `/studio/goals` is secondary, not required for initial planning.

**Fail:** the launcher shows the wrong cycle state, navigation loses Library context, creates a cycle on GET, or hides the rail for the entire flow.

### DF-02 — Select a bounded goal

The creator can select engagement, views, paid support, or take a break. Break branches expose complete silence, social upkeep, and active rest. Goal help explains what Relay can actually measure.

**Fail:** reach is presented as paid support, rest is framed as failure, or freeform goals bypass validation.

### DF-03 — Add context and research

The creator adds bounded context and optional trend notes. Research shows operational progress and source/freshness/confidence evidence without chain-of-thought. Weak evidence is disclosed and the flow continues from creator history.

**Fail:** unsupported volume claims appear, provider text controls the UI, or a weak source silently becomes high confidence.

### DF-04 — Answer questions

Coach asks no more than two bounded clarification questions. Answers persist through close/reopen and network retry.

**Fail:** an unbounded chat begins, a third required question appears, or resume loses accepted answers.

### DF-05 — Review and revise the Plan

The initial Plan contains no more than eight slots and only linked scheduling destinations. The creator can request at most two AI revisions and can manually edit after the cap. Each revision explains material changes.

**Fail:** revision retry consumes another credit, unlinked destinations become tasks, or a ninth slot is silently accepted.

### DF-06 — Confirm logistics

The creator confirms date/time/time zone, destination, format, and media readiness. Missing media is allowed and represented honestly. DST and month-boundary dates display consistently.

**Fail:** browser-local time silently changes persisted creator-local intent.

### DF-07 — Approve and materialize

One approval atomically/idempotently consumes the reserved credit and creates unpublished posts, per-post plans, variants, tasks, times, and rail events. Duplicate clicks/retries do not duplicate any object.

**Fail:** rail choreography precedes persistence success, a planned post counts as published, or partial materialization is shown as complete.

For complete silence, approval creates one idempotent zero-slot receipt, consumes no credit, schedules no post/task, activates the chosen reminder-suppression interval, and suggests completion when that interval ends.

### DF-08 — Execute with human confirmation

The rail and extension open the correct post/task/destination. The creator attaches media when needed and explicitly confirms publish. Task/post/rail state converges after completion or retry.

**Fail:** Relay autonomously publishes, exposes a private media URL, or marks a failed destination as published.

### DF-09 — Evaluate outcomes

The cycle audit shows target versus actual, data freshness, coverage, and confidence. Deterministic paid support is separate from estimated lift. Relay may suggest completion; the creator confirms it.

**Fail:** unavailable is rendered as zero, estimated is rendered as deterministic, or a cycle closes silently.

### DF-10 — Learn into the next cycle

Relay proposes an explainable next adjustment based on stored outcomes and optional reflection. The creator confirms or rejects it. A later cycle may start in the same month only after the active cycle is completed/cancelled.

**Fail:** the system changes the creator’s goal or cadence without confirmation, or two active cycles coexist.

## Cross-cutting matrix

Every owning slice must cover applicable cases:

- creator/tenant isolation;
- keyboard-only and screen-reader semantics;
- reduced motion;
- narrow and wide Library layouts;
- loading, empty, retryable, permanent-failure, and resume states;
- no-credit and reservation-conflict states;
- AI malformed/timeout/rate-limit states;
- provider weak/timeout/disabled states;
- duplicate mutation and concurrent request states;
- UTC, DST transition, and month-boundary scheduling;
- extension unavailable/revoked/outdated states;
- deterministic, estimated, insufficient, zero, and unavailable analytics;
- structured logs without prompts, provider text, tokens, or patron identity.

## Required automated gates

Worker docs specify focused commands. The final slice must also run the repository-supported equivalents of:

```bash
npm run test
npm run build
npm run build --prefix web
npm run lint --prefix web
npm run build --prefix extension
```

Database-backed integration tests run when `DATABASE_URL` is available. Live AI/provider checks are staging gates, not fixture-suite prerequisites.

## Browser acceptance

Run DF-01 through DF-10 against a real local or staging DB with jobs enabled. Capture:

- cycle and credit IDs;
- created post/plan/variant/task IDs;
- rail and extension screenshots;
- source/confidence labels;
- duplicate-approval evidence;
- final outcome snapshot;
- accessibility findings.

If a human-only provider, billing, OAuth, or browser-store gate is unavailable, stop once, record the exact blocker, and do not substitute fabricated success.

## Failure ownership

VS11 verifies; it does not silently add features. A failure reopens the slice named in [`TRACEABILITY.md`](../studio/goal-cycle-build-plans/TRACEABILITY.md), with expected versus actual, reproduction, logs, and the smallest owning batch.
