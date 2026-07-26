# VS11 Build Plan — Production Verification and Staged Rollout

## Outcome

Verify the complete Dream flow against real DB/jobs/AI/provider/extension paths, diagnose failures back to owning slices, and stage a reversible creator-entitled rollout with observability and runbooks.

## Scope

In: integrated automation, browser/extension acceptance, isolation/concurrency/failure/accessibility/performance/security checks, feature flags, rollout/rollback.

Out: unplanned feature fixes, self-approval of provider/credit gates, broad redesign, immediate all-creator launch.

## Dependencies and permitted parallel work

Depends on VS8 and VS9. VS10 is required only for live-provider checks and rollout with `TREND_MODE=live`; fixture/history-only verification and an explicitly provider-disabled pilot may proceed while VS10 is blocked. Automated matrices may run in parallel by concern; browser Dream flow and rollout decision are serial after failures are resolved by owning slices.

## Required reading

1. [`../../qa/GOAL_CYCLE_DREAM_FLOW_ACCEPTANCE.md`](../../qa/GOAL_CYCLE_DREAM_FLOW_ACCEPTANCE.md)
2. [`TRACEABILITY.md`](TRACEABILITY.md)
3. all prior Delta Outs
4. `.cursor/rules/rescue-workflow-always.mdc`
5. extension operations docs and trend-provider runbook
6. production observability/feature-flag conventions

## Verification roles

VS11 workers diagnose and report. If a test reveals missing behavior, reopen the smallest owning todo from `TRACEABILITY.md`; do not silently fix production code in the verification batch.

Evidence record fields: acceptance ID, environment/build SHA, creator/tenant fixture, expected/actual, IDs created, command/browser steps, logs/metrics, screenshot where useful, owner slice, disposition.

## Rollout controls

Required independently reversible controls:

- creator entitlement;
- Goal Cycle UI/API master flag;
- AI planning flag;
- live trend provider mode and kill switch;
- materialization flag;
- background outcome/credit job flags;
- extension packet compatibility version.

Rollback disables new starts/materialization first while preserving read/resume/audit access and existing scheduled tasks.

## Files

Create:

- `tests/goal-cycle/goal-cycle-dream-flow.integration.test.ts`
- `tests/goal-cycle/goal-cycle-security-concurrency.integration.test.ts`
- `tests/goal-cycle/goal-cycle-failure-matrix.integration.test.ts`
- `tests/web/goal-cycle-accessibility.test.tsx`
- `docs/operations/goal-cycle-runbook.md`
- `docs/qa/goal-cycle-release-evidence.md`

Edit only when tests/controls already have an owning contract:

- feature-flag/entitlement configuration
- observability dashboards/alerts
- release documentation

Do not touch:

- product behavior owned by VS0–VS10
- provider approvals or allowance values
- production flags before human rollout approval
- generated release evidence from a different build

## Todo work items

### VS11-T01 — Run automated integration matrix

Verify full lifecycle, tenant isolation, duplicate approval, credit concurrency, AI malformed/timeout, provider weak/disabled/outage, time zones/DST/month boundaries, attribution labels, partial execution, late outcomes, and learning confirmation.

### VS11-T02 — Run web accessibility/performance gate

Check keyboard/screen reader semantics, focus, reduced motion, narrow/wide layouts, loading/retry, API latency budgets, bundle regressions, and no hidden chain-of-thought.

### VS11-T03 — Run browser Dream flow

Execute DF-01 through DF-10 with real local/staging DB and workers. Verify rail animation only after persistence and collect created IDs/screenshots.

### VS11-T04 — Run extension/provider/operator gates

Verify due packet/deep links, revoked/offline/outdated extension, human publish confirmation, live provider provenance/cost/kill switch, and human-only blockers.

### VS11-T05 — Verify observability and rollback

Test alerts for credit drift, materialization failures, provider circuit breaker, job lag, extension packet errors, and attribution refresh. Rehearse disabling new starts while preserving audit/execution.

### VS11-T06 — Stage rollout and record evidence

Roll out to internal fixture creator, then an approved pilot cohort, monitor agreed period, and expand only after explicit human sign-off. Record build SHA, flags, owners, metrics, incidents, and rollback results.

## Safe batches

- Batch 1: VS11-T01 only.
- Batch 2: VS11-T02 + focused accessibility evidence.
- Batch 3: VS11-T03 only.
- Batch 4: VS11-T04 only.
- Batch 5: VS11-T05 only.
- Human gate/batch 6: VS11-T06.

## Verification commands

```bash
npm run test
npm run build
npm run lint --prefix web
npm run build --prefix web
npm run build --prefix extension
npx vitest run tests/goal-cycle/goal-cycle-dream-flow.integration.test.ts
npx vitest run tests/goal-cycle/goal-cycle-security-concurrency.integration.test.ts tests/goal-cycle/goal-cycle-failure-matrix.integration.test.ts
npx vitest run tests/web/goal-cycle-accessibility.test.tsx
```

Use `npm run dev:stack:restart` before final browser verification when required by repository rules.

## Exit gate

All applicable DF and cross-cutting cases pass for one immutable build; remaining human gates are signed; rollback is rehearsed; alerts and owners exist; release evidence contains no secrets; no failure remains assigned but unresolved.

## Human stop conditions

Stop for production migration/flags, pilot cohort selection, provider activation, allowance configuration, extension-store action, privacy/security exception, or expansion beyond the approved cohort.

## Delta Out

Include build SHA, environment, command results, acceptance evidence, reopened slices, human signatures/blockers, active flags, monitoring window, incident owner, and rollback command/runbook reference.

### Batch 1 — VS11-T01 (2026-07-17)

```text
Goal Cycle Delta Out
- Slice / claimed todos: VS11 / VS11-T01
- Completed:
  - Automated integration matrix (fixture always-on + real-DB when tables present):
    DF-02/03/05/09/10 contract asserts; lifecycle smoke (start→suggest/dismiss→confirm→
    learning reject/accept→same-month restart); concurrent free silence one-active;
    cross-tenant 404; version-safe checkpoint; failure matrix (provider modes, stale,
    estimated≠complete, plan validation caps, DST sync, outcome job kill-switch)
- Files created/edited:
  - tests/goal-cycle/goal-cycle-dream-flow.integration.test.ts (new)
  - tests/goal-cycle/goal-cycle-security-concurrency.integration.test.ts (new)
  - tests/goal-cycle/goal-cycle-failure-matrix.integration.test.ts (new)
  - docs/studio/goal-cycle-build-plans/00-README.md (VS11 → In progress)
- Migration and backfill state: none (no auto-migrate; DB cases skip if tables absent)
- Contracts changed: none (verification only)
- Commands and results:
  - npx vitest run tests/goal-cycle/goal-cycle-dream-flow.integration.test.ts
    tests/goal-cycle/goal-cycle-security-concurrency.integration.test.ts
    tests/goal-cycle/goal-cycle-failure-matrix.integration.test.ts → 19 passed
  - build SHA (local HEAD): b07dc85
- Manual/browser checks: deferred to VS11-T03
- Feature flags / kill switches observed: RELAY_GOAL_CYCLE_ENABLED=1 for DB smoke;
  TREND_MODE fixture/history_only/disabled covered; live vendor not exercised (VS10)
- Known risks or human gates:
  - Concurrent losers log Prisma unique-constraint noise (mapped to GOAL_CYCLE_ACTIVE_EXISTS) — expected
  - Legacy VS1 isolation concurrent *engagement* starts need credit seed; VS11 matrix uses free silence for race purity (not a product reopen)
  - Live trend / production flags / pilot cohort remain human gates (VS10 / VS11-T06)
- Reopened slices: none
- Next unblocked todo IDs: VS11-T02 (Batch 2)
```

### Batch 2 — VS11-T02 (2026-07-17)

```text
Goal Cycle Delta Out
- Slice / claimed todos: VS11 / VS11-T02
- Completed:
  - Web accessibility / performance gate (verification-only):
    dialog/CTA semantics (aria-haspopup, aria-expanded, aria-modal, labelledby);
    Escape focus return + polite live region; goal choice pressables;
    error alert + named Retry; goals audit list/pressed cards/loading/error alert;
    prefers-reduced-motion CSS + collapsed rail timings; narrow/wide breakpoints;
    Loading… CTA; retryable failure without CoT leak; research "no chain-of-thought";
    CSS size budget (<48KB); fixture hydrate latency budget (<1.5s); no huge inline SVG
- Files created/edited:
  - tests/web/goal-cycle-accessibility.test.tsx (new)
  - docs/studio/goal-cycle-build-plans/12-VS11-PRODUCTION-VERIFICATION.md (Delta Out)
- Migration and backfill state: none
- Contracts changed: none (verification only; no product UI changes)
- Commands and results:
  - npx vitest run tests/web/goal-cycle-accessibility.test.tsx → 14 passed
  - build SHA (local HEAD): b07dc85
- Manual/browser checks: deferred to VS11-T03 (Dream flow DF-01..10)
- Feature flags / kill switches observed: none changed
- Known risks or human gates:
  - Full keyboard trap / axe-core browser pass deferred to VS11-T03 browser Dream flow
  - Network API latency SLOs / bundle CI budgets deferred to VS11-T05 observability
  - Production flags / pilot cohort remain human gates (VS11-T06); VS10 still blocked
- Reopened slices: none
- Next unblocked todo IDs: VS11-T03 (Batch 3)
```

**Slice status:** VS11 remains **In progress** (Batches 1–3 complete; T04–T06 pending).

### Batch 3 — VS11-T03 BLOCKED then CLEARED (2026-07-18)

Earlier same-day attempt blocked on Redis `:6379` / Docker Desktop. Redis restored; browser pass completed.

```text
Goal Cycle Delta Out
- Slice / claimed todos: VS11 / VS11-T03
- Completed:
  - Browser Dream flow (Dev Ava, fixture mode) after Redis up
  - Silence path: Plan this month → break/complete silence → context → research skip →
    questions none → logistics → approve zero-slot receipt → /studio/goals
  - DF-01..07 pass; DF-08 N/A (no rail tasks); DF-09 partial; DF-10 not yet
  - Evidence file: docs/qa/goal-cycle-release-evidence.md
- IDs:
  - cycle: cmrqdnlq900015cwopnnugcdk
  - receipt: approve_cmrqdnlq900015cwopnnugcdk_bd4bf59a-9905-47a3-abd4-e14634f132c1
- Files created/edited:
  - docs/qa/goal-cycle-release-evidence.md
- Migration and backfill state: none
- Contracts changed: none
- Commands and results:
  - Redis open; /api/v1/health 200; web 200
  - Browser pilot-ux + Dream flow as above
  - build SHA: b07dc85
- Manual/browser checks: yes (silence path)
- Feature flags: RELAY_GOAL_CYCLE_* on; TREND_MODE=fixture
- Known risks or human gates:
  - Full DF-08/09/10 need engagement (or elapsed silence) path
  - Next batch VS11-T04 includes extension + provider gates (expect stop without human)
- Reopened slices: none
- Next unblocked todo IDs: VS11-T04 (Batch 4)
```

### Claim — Batch 4 / VS11-T04 (2026-07-19)

```text
Goal Cycle claim
- Slice / claimed todos: VS11 / VS11-T04 only (max one numbered todo this claim)
- Parked adjacent work: Studio Create Event / Social Playbook product expansion
  (see docs/studio/PLAN_MANUAL_SOCIAL_EVENTS.md — Parked note). Shipped playbook v1 stays.
- Finish shape: fixture / provider-disabled Goal Cycle; VS10 remains Blocked;
  live-provider checks in T04 recorded as N/A — VS10 blocked (not invented passes).
- Includes T03 follow-ups where they unblock T04: engagement path for DF-08;
  fuller DF-09/10 when cycle state allows.
- Out of scope this claim: VS11-T05/T06, VS10 vendor activation, Coach conversational UX pass,
  new playbook templates, commits unless explicitly requested.
- Next action: execute VS11-T04 verification + append evidence/Delta Out.
```

### Batch 4 — VS11-T04 (2026-07-19)

```text
Goal Cycle Delta Out
- Slice / claimed todos: VS11 / VS11-T04
- Completed:
  - Extension gates (unit): due-packet context, deep-link sanitize, revoked/offline/outdated
    classification, never-auto-publish toast contract
  - Provider gates: TREND_MODE=fixture exercised in browser research; fixture/disabled/live
    guards covered by trend-evidence unit tests; live kill switch / provenance = N/A (VS10)
  - DF-08 engagement browser: Library → Engagement → context → research → questions →
    Plan (2 slots) → logistics → approve → rail events with Needs: attach_media;
    drafts unpublished; posting rhythm remained 0/1 (no autonomous publish)
  - Confirm-publish UI contract: EventPopover “never publishes” + media-gated CTA
    (goal-cycle-event-media.test.tsx)
- Files created/edited:
  - docs/qa/goal-cycle-release-evidence.md (VS11-T04 section)
  - docs/studio/goal-cycle-build-plans/00-README.md (Batch 4 done)
  - docs/studio/goal-cycle-build-plans/12-VS11-PRODUCTION-VERIFICATION.md (this Delta Out)
- Migration and backfill state: none
- Contracts changed: none (verification only)
- Commands and results:
  - npx vitest run tests/extension/goal-cycle-reminder.test.ts
    tests/goal-cycle/trend-evidence-boundaries.test.ts
    tests/goal-cycle/trend-evidence-store.test.ts → 24 passed
  - npx vitest run tests/web/goal-cycle-event-media.test.tsx → 5 passed
  - Stack health: API 200, web 200; build SHA b07dc85
- Manual/browser checks: yes — engagement Dream + DF-08 (see release evidence IDs)
- Feature flags / kill switches observed: RELAY_GOAL_CYCLE_* on;
  RELAY_GOAL_CYCLE_TREND_MODE=fixture; live vendor not exercised (VS10)
- Known risks or human gates:
  - Confirm-publish CTA withheld until media attached (by design); live extension toast
    optional/human; VS10 live kill switch remains blocked
  - DF-09/10 still need outcomes hydrate / completion for engagement cycle
- Reopened slices: none
- Next unblocked todo IDs: VS11-T05 (Batch 5) — not started this claim
```

### Claim — Batch 5 / VS11-T05 (2026-07-20)

```text
Goal Cycle claim
- Slice / claimed todos: VS11 / VS11-T05 only
- Finish shape: verify observability signals + rehearse rollback using existing flags;
  create ops runbook; document missing health/pager alerts honestly (no invented passes).
- Out of scope: VS11-T06 production/pilot flag flips, VS10 live circuit breaker,
  implementing full /health/goal-cycle unless required to unblock T05 verify.
- Next action: execute T05 + Delta Out; stop before T06.
```

### Batch 5 — VS11-T05 (2026-07-20)

```text
Goal Cycle Delta Out
- Slice / claimed todos: VS11 / VS11-T05
- Completed:
  - Created docs/operations/goal-cycle-runbook.md (flags, preferred rollback, signal
    inventory, verify commands, gaps)
  - Rollback rehearsal: mat-off refuses approve while ENABLED can stay true;
    outcome OUTCOME_REFRESH_MS=off kill-switch; master-off start reject; hard-stop
    GET-404 gap documented
  - Signal verify: credit reconcile tests; materialization_disabled contract;
    extension revoked/offline/outdated; circuit breaker N/A (VS10); no GC health
    gates.alerts (partial — follow-up)
  - tests/goal-cycle/goal-cycle-rollback-observability.test.ts (new)
- Files created/edited:
  - docs/operations/goal-cycle-runbook.md (new)
  - tests/goal-cycle/goal-cycle-rollback-observability.test.ts (new)
  - docs/qa/goal-cycle-release-evidence.md (VS11-T05)
  - docs/studio/goal-cycle-build-plans/00-README.md
  - docs/studio/goal-cycle-build-plans/12-VS11-PRODUCTION-VERIFICATION.md (this Delta Out)
- Migration and backfill state: none
- Contracts changed: none
- Commands and results:
  - npx vitest run tests/goal-cycle/goal-cycle-rollback-observability.test.ts
    tests/usage/coach-plan-credit-service.test.ts
    tests/extension/goal-cycle-reminder.test.ts
    tests/goal-cycle/contracts.test.ts → 26 passed
  - npx vitest run tests/goal-cycle/goal-cycle-vs9-prove.test.ts
    tests/goal-cycle/goal-cycle-service.test.ts
    -t "kill-switch|rejects disabled" → 2 passed
  - build SHA: b07dc85
- Manual/browser checks: none required (ops/flags verification)
- Feature flags / kill switches observed: documented in runbook; local .env remains
  fixture/dev-on; no production flips
- Known risks or human gates:
  - No /api/v1/health/goal-cycle or pager alerts for six signals (VS11 follow-up
    before exit gate “alerts exist”)
  - ENABLED=false 404s audit/GET — prefer mat/AI/job offs for preserve-audit rollback
  - Live provider circuit breaker → VS10
- Reopened slices: none (gaps assigned to VS11 follow-up / VS10, not silent product fix)
- Next unblocked todo IDs: VS11-T06 (human Batch 6) — not started this claim
```

### Claim — Batch 6 / VS11-T06 (2026-07-20)

```text
Goal Cycle claim
- Slice / claimed todos: VS11 / VS11-T06 only (human gate batch)
- Agent scope: Stage A internal-fixture evidence package; exit suite re-run;
  sign-off checklist; stop at pilot cohort / production flags.
- Out of scope / stop conditions: production migration/flags, pilot cohort
  selection, provider activation (VS10), allowance config, extension-store,
  expansion beyond approved cohort, forging human signatures.
- Next action: package evidence; leave VS11 In progress until humans sign.
```

### Batch 6 — VS11-T06 (2026-07-20) — agent package; human sign-off pending

```text
Goal Cycle Delta Out
- Slice / claimed todos: VS11 / VS11-T06
- Completed (agent):
  - Stage A: internal fixture creator (Dev Ava) recorded from T03/T04 evidence
  - Release package: build SHA b07dc85, local flags, owners, rollback runbook ref,
    open gaps, human sign-off checklist (blank)
  - Exit verification re-run: dream-flow + security/concurrency + failure-matrix +
    accessibility + rollback-observability → 38 passed
  - Stage B pilot cohort / production expansion: STOPPED for human
- Files created/edited:
  - docs/qa/goal-cycle-release-evidence.md (VS11-T06 section)
  - docs/studio/goal-cycle-build-plans/00-README.md (Batch 6 awaiting human)
  - docs/studio/goal-cycle-build-plans/12-VS11-PRODUCTION-VERIFICATION.md (this Delta Out)
- Migration and backfill state: none
- Contracts changed: none
- Commands and results:
  - vitest exit suite → 38 passed; API/web 200; SHA b07dc85
- Manual/browser checks: reused Stage A evidence (no new production deploy)
- Feature flags / kill switches observed: local fixture mode only;
  production flags NOT flipped
- Known risks or human gates:
  - Pilot cohort, monitoring window, staging/prod enablement, VS11 Done → human
  - Health/dashboard alerts gap (T05); VS10 blocked; DF-09/10 partial
- Reopened slices: none
- Human signatures: awaiting (see release evidence checklist)
- Next: humans complete sign-off checklist; only then mark VS11 Done
- Slice status after this Delta Out: VS11 remains In progress (not Done)
```
