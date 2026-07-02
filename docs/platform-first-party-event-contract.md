# Platform First-Party Event Contract (PMD-040)

Approved vocabulary for operator-dashboard telemetry. Parent: [`platform-metrics-dashboard-build-plan.md`](platform-metrics-dashboard-build-plan.md) Phase 4.

**Code source of truth:** [`src/platform-metrics/first-party-event-contract.ts`](../src/platform-metrics/first-party-event-contract.ts)

**Related:** [`builder-boost-pack/contracts/events.md`](../builder-boost-pack/contracts/events.md) (domain events), [`docs/analytics/DATA_FLOWS_REFERENCE.md`](analytics/DATA_FLOWS_REFERENCE.md) (P5a flows)

---

## Purpose

Turn Traffic, Activity, Creator Health, Patron Health, and Content Performance cards from `not_wired` → `collecting` → `live` using stable first-party events.

This contract defines **names, payloads, privacy, dedupe, and source surfaces** before ingestion work (PMD-041+).

---

## Envelope (platform telemetry)

Future `platform_telemetry_events` rows and client beacons use:

```json
{
  "event_id": "evt_cuid",
  "event_name": "page_view",
  "occurred_at": "2026-05-24T19:00:00.000Z",
  "producer": "web|api|worker",
  "version": "1.0",
  "trace_id": "optional",
  "session_key": "opaque_sha256",
  "actor_key": "opaque_account_or_membership_id",
  "payload": {}
}
```

### Privacy rules (all events)

| Rule | Detail |
|------|--------|
| No raw PII | Never `email`, `display_name`, `patreon_user_id`, raw IP, or full user agent in payload |
| Opaque keys | `session_key` and `actor_key` are one-way hashes or internal ids — not cookies/JWTs |
| No secrets | No OAuth tokens, passwords, or query tokens in paths |
| Comment text | Never in telemetry — use `comment_id` only |

### Forbidden fields

`email`, `email_norm`, `password`, `ip_address`, `ip_inet`, `user_agent_raw`, `patreon_user_id`, `display_name`, `full_name`, `phone`, `comment_body`, `body`

---

## Storage targets

| Target | Use |
|--------|-----|
| `relay_engagement_events` | Creator-scoped visitor engagement (existing P5a table) |
| `platform_telemetry_events` | Cross-tenant operator metrics (PMD-041 schema + ingestion API) |
| `domain_table` | Milestone derived from durable domain rows (follows, posts, onboarding) |

---

## Event catalog

| Event | Storage | Status | Dashboard metrics | Source surfaces |
|-------|---------|--------|-------------------|-----------------|
| `page_view` | platform_telemetry_events | planned | traffic.page_views, traffic.unique_visitors | web routes (beacon) |
| `session_start` | platform_telemetry_events | planned | activity.session_starts, DAU/WAU/MAU | auth session issue, first load |
| `profile_view` | relay_engagement_events | **live** | traffic.profile_views | GET /api/v1/gallery/facets?visitor=true |
| `gallery_view` | relay_engagement_events | **live** | traffic.gallery_views | GET /api/v1/gallery/items (no cursor), post-detail visitor |
| `feed_open` | platform_telemetry_events | **live** | activity.feed_opens | /patron/feed mount |
| `post_view` | platform_telemetry_events | **live** | activity.post_views, content.post_views | patron post detail, visitor post-detail API |
| `post_reveal` | relay_engagement_events | partial | content.post_reveals | tier reveal UI |
| `creator_onboarded` | domain_table | planned | creator_health.onboarded | onboarding completion |
| `patreon_connected` | domain_table | **live** | creator_health.patreon_connected | OAuth exchange |
| `import_completed` | domain_table | **live** | creator_health.imports_completed | ingest completion |
| `post_published` | domain_table | **live** | creator_health.posts_published | publish API |
| `follow_created` | domain_table | planned | growth.new_follows | follow API |
| `favorite_created` | domain_table | planned | patron_health.favorites | favorite API |
| `comment_created` | domain_table | planned | patron_health.comments | comment API |
| `analytics_viewed` | platform_telemetry_events | **live** | creator_health.analytics_views | web: /analytics mount |
| `action_center_used` | platform_telemetry_events | **live** | creator_health.action_center_cards | web: /action-center mount + card actions |

Full field-level specs live in `FIRST_PARTY_EVENT_DEFINITIONS` in the TypeScript module.

---

## Dedupe posture summary

| Pattern | When |
|---------|------|
| At-least-once append | Default for engagement and beacons |
| Unique domain row | follows, favorites, comments, publish |
| Session + day bucket | profile_view, gallery_view, page_view rollups |
| One per session_key | session_start |

Recommended rollup dedupe key: `event_name + actor_key|session_key + primary_entity_id + occurred_at (UTC day)`

---

## Mapping to existing `RelayEngagementEvent`

| Contract name | Prisma `RelayEngagementEventType` | Writer |
|---------------|-----------------------------------|--------|
| profile_view | `profile_view` | `enqueueRelayEngagementEvent` |
| gallery_view | `gallery_view` | `enqueueRelayEngagementEvent` |
| post_reveal | `reveal_interaction` | `enqueueRelayEngagementEvent` (partial) |

Gated by `RELAY_DB_STORE_ANALYTICS=1` and Prisma configured.

---

## PMD-040 exit criteria

- [x] Event names documented
- [x] Required and optional fields per event
- [x] Privacy rules and forbidden fields
- [x] Dedupe posture documented
- [x] Source surfaces mapped
- [x] TypeScript contract + validation helper
- [x] Unit tests

**Next:** PMD-042 — instrument public profile/gallery surfaces with client beacons.

---

## Ingestion API (PMD-041)

`POST /api/v1/platform-metrics/events`

Accepts events with storage `platform_telemetry_events` or `relay_engagement_events`. Domain-table milestones (`follow_created`, etc.) must **not** be posted here — they derive from durable rows.

### Request body

```json
{
  "event_name": "page_view",
  "occurred_at": "2026-05-24T19:00:00.000Z",
  "producer": "web",
  "version": "1.0",
  "session_key": "opaque_hash",
  "actor_key": "internal_account_id",
  "payload": {
    "surface": "patron_feed",
    "path": "/patron/feed"
  }
}
```

### Responses

| Status | Code | Meaning |
|--------|------|---------|
| 202 | — | Event accepted and persisted |
| 400 | `VALIDATION_ERROR` | Unknown event, missing fields, or forbidden PII |
| 422 | `EVENT_NOT_ACCEPTED` | Domain-sourced event (use domain API instead) |
| 503 | `STORAGE_UNAVAILABLE` | Prisma not configured or `RELAY_DB_STORE_ANALYTICS` off |

Requires `RELAY_DB_STORE_ANALYTICS=1` and Prisma configured (same gate as P5a engagement writer).

Implementation: `src/platform-metrics/first-party-event-ingestion.ts`
