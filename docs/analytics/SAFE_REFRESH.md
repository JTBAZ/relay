# Safe Refresh — Platform Instance Policy

> **Phase 4** of Cross-Platform Performance Intelligence.  
> **Vocabulary:** [PERFORMANCE_INTELLIGENCE_VOCABULARY.md](./PERFORMANCE_INTELLIGENCE_VOCABULARY.md)

## Purpose

Let creators **intentionally refresh** linked platform metrics without aggressive polling or hidden scrape pressure.

Policy order for manual refresh:

1. **Official API** (extension tries Patreon API when session allows)
2. **Relay-linked URL handoff** (extension DOM capture after user-initiated refresh)
3. **CSV / rollup overlay** (Patreon Insights import via daily rollup)
4. **Conservative scheduled hygiene** (Relay-native rollups + stale marking only)

## Manual refresh API

| Method | Path |
|--------|------|
| GET | `/api/v1/creator/analytics/platform-instances/:platform_instance_id/refresh-status` |
| POST | `/api/v1/creator/analytics/platform-instances/:platform_instance_id/refresh` |

### POST response `status`

| Status | Meaning |
|--------|---------|
| `completed` | Server finished (`relay` rollup or CSV overlay) |
| `handoff_required` | Client must invoke Relay extension with returned `handoff` payload |
| `cooldown` | Per-destination manual cooldown active — see `cooldown.retry_after_seconds` |
| `disabled` | Instance `refresh_policy = disabled` |
| `unsupported_destination` | Linked URL exists but extension refresh not implemented for this destination |
| `missing_link` | No URL / attempt to hand off |

### Cooldown defaults

| Destination | Manual cooldown |
|-------------|-----------------|
| `relay` | 5 min |
| `patreon` | 15 min |
| `x`, `deviantart`, `bluesky` | 30 min |

Override all destinations with `RELAY_PLATFORM_INSTANCE_MANUAL_COOLDOWN_MS` (minimum 60s).

Cooldown anchor: latest of `lastManualRefreshRequestedAt` and `lastRefreshedAt`.

## Scheduled sweep (conservative)

Queue: `platform_instance_refresh_sweep`  
Module: [`platform-instance-refresh-sweep-job.ts`](../src/analytics/platform-instance-refresh-sweep-job.ts)

Each cycle (when enabled):

1. Select up to batch size of **conservative** instances stale beyond threshold
2. **Relay** instances → recompute creator rollups + touch `lastRefreshedAt`
3. **External** instances → mark `status = stale` (no auto extension scrape)

Does **not** open browser tabs or scrape Patreon/X on a schedule.

## Environment

| Variable | Default | Role |
|----------|---------|------|
| `RELAY_PLATFORM_INSTANCE_REFRESH_SWEEP_MS` | unset (off) | BullMQ repeat interval; min 300000; `0` = disabled |
| `RELAY_PLATFORM_INSTANCE_REFRESH_SWEEP_BATCH` | 40 | Max instances per sweep |
| `RELAY_PLATFORM_INSTANCE_STALE_AFTER_MS` | 172800000 (48h) | Stale threshold |
| `RELAY_PLATFORM_INSTANCE_MANUAL_COOLDOWN_MS` | per-destination table | Global manual cooldown override |
| `RELAY_PLATFORM_INSTANCE_REFRESH_ROLLUP_LOOKBACK_DAYS` | 2 | Rollup window for relay manual/sweep refresh |

Requires `RELAY_JOB_BACKEND=bullmq`, `REDIS_URL`, and worker process for scheduled sweep.

## Schema

`platform_instances.last_manual_refresh_requested_at` — cooldown tracking for creator-initiated refresh.

## Client handoff flow (extension destinations)

Applies to **`patreon`**, **`x`**, and **`deviantart`** when a linked URL exists. A distribution `attempt_id` is preferred when present; imported Patreon posts may hand off with only `platform_instance_id` (instance-scoped metrics POST).

1. POST refresh → `handoff_required`
2. Studio calls `sendRelayExternalMetricsRefreshToExtension(handoff)` ([`web/lib/relay-extension-messaging.ts`](../../web/lib/relay-extension-messaging.ts))
3. Extension captures metrics → `POST /api/v1/relay/distribution-attempts/:attempt_id/metrics`
4. Snapshot ingest updates `lastRefreshedAt` on the platform instance

## Modules

| Module | Role |
|--------|------|
| [`platform-instance-refresh-service.ts`](../src/analytics/platform-instance-refresh-service.ts) | Cooldown policy, manual refresh orchestration |
| [`platform-instance-refresh-sweep-job.ts`](../src/analytics/platform-instance-refresh-sweep-job.ts) | BullMQ conservative sweep |

## Next phases

| Phase | Work |
|-------|------|
| 6–7 | Insights Hub + drilldown UI wired to refresh status/buttons |
| 9 | ~~Platform identity adapters + manual linking~~ — see [PLATFORM_ADAPTERS.md](./PLATFORM_ADAPTERS.md) |
