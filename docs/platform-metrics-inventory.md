# Platform Metrics Inventory

Canonical registry of operator-dashboard metrics. Every row is a planned card. Initial dashboard state is `NaN` / `No data yet` until the linked work item wires the source.

**Parent contract:** [`platform-metrics-dashboard-build-plan.md`](platform-metrics-dashboard-build-plan.md)

**Status legend:** `not_wired` | `pending_instrumentation` | `collecting` | `live` | `estimated` | `manual_import` | `deferred`

**Machine-readable seed (PMD-002):** [`src/platform-metrics/registry-seed.json`](../src/platform-metrics/registry-seed.json) — canonical backend inventory with `key`, `section`, `scope`, `formula`, `source`, `initialStatus`, `phase`, and `priority`. Validated by `tests/metric-inventory-seed.test.ts`.

**Scope legend:** `platform` | `creator` | `patron` | `post` | `session` | `system`

---

## Data Coverage (P0)

| Key | Label | Definition | Formula | Source | Initial status | Phase |
|-----|-------|------------|---------|--------|----------------|-------|
| `coverage.total_metrics` | Total metrics | Count of registered dashboard metrics | `COUNT(registry)` | Metric registry | `not_wired` | 2 |
| `coverage.live_metrics` | Metrics live | Metrics with status `live` | `COUNT WHERE status=live` | Metric registry | `not_wired` | 2 |
| `coverage.collecting_metrics` | Metrics collecting | Metrics with status `collecting` | `COUNT WHERE status=collecting` | Metric registry | `not_wired` | 2 |
| `coverage.not_wired_metrics` | Metrics not wired | Metrics still `not_wired` or `pending_instrumentation` | `COUNT WHERE status IN (...)` | Metric registry | `not_wired` | 2 |
| `coverage.stale_metrics` | Stale metrics | Metrics past freshness threshold | `COUNT WHERE freshness=stale` | Rollup freshness | `not_wired` | 5 |
| `coverage.manual_import_metrics` | Manual import metrics | Metrics depending on CSV/manual upload | `COUNT WHERE status=manual_import` | Metric registry | `not_wired` | 2 |
| `coverage.last_rollup_at` | Last rollup | Most recent successful daily rollup | `MAX(generated_at)` | Rollup job | `not_wired` | 5 |
| `coverage.last_ingest_at` | Last telemetry ingest | Most recent first-party event received | `MAX(occurred_at)` | Event store | `not_wired` | 4 |

---

## Traffic (P0)

| Key | Label | Definition | Formula | Source | Initial status | Phase |
|-----|-------|------------|---------|--------|----------------|-------|
| `traffic.page_views` | Page views | Total page view events in window | `COUNT(page_view)` | First-party events | `not_wired` | 4–5 |
| `traffic.unique_visitors` | Unique visitors | Distinct session or visitor keys in window | `COUNT(DISTINCT session_key)` | First-party events | `not_wired` | 4–5 |
| `traffic.profile_views` | Profile views | Public profile page views | `COUNT(profile_view)` | `relay_engagement_events` / events | `not_wired` | 3–4 |
| `traffic.gallery_views` | Gallery views | Public gallery page views | `COUNT(gallery_view)` | `relay_engagement_events` / events | `not_wired` | 3–4 |
| `traffic.referral_breakdown` | Referral breakdown | Visits grouped by referrer/source | `GROUP BY referrer` | First-party events | `deferred` | 5+ |
| `traffic.anonymous_vs_auth` | Anonymous vs signed-in | Split of traffic by auth state | `GROUP BY auth_state` | First-party events | `deferred` | 5+ |

---

## Activity (P0)

| Key | Label | Definition | Formula | Source | Initial status | Phase |
|-----|-------|------------|---------|--------|----------------|-------|
| `activity.dau` | DAU | Unique active users/sessions in UTC day | `COUNT(DISTINCT actor) per day` | Daily rollup | `not_wired` | 5 |
| `activity.wau` | WAU | Unique active users/sessions in 7-day window | Rolling 7d distinct | Daily rollup | `not_wired` | 5 |
| `activity.mau` | MAU | Unique active users/sessions in 30-day window | Rolling 30d distinct | Daily rollup | `not_wired` | 5 |
| `activity.active_creators` | Active creators | Creators with qualifying activity in window | `COUNT(DISTINCT creator_id)` | Events + domain tables | `not_wired` | 5 |
| `activity.active_patrons` | Active patrons | Patrons with qualifying activity in window | `COUNT(DISTINCT patron_id)` | Events + domain tables | `not_wired` | 5 |
| `activity.feed_opens` | Feed opens | Patron feed surface opens | `COUNT(feed_open)` | First-party events | `not_wired` | 4 |
| `activity.post_views` | Post views | Post detail or card views | `COUNT(post_view)` | First-party events | `not_wired` | 4 |
| `activity.session_starts` | Session starts | New session start events | `COUNT(session_start)` | First-party events | `not_wired` | 4 |
| `activity.active_sessions_estimated` | Active sessions (est.) | Recent sessions from DB — proxy only | `COUNT(sessions WHERE last_used_at in window)` | `sessions` | `estimated` | 3 |

---

## Growth (P0 / P1)

| Key | Label | Definition | Formula | Source | Initial status | Phase |
|-----|-------|------------|---------|--------|----------------|-------|
| `growth.new_accounts` | New accounts | Accounts created in window | `COUNT(accounts WHERE created_at in window)` | `accounts` | `not_wired` | 3 |
| `growth.new_creators` | New creators | Creator tenants onboarded in window | `COUNT(creator_profiles)` | Domain tables | `not_wired` | 3 |
| `growth.new_patrons` | New patrons | Patron memberships created in window | `COUNT(tenant_memberships WHERE role=patron)` | Domain tables | `not_wired` | 3 |
| `growth.patreon_creator_connections` | Patreon creator links | Creators with healthy creator OAuth | `COUNT(oauth_credentials creator)` | OAuth tables | `not_wired` | 3 |
| `growth.patreon_patron_links` | Patreon patron links | Patrons with patron OAuth linked | `COUNT(patron oauth)` | OAuth tables | `not_wired` | 3 |
| `growth.new_follows` | New follows | Follow relationships created in window | `COUNT(patron_follows WHERE created_at in window)` | `patron_follows` | `not_wired` | 3 |
| `growth.activation_rate` | Activation rate | % new creators reaching publish/import milestone | `activated / onboarded` | Onboarding + posts | `deferred` | 5+ |
| `growth.repeat_visitor_rate` | Repeat visitor rate | % visitors with 2+ sessions in window | `repeat / unique` | Rollups | `deferred` | 5+ |

---

## Revenue (P0 placeholders — deferred until checkout live; definitions approved PMD-060)

| Key | Label | Definition | Formula | Source | Initial status | Phase |
|-----|-------|------------|---------|--------|----------------|-------|
| `revenue.gross` | Gross revenue | Relay-native gross before fees/refunds | `SUM(amount_cents)` on completed events minus refunds | `platform_revenue_events` | `deferred` | 6 |
| `revenue.net` | Net revenue | Relay-native net after fees/refunds | gross − fees − refunds | `platform_revenue_events` | `deferred` | 6 |
| `revenue.mrr` | MRR | Monthly recurring revenue (Relay-native) | Monthly-normalized active subscription sum | Subscription events | `deferred` | 6 |
| `revenue.arr` | ARR | MRR × 12 | `mrr * 12` | Derived | `deferred` | 6 |
| `revenue.arpu` | ARPU | Net revenue per paying user | `net / paying_users` | Derived | `deferred` | 6 |
| `revenue.checkout_started` | Checkout starts | Checkout sessions initiated | `COUNT(checkout_started)` | Revenue events | `deferred` | 6 |
| `revenue.checkout_completed` | Checkout completions | Successful checkouts | `COUNT(checkout_completed)` | Revenue events | `deferred` | 6 |
| `revenue.churn_rate` | Churn rate | Canceled subs / active subs in period | `cancels / active_start` | Subscription events | `deferred` | 6 |
| `revenue.upgrades` | Upgrades | Plan upgrades in period | `COUNT(subscription_upgraded)` | Revenue events | `deferred` | 6 |
| `revenue.downgrades` | Downgrades | Plan downgrades in period | `COUNT(subscription_downgraded)` | Revenue events | `deferred` | 6 |
| `revenue.refunds` | Refunds | Refund value in period | `SUM(refund_issued)` | Revenue events | `deferred` | 6 |

Contract: [`platform-revenue-telemetry-contract.md`](platform-revenue-telemetry-contract.md)

---

## Creator Health (P1)

| Key | Label | Definition | Formula | Source | Initial status | Phase |
|-----|-------|------------|---------|--------|----------------|-------|
| `creator_health.onboarded` | Creators onboarded | Creators past connect step | `COUNT(onboarding_states)` | `creator_onboarding_states` | `not_wired` | 3–4 |
| `creator_health.patreon_connected` | Patreon connected | Creators with ingest OAuth healthy | Health + OAuth | OAuth tables | `not_wired` | 3 |
| `creator_health.imports_completed` | Imports completed | Completed Patreon import runs | Domain/import jobs | Ingest tables | `not_wired` | 4 |
| `creator_health.posts_published` | Relay posts published | Relay-native posts published | `COUNT(posts WHERE source=RELAY)` | `posts` | `not_wired` | 4 |
| `creator_health.analytics_views` | Analytics page views | Creator studio analytics page loads | `COUNT(analytics_viewed)` | Events | `not_wired` | 4 |
| `creator_health.action_center_cards` | Action Center cards | Recommendation cards shown | `COUNT(recommendation_records)` | Action Center | `not_wired` | 3 |

---

## Patron Health (P1)

| Key | Label | Definition | Formula | Source | Initial status | Phase |
|-----|-------|------------|---------|--------|----------------|-------|
| `patron_health.patreon_linked` | Patrons linked | Patrons with Patreon OAuth | OAuth tables | Patron OAuth | `not_wired` | 3 |
| `patron_health.active_entitlements` | Active entitlements | Snapshots with `active=true` | `COUNT WHERE active` | `patron_entitlement_snapshots` | `not_wired` | 3 |
| `patron_health.stale_entitlements` | Stale entitlements | Snapshots past `stale_after` | `COUNT WHERE stale_after < now()` | `patron_entitlement_snapshots` | `not_wired` | 3 |
| `patron_health.total_follows` | Total follows | All patron follow rows | `COUNT(patron_follows)` | `patron_follows` | `not_wired` | 3 |
| `patron_health.favorites` | Favorites | Patron favorites created | `COUNT(patron_favorites)` | `patron_favorites` | `not_wired` | 4 |
| `patron_health.comments` | Comments | Relay comments created | `COUNT(relay_comments)` | `relay_comments` | `not_wired` | 4 |

---

## Content Performance (P1)

| Key | Label | Definition | Formula | Source | Initial status | Phase |
|-----|-------|------------|---------|--------|----------------|-------|
| `content.post_views` | Post views | Views per post (platform aggregate) | `COUNT(post_view) GROUP BY post` | Events | `not_wired` | 4–5 |
| `content.post_reveals` | Reveal interactions | Tier reveal interactions | `COUNT(reveal_interaction)` | `relay_engagement_events` | `not_wired` | 4 |
| `content.patreon_impressions` | Patreon impressions | Post impressions from Insights CSV | CSV column | `patreon_insights_post_metrics` | `manual_import` | 3 |
| `content.patreon_seen` | Patreon seen | Post seen from Insights CSV | CSV column | `patreon_insights_post_metrics` | `manual_import` | 3 |
| `content.linkage_gaps` | CSV linkage gaps | Insights rows without Relay post match | `COUNT WHERE post_id IS NULL` | Insights join | `manual_import` | 3 |

---

## Platform Ops (P0)

| Key | Label | Definition | Formula | Source | Initial status | Phase |
|-----|-------|------------|---------|--------|----------------|-------|
| `ops.db_connectivity` | DB connectivity | Prisma can query Postgres | Health check pass/fail | `/api/v1/health/platform` | `not_wired` | 3 |
| `ops.db_connection_pressure` | DB connection pressure | Active connections / max_connections | Ratio from `pg_stat_activity` | Platform health | `not_wired` | 3 |
| `ops.oauth_unhealthy` | Unhealthy OAuth | Creator + patron credentials not healthy | `COUNT WHERE health != healthy` | OAuth tables | `not_wired` | 3 |
| `ops.stale_entitlements` | Stale entitlements (ops) | Patron snapshots past stale_after | Same as patron_health stale | Platform health | `not_wired` | 3 |
| `ops.analytics_job_health` | Analytics job health | Insight generate success ratio | success / attempts | `/api/v1/health/analytics` | `not_wired` | 3 |
| `ops.ingest_health` | Ingest health | Ingest pipeline + DLQ status | Health envelope | `/api/v1/health/ingest` | `not_wired` | 3 |
| `ops.export_health` | Export health | Export retrieval metrics | Health envelope | `/api/v1/health/export` | `not_wired` | 3 |
| `ops.job_queue_health` | Job queue health | BullMQ queue status | Health envelope | `/api/v1/health/jobs` | `not_wired` | 3 |
| `ops.export_content_bytes` | Export content bytes | Full media bytes served | `SUM(usage_events WHERE metric=export.media.content.bytes)` | `usage_events` | `collecting` | 3 |
| `ops.export_thumb_bytes` | Export thumb bytes | Thumbnail bytes served | `SUM(usage_events WHERE metric=export.media.thumb.bytes)` | `usage_events` | `collecting` | 3 |
| `ops.library_zip_downloads` | Library ZIP downloads | Completed library ZIP exports | `SUM WHERE metric=export.library_zip.completed` | `usage_events` | `not_wired` | 3 |
| `ops.api_rate_limited` | API rate limits | 429 rate-limit events | `COUNT WHERE metric=api.rate_limited` | `usage_events` | `not_wired` | 3 |
| `ops.supabase_sync_errors` | Supabase sync errors | Auth sync failures since boot | Counter | Platform health | `not_wired` | 3 |

---

## Summary counts

| Priority | Metric count | Notes |
|----------|--------------|-------|
| P0 | 47 | Must appear on operator dashboard (many start as NaN/deferred) |
| P1 | 17 | High value; wire after P0 spine |
| Deferred by design | 8 | Visible on dashboard with `deferred` status |

All P0 keys above have definition, formula, source, initial status, and target phase. **PMD-000 satisfied.**

**PMD-002 exit:** Machine seed at `src/platform-metrics/registry-seed.json` includes scope and passes `validateMetricInventorySeed()`.
