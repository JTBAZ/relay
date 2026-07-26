# VS3 Build Plan — Trend Evidence Gateway in Fixture Mode

## Outcome

Deliver provider-neutral interest-series and controlled-web evidence contracts, provenance, prompt-safety controls, creator-history fallback, async progress, caching, and a golden-query benchmark using fixtures only.

## Scope

In: interfaces, registry, evidence store/service, sanitization, fixture providers, benchmark harness, progress events.

Out: live credentials/vendor calls, procurement choice, arbitrary browsing, unsupported popularity claims.

## Dependencies and permitted parallel work

Depends on VS0. It may run parallel with VS1. Store/schema additions merge only after VS1 owns the base migration. VS10 may start qualification after this exit; VS5 waits for it.

## Required reading

1. [`../../analytics/TREND_DISCOVERY_GATEWAY.md`](../../analytics/TREND_DISCOVERY_GATEWAY.md)
2. [`01-VS0-BASELINE-CONTRACTS.md`](01-VS0-BASELINE-CONTRACTS.md)
3. [`../../third-party-metrics-sourcing.md`](../../third-party-metrics-sourcing.md)
4. `src/distribution/coach-fact-pack.ts`
5. `src/ai/types.ts`
6. `src/ai/ai-service.ts`

## Data and provider contracts

Create interfaces exactly named:

- `InterestSeriesProvider.search(request): Promise<InterestSeriesResult>`
- `WebDiscoveryProvider.search(request): Promise<WebDiscoveryResult>`
- `TrendEvidenceGateway.research(request): Promise<TrendEvidence>`

Request fields: creator ID, normalized topic, locale, geography nullable, window, creator context, request ID. Result/envelope fields follow the canonical analytics contract.

Persist `GoalCycleTrendRun`: creator ID, cycle ID, query hash, mode, provider IDs/versions, status, evidence JSON, strength, confidence, cache key, started/completed timestamps, error code. Raw payload storage defaults off.

Progress event codes are fixed: `history_loaded`, `interest_started`, `interest_complete`, `web_started`, `web_complete`, `evidence_weak`, `history_fallback`, `research_complete`, `research_failed`.

## Files

Create:

- `src/goal-cycle/trends/provider-types.ts`
- `src/goal-cycle/trends/provider-registry.ts`
- `src/goal-cycle/trends/evidence-sanitizer.ts`
- `src/goal-cycle/trends/trend-evidence-store.ts`
- `src/goal-cycle/trends/trend-evidence-gateway.ts`
- `src/goal-cycle/trends/fixture-interest-provider.ts`
- `src/goal-cycle/trends/fixture-web-provider.ts`
- `src/goal-cycle/trends/golden-queries.ts`
- `tests/fixtures/goal-cycle/trend-golden-benchmark.json`
- `tests/goal-cycle/trend-evidence-gateway.test.ts`
- `tests/goal-cycle/trend-evidence-safety.test.ts`
- `tests/goal-cycle/trend-golden-benchmark.test.ts`
- migration/schema addition for `GoalCycleTrendRun` after VS1

Edit:

- `prisma/schema.prisma`
- `src/server.ts` only for authenticated fixture-mode research/progress routes
- `.env.example` only for documented fixture/disabled flags

Do not touch:

- production API credentials
- Coach prompt/proposal service
- Google Trends/live adapters
- vendor allowlist approvals

## Todo work items

### VS3-T01 — Freeze provider interfaces and fixtures

Implement request/result runtime validation and fixture providers for strong, weak, unavailable, multilingual, niche, and adversarial queries.

### VS3-T02 — Implement sanitization and provenance

Normalize/cap inputs, strip instruction-shaped content, create prompt-safe summaries, preserve source/freshness/method/confidence, and ensure raw provider text never enters system instructions or usage metadata.

### VS3-T03 — Persist and cache evidence runs

Add creator-scoped run persistence, deterministic cache keys, expiry/freshness behavior, and retry/idempotency. In `live` mode, an unapproved or registry-disabled provider falls back to history. Runtime `disabled` mode performs no trend/history research.

### VS3-T04 — Add async research progress

Run the gateway through the repository’s job/service pattern and append fixed progress codes to the Goal Cycle stream. Expose status/hydration; do not expose chain-of-thought.

### VS3-T05 — Build golden-query benchmark

Score freshness, niche coverage, source quality, spam/duplication, citations, latency, failure behavior, safety, and fixture cost. Freeze machine-readable baseline output at `tests/fixtures/goal-cycle/trend-golden-benchmark.json` for VS10.

### VS3-T06 — Prove failure boundaries

Test timeout, malformed payload, injection text, oversized input, disabled mode, cache collision, stale data, tenant isolation, and history-only continuation.

## Safe batches

- Batch 1: VS3-T01 + VS3-T02.
- Batch 2: VS3-T03 + focused store tests.
- Batch 3: VS3-T04 + VS3-T06.
- Batch 4: VS3-T05 only.

## Verification

```bash
npx vitest run tests/goal-cycle/trend-evidence-gateway.test.ts tests/goal-cycle/trend-evidence-safety.test.ts
npx vitest run tests/goal-cycle/trend-golden-benchmark.test.ts
npm run typecheck
```

## Exit gate

DF-03 passes in fixture/history-only modes: the Dream fixture produces truthful strong/weak/history-only evidence; adversarial text is inert; progress is resumable; all tests run without network; no live provider can activate.

## Human stop conditions

Stop before any vendor signup, credential, paid API, scraping method, procurement/privacy judgment, benchmark threshold change, or live activation.

## Delta Out

Include provider interface versions, benchmark artifact, evidence/cache schema, safety cases, and the exact `TrendEvidence` fixture consumed by VS5/VS6/VS10.
