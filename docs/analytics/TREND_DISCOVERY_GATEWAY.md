# Trend Discovery Gateway

**Status:** Contract locked; live provider selection is a human gate  
**Product contract:** [`../studio/GOAL_CYCLE_PRODUCT_CONTRACT.md`](../studio/GOAL_CYCLE_PRODUCT_CONTRACT.md)  
**Owning slices:** [`VS3`](../studio/goal-cycle-build-plans/04-VS3-TREND-EVIDENCE-GATEWAY.md), [`VS10`](../studio/goal-cycle-build-plans/11-VS10-LIVE-TREND-PROVIDER.md)  
**Sourcing policy:** [`../third-party-metrics-sourcing.md`](../third-party-metrics-sourcing.md)

## Purpose

The gateway gives Relay Coach current, source-visible trend evidence without allowing arbitrary web content to control planning. It separates quantitative interest from qualitative discovery and always preserves creator history as a fallback.

## Provider boundaries

### `InterestSeriesProvider`

Returns normalized interest over time for a bounded term, locale, geography, and window. It may be backed by an approved official API or licensed aggregator.

Minimum result fields:

- `provider_id`, `provider_version`, and `method`;
- `collected_at` and requested window;
- normalization method and points;
- freshness and confidence;
- evidence strength;
- disclaimers.

### `WebDiscoveryProvider`

Returns a capped list of current public references used to identify language, formats, communities, events, and candidate tags. It does not claim search volume.

Minimum result fields:

- provider and method;
- collection time;
- title and bounded summary;
- source host and optional transient URL;
- publication time when known;
- normalized relevance;
- freshness, confidence, and disclaimers.

## Evidence envelope

Both provider results are normalized into `TrendEvidence`:

```ts
type TrendEvidence = {
  run_id: string;
  creator_id: string;
  human_context: {
    topic: string;
    locale: string | null;
    trend_note: string | null;
  };
  interest_series: InterestSeriesResult | null;
  web_discovery: WebDiscoveryResult | null;
  creator_history: CreatorHistoryEvidence;
  composite_strength: "strong" | "weak" | "history_only";
  confidence: "high" | "medium" | "low" | "unknown";
  prompt_safe_summary: string;
  provenance: EvidenceProvenance[];
};
```

Every provenance row records source tier, source ID, method, collection time, approval state, and freshness. The planner consumes `prompt_safe_summary` and structured fields, never raw provider payloads.

## Weak-evidence behavior

Weak or missing evidence is a valid result:

1. mark the result `weak` or `history_only`;
2. tell the creator that current external evidence is limited;
3. continue from their history, audience context, and visibility fundamentals;
4. omit unsupported volume or popularity claims;
5. never block a niche creator merely because the web has little comparable content.

## Prompt-injection controls

- Normalize and cap creator terms before provider calls.
- Strip control characters, script-like markup, and instruction-shaped fragments from provider summaries.
- Keep provider content in user-data objects, never system instructions.
- Do not send full page bodies to the model.
- Limit result count, summary length, hosts, and redirects.
- Disallow provider output from naming tools, changing goals, expanding destinations, or triggering mutations.
- Preserve raw response only when required for an approved audit/retention policy.

## Golden-query benchmark

VS3 creates a fixture-backed benchmark containing representative cases:

- broad visual-art topics;
- niche characters and fandoms;
- multilingual terms;
- regional art events;
- adult-adjacent terms requiring policy-safe handling;
- intentionally sparse/noisy queries;
- adversarial prompt-injection text.

Each provider is scored on freshness, niche coverage, source quality, duplication/spam, citation integrity, latency, failure behavior, and estimated cost per run.

Fixture providers must pass all contract and safety cases. A live provider must meet thresholds set in the VS10 human gate; worker agents may not lower those thresholds to make a candidate pass.

## Provider registry and activation

- Runtime mode is one of `disabled | fixture | history_only | live`: `disabled` skips external/history research entirely, `fixture` uses deterministic test evidence, `history_only` uses creator evidence with no provider call, and `live` permits only approved registry providers. Default is `fixture` outside production and `history_only` for a provider-disabled production pilot.
- Live calls require a registry row or configuration entry with `approved` status.
- Environment allowlists and a global kill switch are mandatory.
- An unapproved provider must fail closed to creator history.
- Google Trends may implement `InterestSeriesProvider` when access and terms are approved. The product cannot depend on that approval alone.

## Persistence and caching

Store one creator-scoped run record with query hash, normalized topic, provider IDs, evidence JSON, strength, confidence, and timestamps. Cache keys include normalized query, locale/geography, window, and provider version.

No freeform provider content belongs in `UsageEvent.meta`. Usage events may include provider ID, latency bucket, cache hit, result strength, and billable unit count.

## UI presentation

The research step may show operational progress such as:

- “Loaded your recent post history.”
- “Checked two approved evidence sources.”
- “Found three fresh references.”
- “External evidence is limited; using your audience history.”

It must not expose hidden chain-of-thought. Evidence details show source, age, confidence, and why it influenced the Plan.

## Human launch gate

Before live mode:

1. vendor and data method approved;
2. DPA/subprocessor and content-policy review complete;
3. golden-query benchmark accepted;
4. cost ceiling and rate limits approved;
5. source and freshness labels verified in UI;
6. kill switch tested;
7. failure falls back to history without consuming unsupported evidence;
8. provider credentials configured outside source control.
