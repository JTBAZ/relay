# Schedule Rail Automations — Traceability

This map connects each acceptance gate to one primary implementation owner, canonical authorities, and exit evidence. Detailed scenarios are in [`../../qa/AUTOMATIONS_ACCEPTANCE.md`](../../qa/AUTOMATIONS_ACCEPTANCE.md).

## Acceptance ownership

| Acceptance | Primary owner | Supporting slices | Canonical authority | Exit evidence |
|---|---|---|---|---|
| AU-01 Discover/gate | VS7 | VS2 | `ScheduleRail`, `StudioPlanGate` | Accessible modal/gate component tests |
| AU-02 Create scheduled preset | VS2 | VS1, VS4, VS7 | `CreatorAutomation` connector service | Transaction/idempotency/API fixture tests |
| AU-03 Visible-month rhythm | VS4 | VS5 | schedule series/occurrence | DST/month/reconcile + rail tests |
| AU-04 Source resolution | VS4 | VS1, VS3 | distribution-rule run ledger | Creator-scope/concurrency tests |
| AU-05 No-new-post skip | VS4 | VS5 | occurrence + notification service | Skip/idempotent notification tests |
| AU-06 Prepared review work | VS3 | VS4, VS5 | rule run + draft + event | One run/draft/event graph under retry |
| AU-07 Sticky reminder reuse | VS5 | VS3 | manual-event reminder packet | Existing packet prefix/CTA regression tests |
| AU-08 Template preload | VS6 | VS1 | `CreatorPreviewTemplate`, Previewizer | Snapshot/preload/crop isolation tests |
| AU-09 Post-export distribution | VS6 | VS3 | plan/variant/attempt services | Preview-media ordering + handoff tests |
| AU-10 Lifecycle/expiry | VS4 | VS2, VS5, VS6, VS7 | connector children + run/event | Pause/archive/expiry/recovery tests |
| AU-11 Delayed release parity | VS3 | VS2, VS7 | distribution rule/worker | Legacy parity + wrapper sync tests |
| AU-12 Integrated safety | VS8 | all | full existing spine | Automated matrix (`tests/automations/integration.test.ts`, `concurrency.test.ts`) + [`../../qa/AUTOMATIONS_VS8_B19_EVIDENCE.md`](../../qa/AUTOMATIONS_VS8_B19_EVIDENCE.md); browser/flag/migration remain human gates |

## Contract ownership

| Contract | Owner | Consumers |
|---|---|---|
| Automation preset/trigger/source/status wire vocabulary | VS0 | VS1–VS8 |
| Automation API fixtures and stable errors | VS0, implemented VS2 | VS3–VS8 |
| Automation connector relations and idempotency keys; rule-run `expired`/`cancelled` if required for TTL | VS1 | VS2–VS8 |
| Connector lifecycle transaction | VS2 | VS3, VS4, VS7 |
| Automation-owned distribution materializer | VS3 | VS4–VS6 |
| Trigger-only series behavior and source discovery | VS4 | VS5, VS7, VS8 |
| Rail metadata and manual-event attention projection | VS5 | VS6–VS8 |
| Initial Previewizer config and approval receipt | VS6 | VS7, VS8 |
| Modal flow/state machine | VS7 | VS8 |
| Rollout and verification evidence | VS8 (B19–B20 Done; human release pending) | release owner — [`../AUTOMATIONS_RUNBOOK.md`](../AUTOMATIONS_RUNBOOK.md), [`../../qa/AUTOMATIONS_RELEASE_EVIDENCE.md`](../../qa/AUTOMATIONS_RELEASE_EVIDENCE.md) |

Downstream slices may extend responses only through an upstream-owned contract change and fixture update. They must not infer public wire fields from Prisma rows.

## Production authority map

| State or side effect | Sole authority | Automation correlation |
|---|---|---|
| Recurrence schedule | `CreatorScheduleSeries` | `CreatorAutomation.scheduleSeriesId` |
| Trigger occurrence | `CreatorScheduleOccurrence` | rule run occurrence relation |
| Action/run lifecycle | `CreatorDistributionRuleRun` | owned rule → automation |
| Prepared content | `AutopostDraft` | workspace run/automation IDs |
| Rail/toast attention | `CreatorScheduleEvent` | rule run materialized event ID |
| Saved visual layout | `CreatorPreviewTemplate` | automation FK + run snapshot |
| Preview output media | existing Relay staging upload | run/approval receipt |
| Distribution intent | `PostDistributionPlan` / variant | run plan pointer |
| External execution | `PostDistributionAttempt` | run attempt pointer or correlated plan |

No other slice may create a shadow status ledger for the same responsibility.

## Production file ownership

| Area | Owning slice |
|---|---|
| Shared automation contracts/fixtures | VS0 |
| Prisma connector/relations/migration | VS1 |
| Automation lifecycle service and CRUD routes | VS2 |
| Distribution-rule owned materialization | VS3 |
| Schedule-series trigger mode, coordinator, jobs | VS4 |
| Rail projection, event enrichment, notifications | VS5 |
| Previewizer initial config and approval/handoff | VS6 |
| Schedule Rail modal/components | VS7 |
| Verification, rollout docs, flag activation evidence | VS8 |

## Reopen map

| Failure found during verification | Reopen |
|---|---|
| Wire/status/error ambiguity | AUT-VS0-T02 |
| Duplicate connector or invalid relation | AUT-VS1-T01 / AUT-VS1-T02 |
| Authorization, lifecycle transaction, route retry | AUT-VS2-T01 / AUT-VS2-T02 |
| Legacy rule regression or duplicate draft/event | AUT-VS3-T01 / AUT-VS3-T02 |
| Wrong cadence/source, duplicate run, bad expiry | AUT-VS4-T01 / T02 / T03 |
| Missing/duplicate rail or toast projection | AUT-VS5-T01 / T02 |
| Template, preview ordering, handoff sync | AUT-VS6-T01 / T02 / T03 |
| Modal gate, forms, accessibility, deep link | AUT-VS7-T01 / T02 |
| Test harness or rollout evidence only | AUT-VS8-T01 / T02 |

## Requirement-to-test index

- Connector retry/idempotency: VS1 DB constraints + VS2 service/API tests; AU-02.
- DST/month boundaries: existing schedule-series math + VS4 fixture tests; AU-03.
- Latest-unprocessed selection: VS4 service tests with multiple posts/creators; AU-04/05.
- One prepared graph: VS3 materializer concurrency tests; AU-06.
- Existing reminder prefix: VS5 packet characterization; AU-07.
- Template snapshot and crop exclusion: VS6 Previewizer config tests; AU-08.
- Preview-before-plan ordering: VS6 approval adapter tests; AU-09.
- Pause/archive/expiry: VS2 lifecycle + VS4 reconcile + VS5 event tests; AU-10.
- Legacy rule parity: existing distribution-rule suite extended in VS3; AU-11.
- Tenant, feature flag, extension offline, no autonomous publish: VS8 matrix; AU-12.

## Exit-gate chain

1. VS0 freezes the atom map, wires, errors, and fixtures.
2. VS1 proves migration safety and connector uniqueness.
3. VS2 proves creator-scoped connector lifecycle and API idempotency.
4. VS3 proves owned delayed rules converge on one prepared graph without changing legacy rules.
5. VS4 proves scheduled triggers resolve one eligible source under retry and time boundaries.
6. VS5 proves future and ready work appear through existing rail/reminder atoms.
7. VS6 proves saved-template review and post-export distribution preserve human confirmation.
8. VS7 proves the accessible, gated modal manages both presets.
9. VS8 proves the complete automated flow, stages a reversible rollout, and leaves production migration/flag activation as a signed human release gate.

## Non-goals trace

The program has no owner for autonomous publishing, content tags/series, Patreon campaign selection, specific-post recurrence, arbitrary workflow graphs, custom steps, recipe chaining, server-side image rendering, or replacing existing social playbooks/routine management. Adding any requires a product-contract amendment and new acceptance owner.

**Deferred (documented, not owned in this program):** Streak Keeper fallback — after v1, replace flat no-new-post skip with an offer to substitute a lighter social-management action. Hook is AU-05 / the skip+notify path. See [`PRODUCT-CONTRACT.md`](PRODUCT-CONTRACT.md#streak-keeper-fallback-post-v1).
