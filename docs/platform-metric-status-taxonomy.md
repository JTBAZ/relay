# Platform Metric Status Taxonomy (PMD-001)

Approved UI and registry mapping for operator dashboard cards. Code source of truth: `src/platform-metrics/metric-status-taxonomy.ts`.

Parent: [`platform-metrics-dashboard-build-plan.md`](platform-metrics-dashboard-build-plan.md)

## Status → badge → empty state

| Status | Badge | Tone | Empty / placeholder display | Default helper text |
|--------|-------|------|------------------------------|---------------------|
| `not_wired` | Not wired | muted | No data yet | Instrumentation has not been connected for this metric. |
| `pending_instrumentation` | Pending | warning | Pending instrumentation | Source is defined; events or rollups are not emitting yet. |
| `collecting` | Collecting | info | Collecting… | Raw events are landing; rollup or display rules may still be incomplete. |
| `live` | Live | success | 0 (when value is zero) | Backed by a trusted source or rollup. |
| `estimated` | Estimated | warning | Estimate unavailable | Proxy or partial data — not a full first-party count. |
| `manual_import` | Manual import | info | Upload required | Depends on CSV or manual upload (e.g. Patreon Insights). |
| `deferred` | Deferred | muted | Not in scope | Intentionally deferred for a later phase. |

## Missing instrumentation vs zero activity

| Situation | Status | Value | Display | Meaning |
|-----------|--------|-------|---------|---------|
| Not built yet | `not_wired` | null | No data yet | Missing instrumentation |
| Designed, not emitting | `pending_instrumentation` | null | Pending instrumentation | Missing instrumentation |
| Pipeline live, no rows yet | `collecting` | null | Collecting… | Collecting (not zero activity) |
| Live, no events in window | `live` | 0 | 0 | **Zero activity** — helper: "No activity in this period." |
| Proxy with no sessions | `estimated` | 0 | 0 | Zero activity on proxy source |
| CSV not uploaded | `manual_import` | null | Upload required | Missing manual import |
| Out of scope | `deferred` | null | Not in scope | Deferred by product decision |

## Freshness overlays (live metrics only)

| Freshness | When | Helper override |
|-----------|------|-----------------|
| `unknown` | Default | Use status default helper |
| `fresh` | Source updated recently | Use status default helper |
| `stale` | Past freshness threshold | Data may be stale — check source freshness. |
| `broken` | Rollup/source failure | Source or rollup failed — metric may be inaccurate. |

## Coverage bucket rules

Used by Data Coverage section (`summarizeMetricStatuses`):

- **Live:** status `live`
- **Collecting:** status `collecting`
- **Not wired:** status `not_wired` or `pending_instrumentation`
- **Manual import:** status `manual_import`
- **Deferred:** status `deferred`
- **Estimated:** status `estimated` (tracked separately; not counted as live)

## API / registry usage

Registry entries should include `status`, optional `value`, and optional `freshnessState`. UI calls `resolveMetricDisplay()` — do not hard-code empty states per card.

```ts
resolveMetricDisplay({ status: "live", value: 0 });
// → displayValue: "0", isZeroActivity: true, isMissingInstrumentation: false

resolveMetricDisplay({ status: "not_wired", value: null });
// → displayValue: "No data yet", isMissingInstrumentation: true
```
