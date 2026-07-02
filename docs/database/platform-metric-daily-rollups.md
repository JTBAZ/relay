# Platform metric daily rollups (PMD-050)

Durable UTC-day aggregates for the operator dashboard. Raw telemetry (`platform_telemetry_events`, `relay_engagement_events`) remains append-only; rollups are the fast read path for trends (PMD-051+).

## Table

`platform_metric_daily_rollups` (Prisma `PlatformMetricDailyRollup`)

| Column | Purpose |
|--------|---------|
| `metric_key` | Registry key (e.g. `activity.feed_opens`) |
| `day_utc` | UTC calendar date grain |
| `scope` | `system`, `platform`, `creator`, `patron`, `post`, `session` |
| `scope_id` | Scoped entity id; empty string = platform-wide |
| `value` | Numeric rollup result |
| `dimensions` | Optional JSON breakdown (tiers, surfaces, …) |
| `source_freshness` | `{ source_updated_at, raw_row_count, writer }` |
| `generated_at` | When this rollup row was written |

Unique grain: `(metric_key, day_utc, scope, scope_id)`.

## Code

- Types: `src/platform-metrics/platform-metric-daily-rollup-types.ts`
- Upsert/read: `src/platform-metrics/platform-metric-daily-rollup-service.ts`

## Example upsert

```typescript
await upsertPlatformMetricDailyRollup(prisma, {
  metricKey: "activity.feed_opens",
  dayUtc: "2026-05-25",
  scope: "system",
  value: 42,
  sourceFreshness: {
    source_updated_at: "2026-05-25T23:59:59.000Z",
    raw_row_count: 120,
    writer: "nightly_job"
  }
});
```

**Next:** PMD-052 — trend deltas and freshness states for rollup-backed cards.

## Rollup job (PMD-051)

- Job: `runPlatformMetricDailyRollupOnce()` in `src/platform-metrics/platform-metric-daily-rollup-job.ts`
- Queue: `platform_metric_daily_rollup` (BullMQ worker when `RELAY_JOB_BACKEND=bullmq`)
- Schedule: `RELAY_PLATFORM_METRIC_DAILY_ROLLUP_MS` (minimum 60_000; unset = disabled)
- Lookback: `RELAY_PLATFORM_METRIC_DAILY_ROLLUP_LOOKBACK_DAYS` (default 1 → yesterday + today UTC)

Metrics written per UTC day (system scope):

| metric_key | Source |
|------------|--------|
| `traffic.profile_views` | Deduped `relay_engagement_events.profile_view` by creator + session/day |
| `traffic.gallery_views` | Deduped `relay_engagement_events.gallery_view` |
| `traffic.page_views` | `platform_telemetry_events.page_view` count |
| `traffic.unique_visitors` | Distinct `session_key` across engagement + telemetry |
| `activity.dau` | Distinct `actor_key`/`session_key` from feed_open, post_view, session_start |
| `activity.wau` | Rolling 7-day distinct active keys ending on anchor day |
| `activity.mau` | Rolling 30-day distinct active keys ending on anchor day |
| `revenue.gross` | Relay-native checkout/subscription cash collected from `platform_revenue_events` |
| `revenue.net` | Relay-native net amount when present, otherwise gross minus refunds |
| `revenue.checkout_started` | Count of `checkout_started` revenue events |
| `revenue.checkout_completed` | Count of `checkout_completed` revenue events |
| `revenue.checkout_failed` | Count of `checkout_failed` revenue events |
| `revenue.upgrades` | Count of `subscription_upgraded` revenue events |
| `revenue.downgrades` | Count of `subscription_downgraded` revenue events |
| `revenue.refunds` | Refund value from `refund_issued` revenue events |

PMD-062 intentionally leaves MRR, ARR, ARPU, and churn off the live rollup path until Relay has a durable subscription state snapshot. Event counts alone are not enough to present those as financial actuals.

## Trends and freshness (PMD-052)

- Trend math: `src/platform-metrics/platform-metric-trend-service.ts`
- Registry attaches optional `trends: { dod, wow, mom }` per rollup-backed metric
- Freshness: rollup `generated_at` stale after 36h; raw `source_updated_at` stale after 48h
- UI hides trend chips when `sufficientHistory` is false
