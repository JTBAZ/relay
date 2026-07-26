# Unified Read Model V2

> **Phase 3** of Cross-Platform Performance Intelligence (extended **Phase 10a** for studio packaging).  
> **Vocabulary:** [PERFORMANCE_INTELLIGENCE_VOCABULARY.md](./PERFORMANCE_INTELLIGENCE_VOCABULARY.md)  
> **Studio packaging APIs:** [STUDIO_PACKAGING_DATA.md](./STUDIO_PACKAGING_DATA.md)

## Purpose

Expose scoped analytics read endpoints so the Insights Hub hierarchy can answer:

- How did **everything** perform? (creator overview)
- How did **this campaign / tag** perform?
- How did **this Work/Bundle** perform across variants and platforms?
- How did **this Relay Post** perform on each destination?
- How did **this Platform Instance** (one URL) perform?

All endpoints read from `ExternalPostMetricDaily` (Slice 2d fact table). Work/Bundle and Platform Instance metadata come from Phase 1–2 tables.

## Module

[`src/analytics/performance-intelligence-read.ts`](../../src/analytics/performance-intelligence-read.ts)

Shared rollup loading: [`loadCreatorRollupRows`](../../src/analytics/creator-unified-performance.ts) in `creator-unified-performance.ts`.

## Endpoints

| Method | Path | Scope |
|--------|------|-------|
| GET | `/api/v1/creator/analytics/performance/overview` | Creator-wide + hierarchy counts + posting goal + V1 performance payload |
| GET | `/api/v1/creator/analytics/performance/campaigns` | Rollups grouped by `CreativeWork.analyticsCampaignLabel` |
| GET | `/api/v1/creator/analytics/performance/tags` | Rollups grouped by work tags (`?tag=` optional filter) |
| GET | `/api/v1/creator/analytics/performance/works` | Ranked Work/Bundle list with totals |
| GET | `/api/v1/creator/analytics/performance/works/:creative_work_id` | Work/Bundle drilldown (variants + instances + daily series) |
| GET | `/api/v1/creator/analytics/performance/works/:creative_work_id/instances` | Work/Bundle platform instances grouped by post + refresh eligibility |
| GET | `/api/v1/creator/analytics/performance/posts/:post_id` | Relay Post variant drilldown |
| GET | `/api/v1/creator/analytics/performance/platform-instances/:platform_instance_id` | Single Platform Instance detail |

### Common query params

| Param | Values | Default |
|-------|--------|---------|
| `range` | `7d`, `30d`, `90d` | `30d` |
| `destination` | platform slug | overview only |
| `tag` | string | tags endpoint filter |
| `limit` | 1–200 | works list (default 50) |
| `group_by` | `variant_role` | work drilldown — adds `role_breakdown` |

## Response enrichments (V2)

Compared to Slice 2d `unified-performance`:

| Field | Meaning |
|-------|---------|
| `freshness.rollup_computed_at` | Latest rollup timestamp in window |
| `freshness.stale` | `true` when older than 48h |
| `source_summary[]` | Per-destination latest `source` + derived `confidence` |
| `hierarchy` | Counts of works, posts, active platform instances (overview) |
| `posting_goal` | Monthly Relay posting goal status (overview) |
| `variants[]` | Work drilldown: per-post totals + platform instances |
| `platform_instances[]` | Post / work drilldown instance metadata |
| `role_breakdown` | Optional work drilldown grouping by `CreativeWorkVariantRole` (`?group_by=variant_role`) |
| `crosspost_gaps` | Work drilldown + instances list: missing platform coverage for blank-card UI |

### Cross-post gaps (`crosspost_gaps`)

Module: [`work-crosspost-gaps.ts`](../../src/analytics/work-crosspost-gaps.ts)

| Field | Meaning |
|-------|---------|
| `present_destinations[]` | Distribution destinations with at least one linked platform instance on any work member |
| `missing_destinations[]` | `patreon` / `x` / `deviantart` / `bluesky` with no linked instance — render blank radial cards |
| `missing_teaser_destinations[]` | When the work has `teaser`/`promo`/`repost` members: destinations without a promo-role instance |
| `suggested_source_post_id` | Preferred `post_id` for scheduling a cross-post (first `full`/`standalone` member) |

Studio blank cards: map `missing_destinations` to ghost platform tiles; CTA → `POST /api/v1/relay/posts/:post_id/distribution-plan` using `suggested_source_post_id`.

### Variant role breakdown (`role_breakdown`)

**Query:** `GET .../performance/works/:creative_work_id?group_by=variant_role&range=30d`

Omitted unless `group_by=variant_role`. Keys are subset of `CreativeWorkVariantRole` (`full`, `teaser`, `promo`, `repost`, `standalone`).

Each role entry:

| Field | Meaning |
|-------|---------|
| `member_count` | Posts in the work with this role |
| `post_ids[]` | Member post ids |
| `total_reach` | Sum of reach metrics for those posts in range |
| `totals` / `by_destination` | Aggregated metric totals |

Use with top-level `totals` for merged Relay View vs ads/teasers split. See [STUDIO_PACKAGING_DATA.md](./STUDIO_PACKAGING_DATA.md).

### Work instances list response

`GET .../performance/works/:creative_work_id/instances` returns:

| Field | Meaning |
|-------|---------|
| `posts[]` | One row per bundle member (`post_id`, `title`, `variant_role`, `platform_instances[]`) |
| `platform_instances[]` | Instance metadata + `refresh_eligible`, `recommended_method`, cooldown fields |
| `crosspost_gaps` | Same gap object as work drilldown |

Client: `fetchPerformanceWorkInstances(creativeWorkId)`.

### Gallery preload (creator library)

`GET /api/v1/gallery/items?include_instances=true` — not a V2 performance route but complements unfold UX. See [STUDIO_PACKAGING_DATA.md](./STUDIO_PACKAGING_DATA.md#3-gallery-instance-preload).

### Confidence derivation

| Source | Fresh (≤48h) | Stale |
|--------|--------------|-------|
| `platform_api`, `extension_dom` | `high` | `medium` |
| `third_party`, `manual` | `medium` | `medium` |
| `public_scrape` | `medium` | `low` |
| missing | `unknown` | `unknown` |

## Legacy endpoint

`GET /api/v1/creator/analytics/unified-performance` remains unchanged for backward compatibility. New UI should prefer `/performance/overview` or scoped drilldown routes.

## Constraints

- Metrics grain stays `postId + destination` in rollups; Work/Bundle totals aggregate member post rows at read time.
- CSV fallback applies only to creator-wide unified read (via overview’s embedded `performance` object), not scoped drilldowns.
- Posting **goal** in overview uses existing `CreatorPostingGoal` (monthly cadence), not per-work analytics goals (Phase 8).

## Next phases

| Phase | Work |
|-------|------|
| 4 | ~~Manual refresh~~ — see [SAFE_REFRESH.md](./SAFE_REFRESH.md) |
| 6 | Insights Hub hierarchy wired to these routes |
| 7 | Dedicated Work/Bundle drilldown page |
| 10a | ~~Studio packaging data layer~~ — see [STUDIO_PACKAGING_DATA.md](./STUDIO_PACKAGING_DATA.md) |
