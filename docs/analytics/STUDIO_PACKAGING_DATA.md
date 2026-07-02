# Studio Packaging — Data Layer (Phase 10a)

> **Phase 10a** of Cross-Platform Performance Intelligence — API surface for the studio hero-unfold / post packaging UX.  
> **Vocabulary:** [PERFORMANCE_INTELLIGENCE_VOCABULARY.md](./PERFORMANCE_INTELLIGENCE_VOCABULARY.md)  
> **V2 reads:** [UNIFIED_READ_V2.md](./UNIFIED_READ_V2.md)

## Purpose

Support the studio redesign where a creator selects a packaged work, sees radial platform cards (Patreon, X, DA, …), merges stats by role (canonical vs teaser/promo), and gets blank cards + CTAs for missing cross-posts.

Phase 10a is **data-only** — no hero-unfold UI in this repo yet (deferred to v0 prompt / Phase 10b).

## API map for studio unfold

| UX need | API | Client helper |
|---------|-----|---------------|
| Grid preload for selected post | `GET /api/v1/gallery/items?include_instances=true` | `fetchCreatorGalleryItems({ include_instances: true })` |
| Work metrics + variants | `GET .../performance/works/:id` | `fetchPerformanceWorkBundle(id, { range })` |
| Merged vs teaser/ad stats | `GET .../performance/works/:id?group_by=variant_role` | `fetchPerformanceWorkBundle(id, { group_by: "variant_role" })` |
| Per-platform cards + refresh | `GET .../performance/works/:id/instances` | `fetchPerformanceWorkInstances(id)` |
| Blank cards / cross-post gaps | `crosspost_gaps` on work bundle + instances | Same responses |
| Schedule cross-post | `POST /api/v1/relay/posts/:post_id/distribution-plan` | Existing relay API |

## 1. Variant role breakdown

**Query:** `?group_by=variant_role` on work drilldown (works with `?range=30d`).

**Response field:** `role_breakdown` — partial record keyed by `CreativeWorkVariantRole`:

| Role | Typical content |
|------|-----------------|
| `full` | Primary complete work (Patreon gallery post) |
| `teaser` | Short promo clip / crop |
| `promo` | Ad / announcement material |
| `repost` | Re-share of prior work |
| `standalone` | Default 1:1 bundle member |

Each entry includes `member_count`, `post_ids`, `total_reach`, `totals`, `by_destination`.

**Relay View UI mapping:**

| Panel | Sum from |
|-------|----------|
| All platforms (merged) | Top-level `totals` / `by_destination` |
| Ads + teasers | `role_breakdown.teaser` + `role_breakdown.promo` (+ optional `repost`) |
| Canonical content | `role_breakdown.full` (+ optional `standalone`) |

Module: [`buildVariantRoleBreakdown`](../../src/analytics/performance-intelligence-read.ts)

## 2. Work instances list

**Path:** `GET /api/v1/creator/analytics/performance/works/:creative_work_id/instances`

Returns `posts[]` grouped by bundle member, each with `platform_instances[]` including refresh eligibility:

| Field | Meaning |
|-------|---------|
| `refresh_eligible` | `can_refresh_manually && !cooldown_active` |
| `recommended_method` | `extension_handoff`, `relay_rollup`, etc. |
| `variant_role` | Member role for packaging context |

Also includes `crosspost_gaps` (same shape as work drilldown).

## 3. Gallery instance preload

**Query:** `include_instances=true` on `GET /api/v1/gallery/items` (creator library only; ignored for `visitor=true`).

Appends to each gallery row:

```typescript
platform_instances?: Array<{
  platform_instance_id: string;
  destination: string;
  external_url: string | null;
  status: string;
  last_refreshed_at: string | null;
  variant_role: string;
  refresh_eligible: boolean;
}>;
```

Empty array when flag is set but post has no linked instances.

Module: [`platform-instance-enrichment.ts`](../../src/gallery/platform-instance-enrichment.ts)

## 4. Cross-post gaps

**Field:** `crosspost_gaps` on work drilldown and instances list.

Module: [`work-crosspost-gaps.ts`](../../src/analytics/work-crosspost-gaps.ts)

| Field | Blank-card use |
|-------|----------------|
| `missing_destinations[]` | Ghost platform tile — "Not on X yet" |
| `missing_teaser_destinations[]` | Teaser-specific gap when work has promo members |
| `suggested_source_post_id` | `post_id` for distribution-plan CTA |
| `present_destinations[]` | Filled radial cards |

**Detection:** Compare linked platform instances (`status !== unlinked`, external URL present) against `DISTRIBUTION_DESTINATIONS` (`patreon`, `x`, `deviantart`, `bluesky`).

**Cross-post action:**

```http
POST /api/v1/relay/posts/{suggested_source_post_id}/distribution-plan
```

Body includes target `destination` from the blank card.

## Client types (`web/lib/relay-api.ts`)

| Type | Role |
|------|------|
| `PerformanceVariantRoleBreakdownWire` | Role-grouped metrics |
| `PerformanceWorkCrosspostGapsWire` | Gap detection |
| `PerformanceWorkInstancesData` | Instances list response |
| `GalleryPlatformInstanceSummaryWire` | Gallery row enrichment |

## Tests

| File | Coverage |
|------|----------|
| `tests/performance-intelligence-read.test.ts` | `role_breakdown`, `crosspost_gaps`, instances list |
| `tests/work-crosspost-gaps.test.ts` | Gap logic unit tests |
| `tests/gallery-platform-instance-enrichment.test.ts` | Gallery batch loader |
| `tests/creator-analytics-api-bundle.test.ts` | Auth + 503 for instances route |

## Related docs

- [WORK_DRILLDOWN_UI.md](./WORK_DRILLDOWN_UI.md) — existing drilldown page
- [PLATFORM_ADAPTERS.md](./PLATFORM_ADAPTERS.md) — identity linking
- [SAFE_REFRESH.md](./SAFE_REFRESH.md) — per-instance refresh handoff

## Next (Phase 10b)

- ~~v0 prompt for hero unfold, radial layout, vertical action bar, merged Relay View~~ — see [STUDIO_HERO_UNFOLD_V0_PROMPT.md](./STUDIO_HERO_UNFOLD_V0_PROMPT.md)
- One-click cross-post from blank cards (distribution-plan UX)
- Platform-specific QoL (retweet link, etc.) — deferred per user request
