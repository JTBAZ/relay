# External Post Metrics — Slice 2 Build Plan

> **Status:** Builder-ready plan (not implemented).  
> **Depends on:** Slice 1 post-link capture — `PostDistributionAttempt.external_url` + `external_id` after extension or Relay UI confirm.

---

## Why a separate metrics layer

Slice 1 stores **identity** on the distribution attempt (`external_url`, `external_id`, `status: posted`). Slice 2 stores **time-series engagement** elsewhere so we can:

- Refresh views/likes without mutating handoff records
- Keep multiple snapshots per post/platform over time
- Record `source` and raw payload when platforms disagree or change DOM

Do **not** overload `PostDistributionAttempt.fillResult` or add columns like `view_count` on the attempt row.

---

## Identity bridge (Slice 1 → Slice 2)


| Field                        | Role                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `PostDistributionAttempt.id` | Foreign key for snapshots tied to one handoff                                 |
| `post_id`                    | Relay library post (rollup across destinations)                               |
| `destination`                | `patreon` | `x` | `deviantart` | …                                            |
| `external_url`               | Canonical public URL (Audience **Posted ↗** link)                             |
| `external_id`                | Platform-native id extracted from URL (status id, Patreon post id, DA art id) |


Queries for “latest metrics for this Relay post on X” should key off `(post_id, destination)` or `attempt_id`, not title matching.

---

## Proposed schema

Add after `PostDistributionAttempt` in `prisma/schema.prisma` when implementing:

```prisma
/// Time-series engagement captured from an external post URL (Slice 2).
model ExternalPostMetricSnapshot {
  id          String   @id @default(cuid())
  attemptId   String   @map("attempt_id")
  postId      String   @map("post_id")
  creatorId   String   @map("creator_id")
  destination String
  externalUrl String   @map("external_url")
  externalId  String?  @map("external_id")
  /// views | likes | favorites | comments | reposts | quotes | bookmarks | impressions | …
  metricType  String   @map("metric_type")
  value       Int?
  raw         Json     @default("{}")
  /// extension_dom | public_scrape | platform_api | manual | third_party
  source      String
  capturedAt  DateTime @default(now()) @map("captured_at")

  @@index([attemptId, metricType, capturedAt])
  @@index([postId, destination, metricType, capturedAt])
  @@index([creatorId, capturedAt])
  @@map("external_post_metric_snapshots")
}
```

Optional later: `@@unique([attemptId, metricType, capturedAt])` only if we batch one row per capture run instead of one row per metric.

**Relation (future):** `PostDistributionAttempt` → `ExternalPostMetricSnapshot[]` with `onDelete: Cascade`.

---

## Metric types (normalized)


| `metricType`  | Typical platforms                          | Notes                                    |
| ------------- | ------------------------------------------ | ---------------------------------------- |
| `views`       | Patreon (insights), X (limited public), DA | Often creator-only or approximate        |
| `impressions` | X                                          | Creator analytics; may differ from views |
| `likes`       | X, DA                                      | Usually public                           |
| `favorites`   | DA                                         | DA-specific                              |
| `comments`    | Patreon, X, DA                             | Count only in v1                         |
| `reposts`     | X                                          | Retweets / reposts                       |
| `quotes`      | X                                          | Quote posts                              |
| `bookmarks`   | X                                          | Often not public                         |


Store platform-specific labels in `raw` (e.g. `{ "label": "Seen", "selector": "…" }`).

---

## Collectibility by platform (realistic v1)

### Patreon (`external_url` → `/posts/…-{id}`)


| Data                     | Likely source                          | Reliability                                                                      |
| ------------------------ | -------------------------------------- | -------------------------------------------------------------------------------- |
| Post title, publish time | Public page / creator view             | High                                                                             |
| Likes, comments          | Public or logged-in page               | Medium–high                                                                      |
| Impressions / “Seen”     | Creator insights UI or CSV import path | Medium (DOM/API); align with existing `PatreonInsightsPostMetric` where possible |


### X (`external_url` → `/…/status/{id}`)


| Data                    | Likely source      | Reliability                                     |
| ----------------------- | ------------------ | ----------------------------------------------- |
| Likes, reposts, replies | Public status page | Medium (DOM changes)                            |
| Views / impressions     | Often creator-only | Low on public scrape; extension while logged in |


### DeviantArt (`external_url` → `/…/art/…`)


| Data                       | Likely source     | Reliability                |
| -------------------------- | ----------------- | -------------------------- |
| Favorites, comments, views | Art page counters | Medium–high on public page |


**Verdict:** Linked URLs are a **meaningful analytics foundation**, not a full treasure trove on day one. Extension-assisted capture while the creator is logged in unlocks the most value per unit effort.

---

## Collection sources (recommended order)

1. **Extension DOM scrape (logged-in)** — Revisit saved `external_url` in a tab; content script reads visible counters; POST batch to Relay. Lowest new infra; reuses manifest host permissions.
2. **Manual “Refresh stats” in Relay** — User selects a library post → Relay opens/links URL via extension → same scrape pipeline. Clear consent, predictable cost.
3. **Scheduled refresh (background)** — Alarm + rate limits per creator; only attempts with `external_url` and `status: posted`. Requires staleness policy (e.g. daily for posts < 30d).
4. **Official APIs** — X API, Patreon API, DA API where OAuth exists. Higher fidelity; auth and cost.
5. **Third-party analytics** — Allowlisted if cost-controlled (e.g. social listening APIs). Last resort.

---

## Proposed API (sketch)


| Method | Path                                                      | Purpose                                                                 |
| ------ | --------------------------------------------------------- | ----------------------------------------------------------------------- |
| `POST` | `/api/v1/relay/distribution-attempts/:attempt_id/metrics` | Extension ingests `{ metrics: [{ metric_type, value, raw? }], source }` |
| `GET`  | `/api/v1/relay/posts/:post_id/external-metrics`           | Latest snapshot per `(destination, metric_type)` for UI                 |
| `POST` | `/api/v1/relay/posts/:post_id/external-metrics/refresh`   | Enqueue/trigger extension handoff to scrape linked URLs                 |


Auth: extension bearer (ingest) + creator session (read/refresh trigger).

---

## Extension flow (Slice 2a)

1. Relay returns linked attempts with `external_url` for a post.
2. Background opens or focuses tab at URL (or user already there).
3. Inject platform-specific **metric scrape** content script (separate from post-link toast).
4. Scrape → `POST …/metrics` with `source: extension_dom`.
5. `notifyRelayWebDistributionUpdated()` (or a dedicated `relay:external-metrics-updated` event) refreshes Insights / Audience UI.

Reuse patterns from Slice 1: `scripting.executeScript`, grant token, destination registry.

---

## UI integration targets


| Surface                          | Slice 2 display                                                             |
| -------------------------------- | --------------------------------------------------------------------------- |
| Audience panel (`BulkActionBar`) | Optional subline under **Posted ↗**: “124 views · 18 likes”                 |
| Gallery tile chips               | Tooltip or secondary chip with top metric                                   |
| Insights hub                     | Cross-platform performance card per Relay post (compare Patreon vs X vs DA) |
| Post inspector                   | “External performance” section with last refreshed + link out               |


Read path: join latest snapshots to `distribution_summary` in gallery list or a dedicated lightweight endpoint.

---

## Implementation phases


| Phase  | Scope                                                                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **2a** | Schema migration + ingest API + extension scrape for **Patreon first** + manual refresh button                                                                  |
| **2b** | Remaining cross-post destinations + scheduled refresh + Audience panel metrics line                                                                           |
| **2c** | Per-post CSV overlay on read path + basic Insights hub cards; dedupe with `PatreonInsightsPostMetric` (no creator-wide rollups yet)                           |
| **2d** | Creator-level aggregation: `ExternalPostMetricDaily` rollup table + cron, unified read endpoint, Insights Hub wiring, Relay engagement merge, dedup policy |


---

## Builder Todo List

Work down these items in order. Do not start with scheduled scraping or broad platform support; first prove the linked-post analytics loop on one confirmed Patreon URL.

### Todo 1 — Verify Slice 1 Identity Contract

- Confirm `PostDistributionAttempt.externalUrl` and `externalId` are populated after extension toast confirmation and manual URL confirmation.
- Confirm `GET /api/v1/relay/posts/:post_id/distribution-summary` returns `attempt_id`, `external_url`, and `external_id`.
- Confirm Audience **Posted ↗** and gallery chips link to the same saved canonical URL.
- Add or update a focused regression test for the Patreon URL shape `https://www.patreon.com/<creator>/posts/<slug>-<id>?pr=true`.

**Done when:** a test can create/complete a Patreon attempt and read back `external_url` + Patreon numeric `external_id`.

### Todo 2 — Add External Metric Snapshot Schema

- Add `ExternalPostMetricSnapshot` to `prisma/schema.prisma` near `PostDistributionAttempt`.
- Add relation fields:
  - `PostDistributionAttempt.metricSnapshots ExternalPostMetricSnapshot[]`
  - `Post.externalMetricSnapshots ExternalPostMetricSnapshot[]` if useful for joins.
- Generate a migration for `external_post_metric_snapshots`.
- Keep snapshots append-only for v1; do not mutate `PostDistributionAttempt` with metric columns.

**Done when:** Prisma client generates cleanly and the table has indexes for `(attempt_id, metric_type, captured_at)` and `(post_id, destination, metric_type, captured_at)`.

### Todo 3 — Backend Snapshot Service

- Create a small service module, e.g. `src/distribution/external-post-metrics-service.ts`.
- Implement `recordExternalPostMetricSnapshots(attemptId, metrics, source)`:
  - Load the attempt by id.
  - Require `status = posted`.
  - Require `externalUrl` to exist.
  - Verify the caller is authorized for `creatorId` through the existing route auth pattern.
  - Insert one row per metric.
- Normalize metric input names to snake_case DB fields but preserve raw platform details in `raw`.
- Accept nullable `value` when a metric was observed but not parseable; store parse diagnostics in `raw`.

**Done when:** service unit tests cover success, missing URL, non-posted attempt, unauthorized creator, and nullable metric values.

### Todo 4 — Backend Read Service

- Implement a latest-snapshot query for a Relay post:
  - Input: `post_id`.
  - Output: per destination, latest metric per `metric_type`, keyed by `attempt_id`.
  - Include `external_url`, `external_id`, `source`, and `captured_at`.
- Prefer a dedicated endpoint over expanding gallery payloads initially.

**Done when:** `GET /api/v1/relay/posts/:post_id/external-metrics` returns latest metrics for linked attempts without slowing gallery loads.

### Todo 5 — Metrics Ingest API

- Add `POST /api/v1/relay/distribution-attempts/:attempt_id/metrics`.
- Use extension bearer auth for extension-origin ingest.
- Request body:

```json
{
  "source": "extension_dom",
  "metrics": [
    { "metric_type": "likes", "value": 12, "raw": { "label": "Likes" } },
    { "metric_type": "comments", "value": 3, "raw": { "label": "Comments" } }
  ]
}
```

- Validate `source` against `extension_dom | public_scrape | platform_api | manual | third_party`.
- Return inserted snapshots and the attempt identity.

**Done when:** extension-token API tests can ingest metrics against a posted attempt and reject an unlinked/unposted attempt.

### Todo 6 — Metrics Read API

- Add `GET /api/v1/relay/posts/:post_id/external-metrics`.
- Use creator session auth, matching existing studio/distribution routes.
- Return a UI-friendly shape:

```json
{
  "post_id": "post_...",
  "destinations": [
    {
      "destination": "patreon",
      "attempt_id": "pda_...",
      "external_url": "https://www.patreon.com/RelayTEST/posts/test-162544992",
      "metrics": [
        { "metric_type": "likes", "value": 12, "source": "extension_dom", "captured_at": "..." }
      ]
    }
  ]
}
```

**Done when:** UI code can render metrics without knowing snapshot table details.

### Todo 7 — Extension Metric Message Contract

- Add internal message types for metric refresh:
  - `MSG_EXTERNAL_METRICS_REFRESH`
  - `MSG_EXTERNAL_METRICS_RESULT`
- Add an extension-side API helper, e.g. `extension/src/lib/external-metrics-report.ts`, that posts metrics to `/metrics` with the grant token.
- Reuse Slice 1 destination registry patterns and host permissions.
- Keep this separate from post-link confirmation messages.

**Done when:** a background handler can receive `{ attempt_id, external_url, destination }`, inject a scraper, and POST returned metrics.

### Todo 8 — Patreon Metric Probe Content Script

- Create `extension/src/content/scrape-patreon-metrics.ts`.
- For first pass, run only on a saved Patreon `external_url` opened from Relay.
- Scrape stable, visible page facts first:
  - post title
  - published timestamp or visible posted-time text
  - likes count if visible
  - comments count if visible
- Treat views/impressions as optional; do not block v1 on hidden creator-insights-only counters.
- Store raw selectors/text in each metric `raw` object.
- Log parse misses in `raw` rather than throwing.

**Done when:** on the test Patreon post, the script can return at least title metadata and any visible counters without breaking if a counter is absent.

### Todo 9 — Manual Refresh Entry Point in Relay UI

- Add a **Refresh stats** action near connected post links.
- Start with the Audience panel or post inspector, not the gallery grid.
- Button behavior:
  - disabled when no `external_url`
  - calls a Relay web helper that sends a message to the extension with linked attempt info
  - shows `Refreshing…`, `Updated just now`, or a useful failure state
- Do not auto-open multiple platform tabs in v1; one click refreshes one linked destination.

**Done when:** a creator can click **Refresh stats** for the Patreon **Posted ↗** row and get metrics captured into the backend.

### Todo 10 — Extension Refresh Flow

- Background receives refresh request.
- Opens or focuses the saved `external_url`.
- Waits for tab load.
- Injects `scrape-patreon-metrics.ts`.
- Posts metrics to Relay using extension grant token.
- Notifies Relay tabs with a new event, e.g. `relay:external-metrics-updated`.

**Done when:** a manual refresh updates backend snapshots and the Relay UI refreshes without a full browser reload.

### Todo 11 — Frontend Metrics Client

- Add `fetchPostExternalMetrics(postId)` to `web/lib/relay-api.ts`.
- Add `subscribeRelayExternalMetricsRefresh` or extend the existing distribution refresh hook with a dedicated metrics event.
- Keep client types aligned with the read endpoint.

**Done when:** Audience/post inspector UI can fetch latest metrics after refresh and after focus restore.

### Todo 12 — Minimal UI Display

- In Audience panel, show a small subline beneath **Posted ↗**:
  - `12 likes · 3 comments`
  - `Updated 2m ago`
- Hide missing metrics rather than showing zeros unless the scraper explicitly captured `0`.
- Include source/provenance in tooltip or secondary text: `from extension scan`.

**Done when:** a linked Patreon post shows latest captured counters next to the direct external link.

### Todo 13 — Test Existing Patreon Linked Post

Use the confirmed dev URL flow from Slice 1:

1. Cross-post to Patreon.
2. Publish.
3. Confirm via extension toast.
4. Verify Relay stores `external_url` and `external_id`.
5. Click **Refresh stats**.
6. Verify snapshot rows exist.
7. Verify Audience UI displays the latest metrics.
8. Click **Posted ↗** and confirm it still navigates to Patreon.

**Done when:** the same connected post can be both linked and scanned for first-pass metrics.

### Todo 14 — Test Coverage

- Backend tests:
  - schema/service insert
  - extension ingest auth
  - creator read auth
  - latest metric selection
- Extension tests:
  - Patreon scrape parser against fixture HTML
  - missing counter behavior
  - message validation
- UI tests:
  - no metrics state
  - refresh loading state
  - latest metrics displayed

**Done when:** tests protect the end-to-end path without depending on live Patreon DOM in CI.

### Todo 15 — Guardrails and Follow-Ups

- Add rate limiting or cooldown for manual refresh.
- Add stale-after policy (`captured_at` older than 24h shows “Refresh available”).
- Keep scheduled refresh out of Slice 2a.
- Keep X and DeviantArt out of Slice 2a unless Patreon probe proves the flow.
- Remove temporary diagnostic logs from the extension before returning to prod builds.

**Done when:** Slice 2a is shippable as an explicit, user-initiated analytics refresh for linked Patreon posts.

---

## Phase 2d — Creator-Level Metric Aggregation

Work down these items after Slice 2c. Phase 2d turns per-post snapshots into creator-wide analytics for the Insights Hub — daily rollups, a unified read endpoint, and cross-platform totals.

**Depends on:** Slice 2c (stable per-post read + CSV overlay). Does not require new platform scrapers.

### Todo 2d-1 — Add `ExternalPostMetricDaily` rollup table

Add to `prisma/schema.prisma`:

```prisma
model ExternalPostMetricDaily {
  id             String   @id @default(cuid())
  creatorId      String   @map("creator_id")
  postId         String   @map("post_id")
  destination    String
  metricType     String   @map("metric_type")
  day            DateTime @db.Date @map("day")
  value          Int      @default(0)
  deltaFromPrior Int?     @map("delta_from_prior")
  source         String
  computedAt     DateTime @default(now()) @map("computed_at")

  @@unique([creatorId, postId, destination, metricType, day])
  @@index([creatorId, day])
  @@index([postId, metricType, day])
  @@map("external_post_metric_daily")
}
```

- One row per `(creator, post, destination, metric, day)`.
- `value` = last known absolute value for that day.
- `deltaFromPrior` = `value - previous_day_value` (nullable for first observation).
- `source` = best source available that day (prefer `platform_api` > `extension_dom` > `third_party`).

**Done when:** migration runs cleanly and Prisma client generates.

### Todo 2d-2 — Rollup computation service

Create `src/analytics/external-metric-rollup-service.ts`:

- `computeDailyRollups(prisma, creatorId, options?: { since?: Date })`:
  - Query raw `ExternalPostMetricSnapshot` rows grouped by `(postId, destination, metricType, DATE(capturedAt))`.
  - For each group, pick the latest snapshot of the day (preferring higher-fidelity `source`).
  - Upsert into `ExternalPostMetricDaily`.
  - Compute `deltaFromPrior` by looking at the previous day's row.
- Handles CSV import overlay: for any `(postId, destination=patreon)` day with no snapshot, fall back to `PatreonInsightsPostMetric` if `asOf` matches.
- Merges `RelayEngagementEvent` counts for `(postId, destination="relay")` by day.

**Done when:** unit tests confirm correct rollup from fixture snapshots including source precedence and delta calculation.

### Todo 2d-3 — Rollup trigger (cron or on-write)

Two strategies (implement the simpler one first):

- **Option A (cron):** Schedule daily via existing job infrastructure. Recomputes last 2 days for the creator to catch late-arriving snapshots.
- **Option B (on-write incremental):** After `recordExternalPostMetricSnapshots` succeeds, upsert the affected day's rollup row inline. Cheaper per-call but more complex.

Recommend **Option A** for v1 — simple, idempotent, avoids latency on the ingest hot path.

**Done when:** a scheduled entry exists that calls `computeDailyRollups` for active creators.

### Todo 2d-4 — Unified creator analytics read endpoint

Add `GET /api/v1/creator/analytics/unified-performance`:

Response shape:

```json
{
  "creator_id": "...",
  "time_range": { "start": "...", "end": "..." },
  "totals": {
    "impressions": 14200,
    "likes": 312,
    "comments": 47,
    "seen": 8700
  },
  "by_destination": [
    { "destination": "patreon", "impressions": 9000, "likes": 200 },
    { "destination": "x", "impressions": 5200, "likes": 112 }
  ],
  "top_posts": [
    { "post_id": "...", "title": "...", "total_reach": 4500, "destinations": [] }
  ],
  "daily_series": [
    { "day": "2026-06-28", "impressions": 420, "likes": 12 }
  ]
}
```

- Reads from `ExternalPostMetricDaily`, not raw snapshots.
- Accepts `?range=7d|30d|90d` and optional `?destination=patreon`.
- Falls back to CSV performance data if rollup table is empty (migration grace period).

**Done when:** endpoint returns real aggregated data for a creator with existing snapshots.

### Todo 2d-5 — Wire Insights Hub UI to unified endpoint

In `web/app/studio/analytics/AnalyticsInsightsHub.tsx`:

- Add `fetchUnifiedPerformance(range)` to `web/lib/relay-api.ts`.
- Replace the CSV-only `RadialPostMetric` data path with unified endpoint data.
- Keep CSV path as fallback when unified returns empty.
- Wire `TimeScale` selector to `?range=` param.
- Update `by_destination` to populate the cross-platform comparison section.

**Done when:** Insights Hub displays real aggregated metrics from multiple platforms, with per-platform breakdown.

### Todo 2d-6 — Relay engagement event integration

- In rollup service, count `RelayEngagementEvent` grouped by `(postId, day, eventType)` and write as `destination="relay"` rows in `ExternalPostMetricDaily`.
- Map event types: `post_view` → `views`, `post_like` → `likes`, `post_comment` → `comments`.
- Surface in unified endpoint under `destination: "relay"`.

**Done when:** first-party Relay views appear alongside external platform metrics in the Hub.

### Todo 2d-7 — Deduplication policy

- When both raw snapshots and CSV exist for the same `(post, day, metric)`, prefer snapshot if `source` is `extension_dom` or `platform_api`.
- When CSV has reach data (impressions/seen) that snapshots lack, use CSV.
- Document the precedence order in a comment on the rollup function.

**Done when:** rollup produces correct, non-duplicated totals for a post that has both CSV import and live snapshot data.

### Todo 2d-8 — Tests and guardrails

- Rollup service unit tests: source precedence, delta calc, CSV fallback, relay event merge.
- Endpoint integration test: correct totals for multi-destination, multi-day data.
- UI: verify Hub renders with zero data, partial data, and full data.
- Add a staleness indicator: if latest rollup `computedAt` is > 48h old, show "Data may be outdated" in the Hub.

**Done when:** test suite covers the aggregation happy path and edge cases without hitting live platforms.

---

## Phase 3 — Cross-Platform Performance Intelligence (follow-on)

Slice 2d delivers creator-level daily rollups and a unified read endpoint. The next product layer introduces **Work/Bundle** analytics, platform instance drilldowns, safe refresh, suggested bundling, and action-oriented insights.

**Vocabulary (Phase 0 — complete):** [docs/analytics/PERFORMANCE_INTELLIGENCE_VOCABULARY.md](../analytics/PERFORMANCE_INTELLIGENCE_VOCABULARY.md)

Stable terms for all follow-on work:

- **Work/Bundle** — one creative work (full piece + teasers + reposts)
- **Relay Post (variant role)** — full | teaser | promo | repost within a bundle
- **Platform Instance** — one published URL/status on a destination
- **Metric source / confidence / freshness** — transparency and dedup policy
- **Campaign / tag / goal / action** — category rollups and Insight Bot outputs

Phase 1+ implementation tasks are tracked in the Cross-Platform Performance Intelligence build plan (`.cursor/plans/`).

---

## Non-goals (Slice 2 v1)

- Real-time streaming metrics
- Comment text / sentiment ingestion
- Replacing Patreon CSV insights import
- Scraping without user-initiated or scheduled consent

---

## Related code (Slice 1)


| Area                   | Path                                                          |
| ---------------------- | ------------------------------------------------------------- |
| Attempt complete + URL | `src/distribution/post-distribution-service.ts`               |
| Extension confirm      | `extension/src/lib/distribution-complete-report.ts`           |
| URL patterns           | `extension/src/lib/post-link-patterns.ts`                     |
| Relay refresh hook     | `web/lib/relay-distribution-refresh.ts`                       |
| Posted ↗ UI            | `web/app/components/BulkActionBar.tsx`, `GalleryGridTile.tsx` |


