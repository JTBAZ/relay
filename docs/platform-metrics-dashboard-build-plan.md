# Platform Metrics Dashboard Build Plan

## Purpose

Build platform analytics dashboard-first: every vital metric gets a visible card before its data pipeline is complete. Empty cards start as `NaN`, `No data yet`, or `Pending instrumentation`. As each work item lands, the dashboard comes to life and exposes scope gaps immediately.

This plan aligns with:

- `road map.md` Workstream E: Analytics Foundation.
- `docs/growth-analytics-features.md`: first-party Relay truth before external aggregation.
- `analytics-action-center-spec.md`: explainability, source labeling, and guarded actions.
- `docs/database/usage-events-rollups.md`: usage metering rollups.
- `docs/database/operations-and-security.md`: platform health monitoring.

## Product Principle

The dashboard is the telemetry contract.

Every metric must be one of:

- `not_wired`: Card exists, no event/source yet.
- `pending_instrumentation`: Source has been designed, not emitting.
- `collecting`: Raw data is landing, no reliable rollup yet.
- `live`: Dashboard value is backed by a durable rollup or trusted source.
- `estimated`: Computed from partial/proxy data and clearly labeled.
- `manual_import`: Depends on CSV/manual upload.
- `deferred`: Deliberately out of scope for this phase.

No important metric should be hidden because it is not ready. Missing data should be visible.

## Metric Ownership Rules

These rules govern who owns each layer of the platform analytics program. They are part of the approved contract for **PMD-000**.

| Layer | Owner | Responsibility |
|-------|-------|----------------|
| Dashboard contract | Product / operator | Approves sections, metric keys, definitions, and what counts as P0 vs deferred |
| Metric registry | Engineering | Implements registry schema, seeds placeholders, updates status as wiring lands |
| First-party events | Engineering | Emits stable event names and privacy-safe payloads from web/API surfaces |
| Rollups and trends | Engineering / data | Builds daily rollups, freshness checks, and trend calculations |
| Platform Ops health | Engineering / DevOps | Keeps health endpoints accurate; ops cards are trusted before product cards |
| Creator `/analytics` | Product (creator-facing) | Stays tenant-scoped; never mixed into cross-tenant operator dashboard without staff auth |
| Revenue definitions | Product + finance | Approves MRR/ARR/churn labels; engineering never presents estimates as actuals |
| Operator access | Security / product | Staff role, audit logging, and RLS review before cross-tenant exposure |

**Change control**

- New dashboard cards require a registry key, Airtable work item, and entry in `docs/platform-metrics-inventory.md` before implementation.
- Metrics move from `not_wired` → `collecting` → `live` only when acceptance criteria for the linked work item are met.
- Proxy or estimated metrics must use status `estimated` and show source notes in the UI.
- Patreon-upstream revenue and Relay-native revenue must never share a card without explicit source labeling.
- Deferred metrics stay visible with status `deferred`; they are not removed from the dashboard.

**Canonical inventory**

Every P0/P1 metric key, definition, formula, source, initial status, and target phase lives in:

- [`docs/platform-metrics-inventory.md`](platform-metrics-inventory.md)

## Dashboard Sections

### 1. Data Coverage

Shows whether the analytics program itself is healthy.

Metrics:

- Total dashboard metrics.
- Metrics live.
- Metrics collecting.
- Metrics not wired.
- Metrics stale.
- Metrics dependent on manual import.
- Last successful rollup time.
- Last telemetry ingest time.

### 2. Traffic

Shows whether Relay surfaces are being visited.

Metrics:

- Total visits.
- Unique visitors.
- Page views.
- Public profile views.
- Gallery views.
- Referral/source breakdown.
- Anonymous vs authenticated traffic.

Initial state: mostly `NaN`; `relay_engagement_events` can partially support profile/gallery views once enabled.

### 3. Activity

Shows whether people are returning and using the product.

Metrics:

- DAU.
- WAU.
- MAU.
- Active creators.
- Active patrons.
- Feed opens.
- Post views.
- Session starts.

Initial state: session table can provide an estimated proxy, but true DAU requires first-party event instrumentation.

### 4. Growth

Shows whether the network is expanding.

Metrics:

- New creators.
- New patrons.
- Creator onboarding completion.
- Patreon creator connections.
- Patreon patron links.
- New follows.
- Activation rate.
- Repeat visitor rate.

Initial state: account, profile, follow, and entitlement tables can provide partial values.

### 5. Revenue

Shows whether Relay monetization is working.

Metrics:

- Relay-native gross revenue.
- Relay-native net revenue.
- MRR.
- ARR.
- ARPU.
- Checkout starts.
- Checkout completions.
- Failed payments.
- Upgrades.
- Downgrades.
- Cancellations.
- Churn rate.

Initial state: `NaN` until Relay-native checkout/subscription flows are live. Patreon-upstream revenue must be labeled separately and never mixed with Relay-native revenue.

### 6. Creator Health

Shows whether creators reach value.

Metrics:

- Creators onboarded.
- Creators with Patreon connected.
- Imports started.
- Imports completed.
- Posts imported.
- Relay-native posts published.
- Galleries launched.
- Analytics page views.
- Action Center cards shown.
- Action Center cards accepted/dismissed.

Initial state: partly available from onboarding/import tables and Action Center tables once generation runs.

### 7. Patron Health

Shows whether patrons have a useful return loop.

Metrics:

- Patrons linked to Patreon.
- Active entitlement snapshots.
- Stale entitlement snapshots.
- Feed opens.
- Creator follows.
- Favorites.
- Comments.
- Collection saves.
- Notification reads.

Initial state: follows and entitlement freshness are available; feed engagement requires instrumentation.

### 8. Content Performance

Shows which content drives attention and engagement.

Metrics:

- Top posts by views.
- Top posts by reveal interactions.
- Top posts by saves/favorites.
- Top posts by comments.
- Tier-specific engagement.
- Patreon Insights impressions.
- Patreon Insights seen.
- Patreon Insights likes/comments.
- CSV linkage gaps.

Initial state: Patreon Insights CSV import can fill some metrics; first-party views/reveals require `relay_engagement_events`.

### 9. Platform Ops

Shows whether the system is healthy enough to trust analytics.

Metrics:

- DB connectivity.
- DB connection pressure.
- Ingest health.
- Export health.
- Analytics job health.
- Job queue health.
- OAuth credential health.
- Supabase sync errors.
- Stale entitlements.
- API 429s.
- Export bandwidth.
- Error rate.

Initial state: many values already exist through health endpoints and `usage_events`.

## Metric Registry Contract

The dashboard should render from a registry, not from one-off card code.

Minimum metric shape:

```ts
type PlatformMetricDefinition = {
  key: string;
  label: string;
  section:
    | "data_coverage"
    | "traffic"
    | "activity"
    | "growth"
    | "revenue"
    | "creator_health"
    | "patron_health"
    | "content_performance"
    | "platform_ops";
  phase: string;
  status:
    | "not_wired"
    | "pending_instrumentation"
    | "collecting"
    | "live"
    | "estimated"
    | "manual_import"
    | "deferred";
  scope: "platform" | "creator" | "patron" | "post" | "session" | "system";
  definition: string;
  formula: string;
  source: string;
  value: number | string | null;
  displayValue: string;
  freshnessState: "unknown" | "fresh" | "stale" | "broken";
  lastUpdatedAt: string | null;
  notes?: string;
};
```

The dashboard should treat `value: null` as a deliberate placeholder, not an error.

## Implementation Phases

### Phase 0: Contract and Baseline

Goal: lock the dashboard scope before building pipelines.

Work:

- Approve dashboard sections.
- Approve metric status taxonomy.
- Create initial metric registry list.
- Document source and formula for every metric, even if it is `not_wired`.
- Add Airtable work items for each implementation step.

Exit criteria:

- Markdown plan exists.
- Airtable table is structured for phase, priority, section, metric keys, dependencies, acceptance criteria, and notes.
- Every high-priority metric has a placeholder work item.

### Phase 1: Empty Dashboard Shell

Goal: make the analytics surface visible with placeholders.

Work:

- Add platform metrics dashboard route.
- Add metric card component.
- Add status badges.
- Add metric detail drawer.
- Add Data Coverage section.
- Render `NaN`/`No data yet` states cleanly.

Exit criteria:

- Dashboard renders all sections without real data.
- Operators can click a metric and see definition, formula, source, and status.
- Data Coverage makes missing instrumentation obvious.

### Phase 2: Metric Registry API

Goal: make the dashboard data-driven.

Work:

- Create registry source in backend or shared module.
- Add operator-facing metric registry API.
- Seed all planned metrics as null placeholders.
- Include freshness metadata.

Exit criteria:

- Dashboard renders from registry API.
- Adding a metric does not require custom UI code.
- Every metric has source, status, formula, and phase metadata.

### Phase 3: Wire Existing Sources

Goal: make cards come alive from data already available.

Sources:

- `usage_events`.
- `accounts`.
- `sessions`.
- `patron_follows`.
- `patron_entitlement_snapshots`.
- Health endpoints.
- `creator_membership_events` once populated.
- `relay_engagement_events` once enabled.

Exit criteria:

- Platform Ops section has real health values.
- Usage/export cards are live.
- Account and follow counts are live.
- Session-based activity is shown only as an estimated proxy.

### Phase 4: First-Party Instrumentation

Goal: collect the vital product events needed for DAU, traffic, and engagement.

Core events:

- `page_view`.
- `session_start`.
- `profile_view`.
- `gallery_view`.
- `feed_open`.
- `post_view`.
- `post_reveal`.
- `creator_onboarded`.
- `patreon_connected`.
- `import_completed`.
- `post_published`.
- `follow_created`.
- `favorite_created`.
- `comment_created`.

Exit criteria:

- Events land with stable names and documented payloads.
- No raw PII is stored in event payloads.
- Cards move from `not_wired` to `collecting`.

### Phase 5: Rollups and Trends

Goal: make metrics reliable and fast.

Work:

- Add daily rollup table or materialized view.
- Add rollup job.
- Compute DAU, WAU, MAU.
- Compute traffic by surface.
- Compute creator/patron activation.
- Compute trend deltas.
- Add freshness/staleness checks.

Exit criteria:

- Dashboard reads rollups instead of scanning raw events.
- Trend arrows and period-over-period deltas appear.
- Zero activity is distinguishable from broken collection.

### Phase 6: Revenue Metrics

Goal: show business performance once Relay-native monetization exists.

Work:

- Define revenue terms.
- Track checkout lifecycle.
- Track subscription changes.
- Separate Patreon-upstream revenue from Relay-native revenue.
- Add revenue rollups.

Exit criteria:

- Revenue cards are clearly labeled as Relay-native, Patreon-upstream, or not available.
- No estimate is presented as actual revenue.
- Churn and retention definitions are documented.

### Phase 7: Secure Operator Access

Goal: safely expose platform-wide analytics.

Work:

- Define staff/operator role.
- Protect operator metrics APIs.
- Add privileged access audit logging.
- Review RLS gaps before exposing metric tables.
- Keep creator dashboards tenant-scoped.

Exit criteria:

- Non-staff users cannot access cross-tenant analytics.
- Operator access is auditable.
- Raw telemetry is not exposed through unsafe client paths.

### Phase 8: Alerts and Operating Rhythm

Goal: turn the dashboard into an operating system.

Work:

- Add alerts for DAU drops, traffic drops, revenue dips, stale entitlements, queue failures, sync failures, and error spikes.
- Add weekly operator summary.
- Add ritual to review `NaN` and `pending` metrics.
- Retire or defer stale metrics intentionally.

Exit criteria:

- Dashboard drives weekly operating review.
- Alerts link back to dashboard cards.
- Pending metrics are reviewed instead of forgotten.

## Airtable Migration Model

Base: `Batting Order`.

Table: `Platform Metrics Dashboard`.

Recommended fields:

- `Work Item ID`
- `Phase`
- `Type`
- `Priority`
- `Dashboard Section`
- `Metric Keys`
- `Dependencies`
- `Live Dashboard Impact`
- `Acceptance Criteria`
- `Implementation Notes`
- `Source Docs`
- Existing `Status`
- Existing `Assignee`
- Existing `Notes`

## Seed Work Items

The first Airtable load should prioritize the visible dashboard spine:

1. Dashboard contract.
2. Empty dashboard route.
3. Metric cards and status badges.
4. Data Coverage section.
5. Metric registry API.
6. Existing-source wiring.
7. First-party event contract.
8. Event ingestion.
9. Rollups.
10. Secure operator access.

Detailed records live in the Airtable table so engineering agents can execute one work item at a time while operators watch cards move from `NaN` to `collecting` to `live`.

## Contract Approval (PMD-000)

| Item | Status | Location |
|------|--------|----------|
| Dashboard sections (9) | Approved | This document, § Dashboard Sections |
| Metric status taxonomy (7 states) | Approved | This document, § Product Principle |
| Metric ownership rules | Approved | This document, § Metric Ownership Rules |
| P0/P1 metric inventory | Approved | `docs/platform-metrics-inventory.md` |
| Airtable execution backlog | Approved | Batting Order → Platform Metrics Dashboard |
| Registry TypeScript contract | Approved | This document, § Metric Registry Contract |

**PMD-000 exit:** No P0 metric lacks a key, definition, formula, source label, initial status, or target phase. Implementation begins at **PMD-001** (status taxonomy in UI) and **PMD-010** (empty dashboard shell).

## Status Taxonomy UI Mapping (PMD-001)

| Item | Status | Location |
|------|--------|----------|
| Seven status → badge → empty-state mapping | Done | `docs/platform-metric-status-taxonomy.md` |
| `resolveMetricDisplay()` (zero vs missing) | Done | `src/platform-metrics/metric-status-taxonomy.ts` |
| Web import surface | Done | `web/lib/platform-metric-status.ts` |
| Unit tests | Done | `tests/platform-metric-status-taxonomy.test.ts` |

**PMD-001 exit:** Dashboard cards can render consistent badge labels and placeholder copy from registry `status` alone; `live` + `0` reads as zero activity, not missing instrumentation.

## Metric Registry API (PMD-020/021/022)

| Item | Status | Location |
|------|--------|----------|
| Registry TypeScript contract | Done | `src/platform-metrics/metric-registry-types.ts` |
| Seed (69 metrics) | Done | `src/platform-metrics/registry-seed.json` |
| Registry builder + coverage rollups | Done | `src/platform-metrics/platform-metric-registry-service.ts` |
| Operator API | Done | `GET /api/v1/platform-metrics/registry` |
| Dashboard fetch | Done | `web/lib/relay-api.ts`, `web/app/platform-metrics/PlatformMetricsDashboard.tsx` |
| Tests | Done | `tests/platform-metric-registry-service.test.ts`, `tests/platform-metrics-registry-route.test.ts` |

## Phase 3 Wiring (partial — PMD-030)

| Source | Metrics wired |
|--------|----------------|
| Platform health | `ops.db_connectivity`, `ops.db_connection_pressure`, `ops.oauth_unhealthy`, `ops.stale_entitlements`, `ops.supabase_sync_errors` |
| Ingest/export/analytics health | `ops.ingest_health`, `ops.export_health`, `ops.analytics_job_health` |
| `usage_events` | `ops.export_content_bytes`, `ops.export_thumb_bytes`, `ops.library_zip_downloads`, `ops.api_rate_limited` |
| Domain tables | growth + patron health counts, `activity.active_sessions_estimated` (estimated) |
| Coverage rollups | all `coverage.*` cards |

**Next wiring targets:** creator health tables, Patreon Insights CSV (`manual_import`), first-party event ingestion (PMD-041+).

## First-Party Event Contract (PMD-040)

| Item | Status | Location |
|------|--------|----------|
| Event catalog (15 events) | Done | `docs/platform-first-party-event-contract.md` |
| TypeScript contract + validator | Done | `src/platform-metrics/first-party-event-contract.ts` |
| Registry metric key cross-check | Done | `tests/first-party-event-contract.test.ts` |
| Live mapping to `relay_engagement_events` | Done | profile_view, gallery_view, post_reveal (partial) |

**PMD-040 exit:** Event names, required/optional fields, privacy rules, dedupe posture, and source surfaces are documented before ingestion work. Three events are already live via P5a engagement writer; remaining events target `platform_telemetry_events` or domain tables.

**Next:** PMD-041 — build first-party event ingestion endpoint.

## First-Party Event Ingestion (PMD-041)

| Item | Status | Location |
|------|--------|----------|
| `platform_telemetry_events` schema | Done | `prisma/schema.prisma`, migration `20260524160000_platform_telemetry_events` |
| Ingestion service + validator | Done | `src/platform-metrics/first-party-event-ingestion.ts` |
| POST ingestion API | Done | `POST /api/v1/platform-metrics/events` |
| Coverage wiring | Done | `coverage.last_ingest_at` from platform + engagement stores |
| Tests | Done | `tests/first-party-event-ingestion.test.ts`, `tests/platform-metrics-events-route.test.ts` |

**PMD-041 exit:** Endpoint validates event names and payloads, rejects unsafe fields and domain-sourced events, persists to the correct store, and returns safe success/failure envelopes. Operator dashboard shows last ingest timestamp when events exist.

**Next:** PMD-042 — instrument public profile and gallery events from client surfaces.

## Public Gallery Instrumentation (PMD-042)

| Item | Status | Location |
|------|--------|----------|
| Server-side profile/gallery engagement | Done | `GET /api/v1/gallery/facets`, `items`, `post-detail` (visitor) |
| Visitor session key header | Done | `X-Relay-Visitor-Session` → `relay_engagement_events.session_key` |
| Post view on post-detail | Done | `post_view` → `platform_telemetry_events` |
| Tier reveal client beacons | Done | `web/lib/visitor-gallery-telemetry.ts`, tier gate Upgrade clicks |
| Registry live counts | Done | `traffic.profile_views`, `traffic.gallery_views`, `content.post_views`, `content.post_reveals` |

**PMD-042 exit:** Profile view, gallery view, post view, and reveal events emit from public/gallery surfaces and appear in raw event storage when `RELAY_DB_STORE_ANALYTICS=1`.

**Next:** PMD-043 — instrument patron feed and studio surfaces.

## Patron Feed Instrumentation (PMD-043)

| Item | Status | Location |
|------|--------|----------|
| Feed open beacon | Done | `web/lib/patron-feed-telemetry.ts`, `RelayApp` mount after live feed load |
| Post view on patron post detail | Done | `PatronPostDetailClient` after successful load |
| Actor + session dimensions | Done | `actor_key` = `PatronSessionMe.user_id`, opaque `session_key` in localStorage |
| Registry live counts | Done | `activity.feed_opens`, `activity.post_views` (plus existing `content.post_views`) |

**PMD-043 exit:** Feed open and post view events emit from patron feed and post detail surfaces with patron/session and creator/post dimensions. Requires signed-in patron session and `RELAY_DB_STORE_ANALYTICS=1`.

**Next:** PMD-050 — daily rollup storage (Phase 5).

## Daily Rollup Storage (PMD-050)

| Item | Status | Location |
|------|--------|----------|
| `platform_metric_daily_rollups` schema | Done | `prisma/schema.prisma`, migration `20260525120000_platform_metric_daily_rollups` |
| Rollup types + day normalization | Done | `src/platform-metrics/platform-metric-daily-rollup-types.ts` |
| Idempotent upsert service | Done | `src/platform-metrics/platform-metric-daily-rollup-service.ts` |
| Coverage wiring | Done | `coverage.last_rollup_at` from `MAX(generated_at)` |
| Docs + tests | Done | `docs/database/platform-metric-daily-rollups.md`, `tests/platform-metric-daily-rollup.test.ts` |

**PMD-050 exit:** Daily rollup table supports `metric_key`, `day`, `scope`, `scope_id`, `value`, `dimensions`, source freshness, and `generated_at` with idempotent upserts.

**Next:** PMD-052 — trend deltas and freshness states for rollup-backed cards.

## Daily Rollup Job (PMD-051)

| Item | Status | Location |
|------|--------|----------|
| DAU/traffic rollup computation | Done | `src/platform-metrics/platform-metric-daily-rollup-job.ts` |
| BullMQ worker + repeat scheduler | Done | `platform_metric_daily_rollup` queue; env `RELAY_PLATFORM_METRIC_DAILY_ROLLUP_MS` |
| Dashboard wiring from rollups | Done | `wire-existing-sources.ts` reads `platform_metric_daily_rollups` |
| Tests | Done | `tests/platform-metric-daily-rollup-job.test.ts` |

**PMD-051 exit:** Callable scheduled job writes daily grains for `activity.dau`, `activity.wau`, `activity.mau`, `traffic.page_views`, `traffic.unique_visitors`, `traffic.profile_views`, and `traffic.gallery_views`. Registry no longer uses session-table proxies for DAU.

**Next:** PMD-070 — operator access model (Phase 7), or PMD-013 metric detail drawer.

## Trends and Freshness (PMD-052)

| Item | Status | Location |
|------|--------|----------|
| Trend delta types + math | Done | `src/platform-metrics/platform-metric-trend-types.ts`, `platform-metric-trend-service.ts` |
| Rollup freshness evaluation | Done | `evaluateRollupFreshness()` using `generated_at` + `source_updated_at` |
| Registry enrichment | Done | `platform-metric-registry-service.ts` attaches `trends` to rollup-backed metrics |
| Dashboard wiring | Done | `wire-existing-sources.ts` marks stale vs collecting |
| Card UI (DoD/WoW/MoM) | Done | `web/components/platform-metrics/PlatformMetricCard.tsx` |
| Tests | Done | `tests/platform-metric-trend-service.test.ts`, `tests/web/platform-metric-trends.test.ts` |

**PMD-052 exit:** Rollup-backed cards show DoD/WoW/MoM when history exists; stale rollups are labeled separately from zero activity; `coverage.stale_metrics` counts stale cards.

**Next:** PMD-071 — privileged access audit trail.

## Operator Access Model (PMD-070)

| Item | Status | Location |
|------|--------|----------|
| Access model docs | Done | `docs/platform-operator-access.md` |
| Allowlist policy + evaluator | Done | `src/platform-metrics/platform-operator-access.ts` |
| Registry API guard | Done | `GET /api/v1/platform-metrics/registry` when `RELAY_PLATFORM_OPERATOR_ACCESS_ENFORCE=1` |
| Web session gate | Done | `web/components/platform-metrics/PlatformOperatorRouteGuard.tsx` |
| Tests | Done | `tests/platform-operator-access.test.ts`, `tests/platform-metrics-registry-operator-access.test.ts` |

**PMD-070 exit:** Operator role model documented; non-operators cannot read cross-tenant registry when enforcement is enabled; event ingestion remains open for client beacons.

**Next:** PMD-080 — dashboard alerts for operating risks.

## Operator Access Audit (PMD-071)

| Item | Status | Location |
|------|--------|----------|
| Audit table | Done | `platform_operator_access_audits`, migration `20260525180000_platform_operator_access_audits` |
| Audit service | Done | `src/platform-metrics/platform-operator-access-audit.ts` |
| Registry route logging | Done | allowed reads + denied 401/403 in `platform-operator-access.ts` / `server.ts` |
| RLS review doc | Done | `docs/platform-metrics-rls-review.md` |
| Tests | Done | `tests/platform-operator-access-audit.test.ts`, migration test |

**PMD-071 exit:** Privileged registry access is audit logged; telemetry/rollup/audit tables reviewed for RLS with no client-facing raw exposure.

**Next:** PMD-081 — weekly operator summary ritual, or PMD-044 creator instrumentation.

## Dashboard Alerts (PMD-080)

| Item | Status | Location |
|------|--------|----------|
| Alert types + registry field | Done | `platform-operating-alert-types.ts`, `platform-operating-alert-service.ts` |
| Rule evaluation | Done | DAU/traffic drops, stale entitlements, sync failures, queue/DLQ pressure, error spikes; revenue dip when revenue is live |
| Registry integration | Done | `buildPlatformMetricRegistry()` returns `alerts[]`; alert metric cards show active/clear |
| Dashboard UI | Done | `PlatformOperatingAlertsPanel.tsx` links to `#metric-{key}` anchors on cards |
| Tests | Done | `tests/platform-operating-alert-service.test.ts`, registry route asserts `alerts` |

**PMD-080 exit:** Operating risks surface as linked alerts with source/freshness context on metric cards. Revenue dip rule waits until `revenue.gross` is live.

**Next:** PMD-044 creator studio instrumentation, or PMD-060 revenue contract.

## Weekly Metrics Review (PMD-081)

| Item | Status | Location |
|------|--------|----------|
| Review runbook | Done | `docs/platform-metrics-weekly-review.md` |
| Triage service | Done | `src/platform-metrics/platform-operating-review-service.ts` |
| Registry `operatingReview` | Done | `buildPlatformMetricRegistry()` |
| Coverage rollups | Done | `coverage.pending_instrumentation_metrics`, `coverage.deferred_metrics` |
| Dashboard UI | Done | `PlatformOperatingReviewPanel.tsx` |
| Tests | Done | `tests/platform-operating-review-service.test.ts` |

**PMD-081 exit:** Weekly review ritual is documented; dashboard surfaces a triage queue with wire/defer/monitor guidance; decisions are logged on the Airtable execution table.

**Next:** PMD-044 creator studio instrumentation, PMD-060 revenue contract, or PMD-013 metric detail drawer.

## Creator Studio Instrumentation (PMD-044)

| Item | Status | Location |
|------|--------|----------|
| Client telemetry helper | Done | `web/lib/creator-studio-telemetry.ts` |
| Analytics page beacon | Done | `AnalyticsOverviewClient.tsx` → `analytics_viewed` |
| Action Center beacons | Done | `ActionCenterView.tsx` → `action_center_used` (view/accept/dismiss/refresh) |
| Contract updates | Done | `analytics_viewed`, `action_center_used`; domain milestones marked live |
| Registry wiring | Done | `wire-existing-sources.ts` — OAuth health, ingest batches, RELAY posts, telemetry counts |
| Tests | Done | `web/lib/creator-studio-telemetry.test.ts` |

**PMD-044 exit:** Connect/import/publish metrics read from domain tables; analytics and Action Center surfaces emit first-party telemetry when `RELAY_DB_STORE_ANALYTICS=1`.

**Next:** PMD-060 revenue contract, PMD-013 metric detail drawer, or PMD-043 patron feed expansion.

## Revenue Telemetry Contract (PMD-060)

| Item | Status | Location |
|------|--------|----------|
| Metric definitions (MRR, ARR, gross/net, ARPU, churn, upgrades, downgrades, refunds) | Done | `docs/platform-revenue-telemetry-contract.md` |
| Source/provider labels | Done | `relay_native`, `patreon_upstream`, `external_estimate` — never mixed on cards |
| TypeScript contract + validation | Done | `src/platform-metrics/revenue-telemetry-contract.ts` |
| Prisma storage | Done | `PlatformRevenueEvent`, migration `20260525190000_platform_revenue_events` |
| Registry seed updates | Done | `revenue.upgrades`, `revenue.downgrades`, `revenue.refunds`; sources point to PMD-060 |
| Tests | Done | `tests/revenue-telemetry-contract.test.ts` |

**PMD-060 exit:** Revenue terms and source labels approved; storage schema ready; dashboard cards remain `deferred` until PMD-061 instrumentation.

**Next:** PMD-061 checkout/subscription instrumentation, or PMD-013 metric detail drawer.

## Checkout and Subscription Instrumentation (PMD-061)

| Item | Status | Location |
|------|--------|----------|
| Revenue event writer | Done | `src/platform-metrics/platform-revenue-telemetry-service.ts` |
| Checkout lifecycle hooks | Done | `PaymentService.checkout()` → started/completed/failed + subscription_created for recurring tiers |
| Registry wiring | Done | `wire-existing-sources.ts` reads `platform_revenue_events` (Relay-native only) |
| Subscription change API | Done | `recordSubscriptionRevenueTelemetry()` for upgrade/downgrade/cancel/refund (webhook-ready) |
| Tests | Done | `tests/platform-revenue-telemetry-service.test.ts`, `tests/payment-revenue-telemetry.test.ts` |

**PMD-061 exit:** Checkout events persist with provider, amount, currency, status, and `relay_native` source label; revenue cards move to `collecting` when events exist. Patreon-upstream revenue remains on separate future keys.

**Next:** PMD-062 revenue rollups when scheduled.

## Metric Detail Drawer (PMD-013)

| Item | Status | Location |
|------|--------|----------|
| Detail context helpers | Done | `web/lib/platform-metric-detail.ts` |
| Drawer UI | Done | `web/components/platform-metrics/PlatformMetricDetailDrawer.tsx` |
| Clickable metric cards | Done | `web/components/platform-metrics/PlatformMetricCard.tsx` |
| Dashboard selection + hash deep links | Done | `web/app/platform-metrics/PlatformMetricsDashboard.tsx` |
| Tests | Done | `web/lib/platform-metric-detail.test.ts` |

**PMD-013 exit:** Operators click a metric card (or follow `#metric-{key}` from alerts) and see definition, formula, source, status, phase, owner notes, wiring dependency, related alerts, Airtable work item IDs, and repo source doc paths.

**Next:** PMD-062 revenue rollups when scheduled.

## Revenue Rollups and Source-State Cleanup (PMD-062)

| Item | Status | Location |
|------|--------|----------|
| Known empty-source status cleanup | Done | `wire-existing-sources.ts` |
| Revenue daily rollup metrics | Done | `platform-metric-daily-rollup-job.ts` |
| Registry wiring from revenue rollups | Done | `wire-existing-sources.ts` |
| Revenue gross trend eligibility | Done | `platform-metric-trend-types.ts` |
| Build guard Suspense boundary | Done | `web/app/platform-metrics/page.tsx` |
| Tests | Done | `tests/platform-metric-daily-rollup-job.test.ts`, registry/trend/alert tests |

**PMD-062 exit:** Revenue gross/net, checkout lifecycle counts, upgrade/downgrade counts, and refund value are written as UTC-day system rollups and override raw-event registry values as `live` when rollups exist. MRR, ARR, ARPU, and churn remain non-live until a subscription state snapshot exists.

**Next:** add subscription state snapshots for MRR/ARR/churn, then finish page/session instrumentation gaps.
