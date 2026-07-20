# Goal Cycle Paid-Support Attribution

**Status:** Canonical measurement contract  
**Product contract:** [`../studio/GOAL_CYCLE_PRODUCT_CONTRACT.md`](../studio/GOAL_CYCLE_PRODUCT_CONTRACT.md)  
**Owning slices:** [`VS4`](../studio/goal-cycle-build-plans/05-VS4-PAID-SUPPORT-ATTRIBUTION.md), [`VS9`](../studio/goal-cycle-build-plans/10-VS9-OUTCOMES-AUDIT.md)

## Success event

A Goal Cycle conversion is paid support:

- new paid membership;
- membership upgrade;
- attributed one-time purchase;
- attributed tip.

Views, impressions, reach, clicks, landing-page visits, and free follows are funnel evidence. They are not paid-support conversions.

## Attribution classes

### Deterministic

Use only when Relay has a consented chain connecting a Goal Cycle placement to the support event, such as:

- Relay Link or placement ID carried through an authenticated Relay conversion;
- campaign/offer code uniquely mapped to the cycle;
- Relay session plus first-party checkout return that records the cycle;
- supported provider event with an approved immutable correlation ID.

Store the touchpoint, outcome ID, model version, occurred time, and deduplication key. Count the support event once.

### Estimated

Use campaign-level correlated lift when individual linkage is unavailable but a comparable baseline exists. Required output:

- observation window and baseline window;
- observed support count/value and expected range;
- coverage/freshness;
- confidence label;
- reason deterministic linkage was unavailable;
- plain-language caveat that this is correlation, not individual attribution.

Estimated rows may inform planning but never identify a patron or claim that a particular post caused a purchase.

Default estimated-lift guard (method v1): baseline and observation windows each contain at least 14 complete creator-local days, daily source coverage is at least 80% in both windows, and at least three paid-support events exist across the combined windows. Otherwise the estimate is `insufficient`. Deterministically observed zero remains a valid zero; it is not converted to an estimate.

### Insufficient

Use when coverage is missing, stale, under the minimum sample, or confounded beyond the approved method. Display “insufficient evidence,” preserve available funnel data, and do not coerce the result to zero.

## Canonical outcome shape

```ts
type GoalCycleConversionOutcome = {
  cycle_id: string;
  slot_id: string | null;
  campaign_key: string;
  event_kind: "membership_join" | "membership_upgrade" | "purchase" | "tip";
  occurred_at: string;
  amount_minor: number | null;
  currency: string | null;
  attribution: "deterministic" | "estimated" | "insufficient";
  confidence: "high" | "medium" | "low" | "unknown";
  source: string;
  coverage: "complete" | "partial" | "unavailable";
  freshness_seconds: number | null;
  evidence_refs: string[];
  dedupe_key: string;
};
```

Estimated aggregate outcomes may use one row per campaign/window rather than one row per person. They must still use a stable deduplication key.

## Tracked context

At materialization, propagate an opaque campaign key from Goal Cycle → slot → Relay post → distribution plan → variant → task → tracked link/placement. Do not place creator-entered text, patron IDs, emails, or raw destination URLs into analytics metadata.

The campaign key is for attribution and audit only. It does not grant content access.

## Reconciliation

- Reconciliation is idempotent and rerunnable.
- Late outcomes update freshness and the cycle snapshot rather than duplicating conversions.
- Reversals/refunds are represented explicitly when the source supports them.
- Currency values are never summed across currencies without an approved conversion rule.
- Missing data is `unavailable`, not `0`.
- Estimated and deterministic counts remain separately queryable and separately displayed.

## Outcome snapshots

The cycle records target versus actual at creator confirmation time, with:

- target metric and threshold;
- actual deterministic count/value;
- separately labeled estimated lift;
- baseline and observation windows;
- data coverage and last refresh;
- confidence and caveats;
- task and publish completion;
- optional creator reflection.

Snapshots may refresh until the attribution window closes. Historical UI must show when the value was last calculated.

## Privacy and retention

- Prefer aggregate records when identity is unnecessary.
- Do not expose patron identity to Coach prompts.
- Follow source-specific consent, retention, and deletion obligations.
- Keep evidence references opaque and creator-scoped.
- Usage telemetry records event kind and attribution class, not patron or transaction details.

## Verification invariants

- A click with no support event yields zero deterministic conversions, not one.
- Missing provider data remains unavailable.
- The same support event received twice counts once.
- A support event outside the window does not attach to the cycle.
- Estimated lift is never rendered with deterministic language.
- One tenant cannot query another tenant’s campaign keys or outcomes.
