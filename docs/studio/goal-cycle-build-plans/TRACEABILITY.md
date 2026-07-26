# Goal Cycle Traceability

This map connects each Dream UX step to one implementation owner, canonical contracts, and a pass/fail gate. The detailed scenarios are in [`../../qa/GOAL_CYCLE_DREAM_FLOW_ACCEPTANCE.md`](../../qa/GOAL_CYCLE_DREAM_FLOW_ACCEPTANCE.md).

| Dream step | Primary owner | Supporting slices | Contract | Exit evidence |
|---|---|---|---|---|
| DF-01 Library entry/resume | VS6 | VS1 | Product contract: Primary experience | Library opens/resumes without unmounting rail |
| DF-02 Bounded goal | VS6 | VS1, VS4 | Product contract: Bounded goals | Four goal types and three rest branches validated |
| DF-03 Context/research | VS3 | VS5, VS6, VS10 | [`TREND_DISCOVERY_GATEWAY.md`](../../analytics/TREND_DISCOVERY_GATEWAY.md) | Provenance, weak fallback, and safe progress tests |
| DF-04 Questions | VS5 | VS1, VS6 | Product contract: Plan limits | Two-question cap and checkpoint resume tests |
| DF-05 Plan/revisions | VS5 | VS2, VS6 | Product + credit contracts | 8-slot/2-revision caps; one reservation |
| DF-06 Logistics | VS6 | VS5, VS7 | Product contract: Plan limits | Linked destinations and time-zone cases pass |
| DF-07 Approval/materialization | VS7 | VS2, VS6 | Product contract: Materialization | Duplicate approval creates one complete graph |
| DF-08 Human execution | VS8 | VS7 | Product contract: Publishing | Media/reminder/deep-link/confirm synchronization |
| DF-09 Outcomes/completion | VS9 | VS4 | [`CONVERSION_ATTRIBUTION.md`](../../analytics/CONVERSION_ATTRIBUTION.md) | Truthful target/actual/confidence; user confirmation |
| DF-10 Confirmed learning | VS9 | VS5 | Product contract: Learning | Explain, accept/reject, and one-active-cycle tests |

## Contract ownership

| Contract | Owner | Consumers |
|---|---|---|
| Goal Cycle lifecycle and API fixture | VS0, implemented VS1 | VS2, VS5, VS6, VS7, VS9 |
| Credit reservation state | VS2 | VS5, VS6, VS7, VS11 |
| Trend evidence envelope | VS3 | VS5, VS6, VS10 |
| Paid-support outcome | VS4 | VS5, VS9, VS11 |
| Structured Plan/revision/progress | VS5 | VS6, VS7, VS9 |
| Materialization receipt | VS7 | VS6, VS8, VS9, VS11 |
| Extension due packet | VS8 | VS11 |
| Outcome snapshot/learning proposal | VS9 | VS6 audit links, VS11 |
| Live provider registry | VS10 | VS11 |

Downstream slices may extend responses only through an upstream-owned contract change and fixture update. They must not infer fields from database models.

### Outcome authority

- VS4 is the authoritative writer for individual/aggregate paid-support evidence in `GoalCycleSupportOutcome` and `GoalCycleAttributionSnapshot`.
- VS1's `CreatorGoalCycleOutcome` is the cycle-owned read-model shell, not a second attribution ledger.
- VS9 is the sole assembler/writer of the versioned cross-goal outcome snapshot consumed by `/studio/goals`; it references VS4 evidence, publish/task facts, and goal-specific metrics without copying or reclassifying source events.
- The VS9 API/read model is canonical for target-versus-actual UI. VS4 tables remain canonical for attribution reconciliation and audit.

## Production file ownership

| Area | Owning slice |
|---|---|
| Goal Cycle/slot/revision/progress schema and first migration | VS1 |
| Credit ledger/wallet schema extension | VS2 |
| Trend provider contracts, registry, evidence persistence | VS3 |
| Attribution context/outcome schema extension | VS4 |
| Planner orchestration and validation | VS5 |
| Library Goal Cycle state machine/components | VS6 |
| Approval/materialization service and rail focus | VS7 |
| Extension packet, media/task completion recovery | VS8 |
| `/studio/goals`, outcome snapshots, learning service/job | VS9 |
| Live provider adapter and runtime activation | VS10 |
| Flags, dashboards, runbooks, rollout evidence | VS11 |

## Cross-cutting ownership

| Case | Primary slice | Required artifact |
|---|---|---|
| creator/tenant isolation | VS1; extended VS3/VS4/VS11 | service/route integration tests |
| keyboard, screen reader, reduced motion | VS6 | `goal-cycle-flow` and accessibility tests |
| narrow/wide, loading, empty, retryable/permanent failure, resume | VS6; integrated VS11 | state-machine, flow, and Library integration tests |
| no credit/reservation conflict UX | VS2 contract, VS6 presentation | credit route + flow fixtures |
| AI malformed/timeout/rate limit/redaction | VS5 | planner failure/usage tests |
| provider weak/disabled/outage/injection | VS3; live controls VS10 | gateway safety + staging tests |
| duplicate/concurrent mutations | owning service, integrated VS11 | service concurrency tests |
| UTC/DST/month boundaries | VS1 lifecycle, VS6 logistics, VS7 persistence | fixture and integration tests |
| extension revoked/offline/outdated | VS8 | extension packet/compatibility tests |
| deterministic/estimated/zero/unavailable | VS4 write, VS9 render | attribution + audit UI tests |
| structured-log secret/prompt redaction | VS3/VS5/VS8, audited VS11 | focused log scans/failure matrix |

## Requirement-to-test index

- One active cycle: VS1 service and DB concurrency tests; DF-10.
- Multiple cycles per month: VS1 API fixture; VS9 history.
- Complete silence free: VS2 ledger tests; DF-02.
- Upkeep/active rest charged: VS2 + VS5 branch tests.
- Two questions/revisions: VS5 validator and checkpoint tests; DF-04/05.
- Eight slots: VS5 schema/validator; DF-05.
- Linked destinations only: VS5 validation, VS7 materialization; DF-06/07.
- Weak trend evidence continues: VS3 fixture suite; DF-03.
- AI does not calculate metrics: VS5 fact-boundary tests.
- Paid support only: VS4 reconciliation; DF-02/09.
- Hybrid attribution labels: VS4 + VS9 rendering; DF-09.
- Approval idempotency: VS7 DB/service concurrency; DF-07.
- Unpublished until confirmation: VS7/VS8 integration; DF-07/08.
- Media may arrive later: VS8 partial-slot recovery; DF-06/08.
- Completion and learning confirmed: VS9; DF-09/10.
- Live provider gated: VS10 benchmark and human checklist; VS11.
- Tenant/privacy/accessibility/time-zone/failure matrix: VS11.

## Exit-gate chain

1. VS0 freezes fixtures and acceptance IDs.
2. VS1 proves lifecycle and creator isolation.
3. VS2 proves credit accounting under concurrency.
4. VS3 proves fixture research and fallback safety.
5. VS4 proves deterministic/estimated/insufficient distinctions.
6. VS5 proves bounded structured planning and retry.
7. VS6 proves accessible resume-capable Library flow.
8. VS7 proves one complete downstream graph per approval.
9. VS8 proves human-confirmed execution and recovery.
10. VS9 proves truthful outcomes and confirmed learning.
11. VS10 proves one human-approved live provider or remains a blocker for **live-provider activation only**. Fixture/history-only Goal Cycle verification may proceed with live mode disabled.
12. VS11 proves the integrated Dream flow and stages rollout.

## Non-goals trace

The program deliberately has no owner for autonomous publishing, arbitrary browser research, paid credit top-ups, hidden creator-profile learning, individual attribution from correlation, or a new top-level Goals workspace. Any request for those behaviors requires a separate approved plan.
