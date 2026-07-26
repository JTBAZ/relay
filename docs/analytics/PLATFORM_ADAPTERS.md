# Platform Adapters — Identity & Linking

> **Phase 9** of Cross-Platform Performance Intelligence.  
> **Vocabulary:** [PERFORMANCE_INTELLIGENCE_VOCABULARY.md](./PERFORMANCE_INTELLIGENCE_VOCABULARY.md)

## Purpose

Expand platform support **identity-first**: reliable linked instances and normalized URLs before aggressive metric scraping.

v1 scope:

| Destination | Linking | Metrics refresh |
|-------------|---------|-----------------|
| Patreon | ✅ URL confirm + autopost | Extension DOM + API + CSV overlay |
| X / Twitter | ✅ URL confirm + autopost | Extension DOM handoff |
| DeviantArt | ✅ URL confirm + autopost | Extension DOM handoff |
| Instagram | 🔬 research only | None in v1 |

Metrics grain stays **`postId + destination`**. No analytics model redesign.

## Adapter catalog API

| Method | Path |
|--------|------|
| GET | `/api/v1/creator/analytics/platform-adapters` |

Returns `adapters[]` with `linking`, `metrics_refresh`, `identity_from_url`, and notes per destination.

Module: [`platform-identity-adapters.ts`](../../src/analytics/platform-identity-adapters.ts)

## Manual instance linking

| Method | Path |
|--------|------|
| POST | `/api/v1/creator/analytics/platform-instances/link` |

### Request body

```json
{
  "post_id": "post_abc",
  "destination": "x",
  "external_url": "https://x.com/handle/status/1234567890",
  "attempt_id": "optional_attempt_id"
}
```

### Behavior

1. Validates tenant + post ownership
2. Parses URL against destination-specific published-post patterns (ported from extension [`post-link-patterns.ts`](../../extension/src/lib/post-link-patterns.ts))
3. If a distribution attempt exists (explicit `attempt_id` or latest for variant), updates attempt + upserts `pi_attempt_{attemptId}`
4. Otherwise upserts manual instance `pi_manual_{postId}_{destination}` with `link_source = manual_url_confirm`

Module: [`platform-instance-link-service.ts`](../../src/analytics/platform-instance-link-service.ts)

## Autopost identity normalization

When distribution completes as `posted`, [`completeDistributionAttempt`](../../src/distribution/post-distribution-service.ts) calls `normalizeCompleteDistributionIdentity()` to canonicalize URLs and extract platform IDs before persisting.

## Extension handoff destinations

Manual refresh returns `handoff_required` for linked instances on:

- `patreon`
- `x`
- `deviantart`

See [SAFE_REFRESH.md](./SAFE_REFRESH.md).

## Instagram (research only)

Catalog entry marks `linking: research_only`. Link API returns `UNSUPPORTED_DESTINATION` (422). No refresh or URL parsing in v1 — Graph API / Business login evaluation only.

## Related docs

- [PLATFORM_INSTANCE_SCHEMA.md](./PLATFORM_INSTANCE_SCHEMA.md) — instance model + `manual_url_confirm`
- [SAFE_REFRESH.md](./SAFE_REFRESH.md) — cooldowns and extension handoff
- [WORK_DRILLDOWN_UI.md](./WORK_DRILLDOWN_UI.md) — future UI surface for paste-URL linking
