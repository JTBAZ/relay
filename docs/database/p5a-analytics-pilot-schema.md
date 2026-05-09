# P5a pilot analytics — schema design note (P5a-db-001)

This note satisfies **P5a-db-001** before **P5a-db-002** applies DDL. It aligns new models with existing ingest scope in [`prisma/schema.prisma`](../prisma/schema.prisma) (`Post.creatorId`, `Campaign.id` as Patreon campaign id string, `Post.providerPostId` for Patreon posts).

## Tenancy (all new tables)

- **`creator_id`:** Relay ingest creator scope — same string as **`Post.creatorId`** (not `Tenant.id`, not Supabase uid). Every query for dashboard/API is filtered by this first.
- **RLS (later):** If Row Level Security is enabled for pilot Postgres, policies mirror **“session may read rows where `creator_id` ∈ allowed Relay creator ids”** (same mental model as creator-scoped API routes).

## 1. `CreatorMembershipEvent` (name flexible in Prisma)

**Purpose:** Append-only ledger of membership lifecycle events for growth/cohort KPIs.

| Concept | Choice |
|--------|--------|
| **Scope** | `creator_id` required on every row. |
| **Member identity** | Store **Patreon member id** as opaque string from API/webhook (`patreon_member_id` or similar) — no email/name columns in v1 unless product explicitly extends. |
| **Event** | `event_type` enum: `join`, `upgrade`, `downgrade`, `cancel`, … (exact set finalized in P5a-db-002). |
| **Time** | `occurred_at` — wall time of the change as reported by Patreon or derived in sync. |
| **Optional** | `tier_id` (Relay/Patreon tier key string), `amount_cents`, `source` (`sync` \| `webhook` \| `backfill`), `payload` Json for edge cases. |
| **Dedupe** | **Shipped (P5a-db-003):** unique on `(creator_id, patreon_member_id, event_type, occurred_at)`; optional future `dedupe_key` if timestamps collide. |

**Ingest (P5a-ins-002):** Rows are written from **`PatreonSyncService.syncMembers`** when **Prisma** is wired on the sync service. Patreon **`member.id`** is stored as `patreon_member_id`. **Join/rejoin** prefer **`pledge_relationship_start`**; **upgrade/downgrade/cancel** use the sync batch start time for `occurred_at` (see [`src/patreon/membership-ledger-sync.ts`](../../src/patreon/membership-ledger-sync.ts)).

**No substitute for** `AnalyticsSnapshotRow`: snapshots stay **rolled-up Action Center** payloads; this ledger is **event-grained** for analytics APIs.

## 2. `PatreonInsightsImport`

**Purpose:** Idempotent batch header for CSV uploads (Patreon Insights export).

| Concept | Choice |
|--------|--------|
| **Scope** | `creator_id`. |
| **Idempotency** | Unique `(creator_id, file_hash)` so the same file is not double-processed. |
| **Metadata** | `uploaded_at`, optional `label`. |

## 3. `PatreonInsightsPostMetric`

**Purpose:** Parsed per-post metrics from one import (child of import row).

| Concept | Choice |
|--------|--------|
| **Scope** | `creator_id` duplicated for index-friendly queries; FK to `import_id`. |
| **Post key** | `patreon_post_id` string from CSV (align with Patreon’s id, often matches **`Post.id`** / snapshot post id when ingest used same id). |
| **Metrics** | Map CSV columns to DB-safe names (e.g. `impressions`, `seen`, `likes`, `comments`) + `as_of` or reporting period. |
| **FK to `Post`** | **Optional** nullable `post_id` → `Post.id` when join key matches: same `creator_id` and stable id equality or `Post.providerPostId` / id convention documented in migration comment. Many rows may remain unlinked if CSV references posts not in Relay. |

## 4. `RelayEngagementEvent`

**Purpose:** First-party Relay events (gallery views, reveal interactions, pilot-minimal `event_type` set).

| Concept | Choice |
|--------|--------|
| **Scope** | `creator_id`. |
| **Content** | `event_type`, `occurred_at`, optional `post_id` / `media_id` (FK to existing models where useful). |
| **Sessions** | Optional **opaque** `session_key` (hashed or random id) — **no** raw Patreon patron id, **no** email. |
| **PII bar** | If product later needs demographic splits, document a separate privacy review — default pilot stays aggregate-friendly. |

## Relationship to existing analytics tables

- **`AnalyticsSnapshotRow`**, **`RecommendationRecord`**, etc.: **unchanged**. P5a pilot **adds** tables; do not stuff membership history into snapshot `payload` Json as the primary SoT.

## Staging rollout smoke (P5a-ins-001)

Use this when applying **P5a** migrations to a **shared** database (staging first, then production). **CI** already applies **all** migrations—including P5a—to an **empty** Postgres container before `npm test` (see [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)); hosted environments need a human or deploy pipeline step.

### Before you run anything

- Point **`DATABASE_URL`** at the right database (staging vs prod). Use the **transaction pooler** URI your team chose for Prisma (`docs/database/operations-and-security.md`).
- **Do not** use `prisma db push` on shared staging/prod unless you have a written plan to align `_prisma_migrations` afterward.

### Steps

1. **Deploy migrations (forward-only):**

   ```bash
   npx prisma migrate deploy
   ```

2. **Confirm Prisma thinks history matches:**

   ```bash
   npx prisma migrate status
   ```

   Expect: no pending migrations.

3. **Quick check that P5a tables exist** (optional; run in psql or Supabase SQL editor):

   ```sql
   SELECT table_name
   FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN (
       'creator_membership_events',
       'patreon_insights_imports',
       'patreon_insights_post_metrics',
       'relay_engagement_events'
     )
   ORDER BY 1;
   ```

   You should see **four** rows.

### Pilot policy: rollback vs forward-only

- **Normal releases:** **Forward-only.** If something is wrong, ship a **new** migration that fixes it. That keeps every environment on the same migration chain.
- **When a migration fails mid-way:** Stop traffic if needed, fix the database to a **known-good** state (backup / manual SQL), then use **`prisma migrate resolve`** as documented in [`MIGRATION_HISTORY.md`](MIGRATION_HISTORY.md) and [`operations-and-security.md`](operations-and-security.md). Do **not** delete migration files that may already be applied somewhere.
- **“Rollback” in pilot** means **restore DB from backup** or **apply a corrective migration**, not rewriting old migration folders.

## References

- Pilot batching: [`pilot-build-plan.md`](../pilot-build-plan.md) Phase **P5a**.
- Cutover narrative: [`migration-from-relay-data.md`](migration-from-relay-data.md).
- Migration ops (drift, `migrate resolve`): [`MIGRATION_HISTORY.md`](MIGRATION_HISTORY.md), [`operations-and-security.md`](operations-and-security.md).
