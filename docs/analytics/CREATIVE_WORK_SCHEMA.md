# Creative Work (Work/Bundle) — Schema & Backfill

> **Phase 1** of Cross-Platform Performance Intelligence.  
> **Vocabulary:** [PERFORMANCE_INTELLIGENCE_VOCABULARY.md](./PERFORMANCE_INTELLIGENCE_VOCABULARY.md)

## Purpose

Introduce **Work/Bundle** as the durable analytics object above `Post`. A single creative work can contain multiple Relay Posts (full piece, teaser, promo, repost) without changing patron-facing Patreon visibility.

## Prisma models

| Model | Table | Role |
|-------|-------|------|
| `CreativeWork` | `creative_works` | Work/Bundle header (title, tags, analytics campaign label) |
| `CreativeWorkMember` | `creative_work_members` | Links `Post` → `CreativeWork` with `CreativeWorkVariantRole` |

### `CreativeWorkVariantRole`

| Value | Meaning |
|-------|---------|
| `full` | Primary complete work |
| `teaser` | Preview / traffic driver |
| `promo` | Marketing repost |
| `repost` | Same work resurfaced |
| `standalone` | Default 1:1 bundle (legacy + new posts until merged) |

### Important distinctions

- **`Campaign`** (existing) = Patreon upstream campaign sync. **Not** analytics campaign.
- **`analyticsCampaignLabel`** on `CreativeWork` = optional user-facing analytics grouping string until a dedicated analytics campaign table exists.
- **`PostDistributionVariant`** = autopost platform payload. **Not** work variant role.

## Default 1:1 backfill

Migration `20260701140000_creative_works`:

1. Creates tables + enum.
2. For every row in `posts`, inserts:
   - `creative_works.id` = `cw_default_{post_id}`
   - `creative_work_members.id` = `cwm_default_{post_id}`
   - `variant_role` = `standalone`
   - `is_default_bundle` = `true`
   - Title from latest `post_versions.title` or `post.id`

Ids are **deterministic** so runtime `ensureDefaultCreativeWorkForPost` is idempotent with migration output.

## Runtime service

[`src/analytics/creative-work-service.ts`](../../src/analytics/creative-work-service.ts):

- `ensureDefaultCreativeWorkForPost(db, { postId, creatorId, title, ... })` — create or return existing membership
- `getCreativeWorkForPost(db, postId)` — read bundle summary for a post

### Hooks

- **Relay-native post create:** `src/relay/create-relay-post.ts` calls `ensureDefaultCreativeWorkForPost` inside the create transaction.
- **Patreon ingest:** covered by migration backfill; new ingest posts can lazy-call `ensureDefaultCreativeWorkForPost` when analytics APIs need membership (Phase 3).

## Constraints (v1)

- Each `Post` belongs to **at most one** `CreativeWork` (`creative_work_members.post_id` unique).
- Multi-post bundles (full + teaser) are created by **moving/adding members** in Phase 5 (suggested bundling); not auto-merged in Phase 1.
- Metrics remain keyed by `postId + destination` in `ExternalPostMetricDaily`; Work/Bundle rollups are a read-layer aggregation (Phase 3).

## Next phases

| Phase | Work |
|-------|------|
| 2 | ~~Platform Instance model~~ — see [PLATFORM_INSTANCE_SCHEMA.md](./PLATFORM_INSTANCE_SCHEMA.md) |
| 3 | ~~V2 read endpoints~~ — see [UNIFIED_READ_V2.md](./UNIFIED_READ_V2.md) |
| 5 | ~~User-confirmed merge/split~~ — see [SUGGESTED_BUNDLING.md](./SUGGESTED_BUNDLING.md) |
