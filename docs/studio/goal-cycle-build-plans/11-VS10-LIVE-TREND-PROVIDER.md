# VS10 Build Plan — Live Trend-Provider Qualification

## Outcome

Benchmark and human-qualify one live trend provider, then implement it behind the VS3 registry, allowlists, rate/cost limits, provenance, caching, and kill switches. Optionally qualify Google Trends as an interest source.

## Scope

In: candidate adapters, benchmark execution, human procurement/legal/privacy checklist, runtime controls, staging evidence.

Out: bypassing approval, arbitrary scraping, changing VS3 contracts, making Google Trends mandatory, silently weakening benchmark thresholds.

## Dependencies and permitted parallel work

Depends on VS3. Candidate-adapter work may run parallel with VS4–VS9 in isolated modules. No candidate may become active until all human gates pass. VS11 treats this as a production-launch dependency.

## Required reading

1. [`../../analytics/TREND_DISCOVERY_GATEWAY.md`](../../analytics/TREND_DISCOVERY_GATEWAY.md)
2. [`04-VS3-TREND-EVIDENCE-GATEWAY.md`](04-VS3-TREND-EVIDENCE-GATEWAY.md), its Delta Out, and `tests/fixtures/goal-cycle/trend-golden-benchmark.json`
3. [`../../third-party-metrics-sourcing.md`](../../third-party-metrics-sourcing.md)
4. candidate vendor documentation, terms, DPA, and approved procurement record

## Qualification contract

For each candidate, record:

- exact product/API and data collection method;
- official/licensed/aggregated source tier;
- permitted use, caching, retention, display/citation terms;
- subprocessor/data-region/privacy posture;
- auth and secret owner;
- benchmark scores and raw evidence;
- p50/p95 latency, failure rate, request/result caps, cost per Plan;
- niches/locales/geographies covered;
- incident/kill-switch owner.

Selection is a signed human decision. A worker may report “no candidate passes.”

## Runtime controls

- provider registry status `disabled | staging | approved`;
- environment allowlist plus global `RELAY_GOAL_CYCLE_TRENDS_KILL_SWITCH`;
- per-creator/global rate limits and cost ceiling;
- timeout/retry/circuit breaker;
- provenance/source labels;
- cache/retention policy;
- automatic history-only fallback;
- no raw credential/payload logging.

## Files

Create only for approved candidates:

- `src/goal-cycle/trends/providers/<approved-provider>.ts`
- `tests/goal-cycle/trend-live-provider-contract.test.ts`
- `tests/goal-cycle/trend-live-provider-staging.test.ts`
- `docs/operations/goal-cycle-trend-provider-runbook.md`
- benchmark result under `docs/analytics/benchmarks/` with no secrets

Edit:

- `src/goal-cycle/trends/provider-registry.ts`
- `.env.example` with credential names/controls, never values
- observability/alert configuration

Do not touch:

- provider interfaces/evidence shape
- planner prompts
- fixture default tests
- production credentials
- source policy/benchmark thresholds without human approval

## Todo work items

### VS10-T01 — Execute candidate benchmark

Run the golden-query suite against approved trials, collect quality/latency/cost/safety evidence, and compare with fixture/history fallback. Do not normalize away failures.

### VS10-T02 — Complete human qualification

Obtain explicit Product, procurement/legal/privacy, security, and budget approvals. Record selection or “none passed.” This todo cannot be self-approved by a builder agent.

### VS10-T03 — Implement selected adapter

Map one approved provider into VS3 interfaces with strict validation, sanitization, provenance, caps, cache, timeout, and stable errors. Keep default mode fixture/disabled.

### VS10-T04 — Add runtime safety controls

Implement registry activation, allowlist, kill switch, rate/cost limits, circuit breaker, metrics/alerts, and history-only fallback.

### VS10-T05 — Run staging qualification

Verify source-visible UI, freshness, niche/locale cases, adversarial results, outages, rate limits, cost telemetry, and kill-switch recovery with real credentials in staging.

### VS10-T06 — Write operations handoff

Document credential rotation, vendor incident handling, cache purge/retention, cost alarms, disable/fallback procedure, and approval owners.

## Safe batches

- Batch 1: VS10-T01 only.
- Human gate: VS10-T02.
- Batch 2: VS10-T03 + provider contract tests.
- Batch 3: VS10-T04 + failure tests.
- Batch 4: VS10-T05 + VS10-T06.

## Verification

```bash
npx vitest run tests/goal-cycle/trend-golden-benchmark.test.ts tests/goal-cycle/trend-live-provider-contract.test.ts
npx vitest run tests/goal-cycle/trend-live-provider-staging.test.ts
npm run typecheck
```

The staging test is credential-gated and must skip with an explicit reason locally, never fake results.

## Exit gate

One provider has signed approvals, passes the benchmark, works in staging, displays provenance, obeys cost/rate controls, and falls back under tested kill switch—or the slice reports blocked and production Goal Cycle remains provider-disabled.

## Human stop conditions

All vendor selection, terms/privacy acceptance, spending, credentials, benchmark thresholds, production activation, and Google Trends access decisions are mandatory human gates.

## Delta Out

Include signed gate references, benchmark comparison, selected version/method, staging evidence, estimated cost per Plan, runbook, kill-switch proof, or exact “no provider passed” blocker.
