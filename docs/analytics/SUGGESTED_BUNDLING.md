# Suggested Bundling — Work/Bundle Merge & Split

> **Phase 5** of Cross-Platform Performance Intelligence.  
> **Vocabulary:** [PERFORMANCE_INTELLIGENCE_VOCABULARY.md](./PERFORMANCE_INTELLIGENCE_VOCABULARY.md)

## Purpose

Propose when separate Relay Posts (each in a default 1:1 Work/Bundle) likely represent the same creative work — e.g. Patreon full piece + X teaser — and require **explicit user confirmation** before merging.

Metrics stay on original `postId + destination` rows; Work/Bundle rollups recompute at read time after merge.

## Module

[`src/analytics/creative-work-bundling-service.ts`](../../src/analytics/creative-work-bundling-service.ts)

## Suggestion signals (priority order)

| Signal | Weight | Source |
|--------|--------|--------|
| `distribution_lineage` | 40 | Same `PostDistributionPlan.sourceDraftId` |
| `shared_external_url` | 35 | Matching `PlatformInstance.externalUrl` or `externalId` |
| `title_similarity` | up to 20 | Token overlap on latest `PostVersion.title` |
| `shared_media` | 15 | Shared `mediaIds` on latest version |
| `publish_proximity` | up to 10 | Published within 7 days (10 if ≤3 days) |

Minimum score to surface: **35**. Only **default 1:1 bundles** are suggested as merge sources.

## API

| Method | Path | Action |
|--------|------|--------|
| GET | `/api/v1/creator/analytics/creative-works/bundle-suggestions?limit=` | List ranked suggestions |
| POST | `/api/v1/creator/analytics/creative-works/bundle-suggestions/dismiss` | Dismiss `{ source_post_id, target_creative_work_id }` |
| POST | `/api/v1/creator/analytics/creative-works/bundle-suggestions/confirm` | Merge `{ source_post_id, target_creative_work_id, variant_role? }` |
| POST | `/api/v1/creator/analytics/creative-works/members/:post_id/split` | Split post back to its own default bundle |

### Suggestion payload

```json
{
  "suggestion_id": "cws_post_a_cw_default_post_b",
  "source_post_id": "post_a",
  "target_creative_work_id": "cw_default_post_b",
  "score": 75,
  "confidence": "high",
  "signals": [{ "code": "distribution_lineage", "label": "...", "weight": 40 }],
  "suggested_variant_role": "teaser"
}
```

## Merge behavior

1. Moves `CreativeWorkMember` from source default bundle → target work
2. Sets target `isDefaultBundle = false`
3. Deletes empty source `CreativeWork` when last member moved
4. Never auto-merges — requires `confirm` endpoint

## Split behavior

1. Removes post from shared bundle
2. Creates/restores default 1:1 bundle via `ensureDefaultCreativeWorkForPost`
3. If previous bundle has one member left, marks it `isDefaultBundle = true`
4. Metrics on platform instances unchanged

## Dismissals

Table `creative_work_bundle_suggestion_dismissals` stores `(creator_id, source_post_id, target_creative_work_id)` so dismissed pairs are not re-suggested.

## Non-goals (v1)

- Silent auto-merge
- Perceptual media hash (uses shared `mediaIds` when present)
- Changing patron-facing Patreon visibility

## Next phases

| Phase | Work |
|-------|------|
| 6–7 | Insights Hub UI for suggestion cards + confirm/dismiss |
| 8 | Action cards referencing bundled performance |
