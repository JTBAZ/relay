# Platform Instance — Schema & Mapping

> **Phase 2** of Cross-Platform Performance Intelligence.  
> **Vocabulary:** [PERFORMANCE_INTELLIGENCE_VOCABULARY.md](./PERFORMANCE_INTELLIGENCE_VOCABULARY.md)

## Purpose

A **Platform Instance** is the durable identity for where a Relay Post (or matched external post) lives on a destination: Patreon, X, DeviantArt, Bluesky, Instagram (future), or Relay first-party surfaces.

It bridges:

- **Distribution** — `PostDistributionAttempt` (`externalUrl`, `externalId`, `status`)
- **Metrics** — `ExternalPostMetricSnapshot` and daily rollups keyed by `postId + destination`

## Prisma model

| Field | Role |
|-------|------|
| `id` | Deterministic: `pi_attempt_{attemptId}`, `pi_manual_{postId}_{destination}`, or `pi_relay_{postId}` |
| `postId` + `destination` | **Unique** — one canonical instance per post per platform |
| `attemptId` | Optional FK to winning posted attempt (nullable for relay-native) |
| `externalUrl` / `externalId` | Platform identity for refresh + drilldown |
| `linkSource` | How Relay learned this link (see enum below) |
| `status` | `active`, `unlinked`, `stale` |
| `refreshPolicy` | Scheduling hint: `conservative` (default), `manual_only`, `disabled` |
| `linkedAt` | When the link became canonical |
| `lastRefreshedAt` | Last successful metric capture (updated on snapshot ingest) |

### Enums

**`PlatformInstanceLinkSource`**

| Value | Meaning |
|-------|---------|
| `autopost_success` | Extension/autopost completed with URL |
| `manual_url_confirm` | Creator confirmed URL manually |
| `api_identity` | Platform API identity match |
| `csv_import` | Patreon Insights CSV overlay |
| `suggested_merge` | User-confirmed bundling (Phase 5) |
| `inferred_only` | Low-confidence guess — not used for refresh yet |
| `relay_native` | First-party Relay engagement (no external URL) |

**`PlatformInstanceStatus`:** `active`, `unlinked`, `stale`

## Snapshot linkage

`ExternalPostMetricSnapshot.platformInstanceId` is optional FK for traceability. Daily rollups remain keyed by `(postId, destination)` in `ExternalPostMetricDaily` (Phase 3 read layer aggregates at Work/Bundle level).

## Migration backfill

Migration `20260701150000_platform_instances`:

1. Creates `platform_instances` + enums.
2. Inserts latest **posted** attempt per `(post_id, destination)` where `external_url` is present (`link_source = autopost_success`).
3. Inserts **relay-native** row per post (`pi_relay_{post_id}`, `destination = relay`).
4. Backfills `platform_instance_id` on existing snapshots (by `attempt_id`, then `post_id + destination`).

## Runtime service

[`src/analytics/platform-instance-service.ts`](../../src/analytics/platform-instance-service.ts):

| Function | Role |
|----------|------|
| `upsertPlatformInstanceFromAttempt` | Canonical upsert from distribution attempt |
| `platformInstanceIdForManualLink` | Deterministic id for URL-only manual links |
| `ensureRelayPlatformInstanceForPost` | Relay-first-party instance |
| `touchPlatformInstanceLastRefreshed` | Update freshness after metric ingest |
| `getPlatformInstanceForPostDestination` | Read one instance |
| `getPlatformInstancesForPost` | Read all instances for a post |

### Hooks

| Event | Location |
|-------|----------|
| Attempt completes as `posted` with URL | `completeDistributionAttempt` in `post-distribution-service.ts` (includes URL normalization) |
| Creator confirms published URL | `POST .../platform-instances/link` → `confirmPlatformInstanceLink` |
| Metric snapshot ingest | `recordExternalPostMetricSnapshots` in `external-post-metrics-service.ts` — links `platformInstanceId`, touches `lastRefreshedAt` |

## Constraints (v1)

- One instance per **post + destination**; newer successful attempts replace the canonical row.
- External destinations require `externalUrl` before instance upsert (except `relay`).
- `attemptId` is unique when set — one attempt maps to at most one instance row.

## Next phases

| Phase | Work |
|-------|------|
| 3 | ~~V2 read endpoints~~ — see [UNIFIED_READ_V2.md](./UNIFIED_READ_V2.md) |
| 4 | ~~Manual refresh APIs + sweep~~ — see [SAFE_REFRESH.md](./SAFE_REFRESH.md) |
| 5 | `suggested_merge` link source for bundled works |
| 9 | ~~Platform identity adapters + manual linking~~ — see [PLATFORM_ADAPTERS.md](./PLATFORM_ADAPTERS.md) |
