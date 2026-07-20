# VS1 Build Plan — Connector Schema and Migration

## Outcome

Add the smallest migration-safe schema that connects existing schedule, rule, template, draft/event, and distribution authorities without creating a parallel automation-run ledger.

## Scope

In: `CreatorAutomation`; trigger-only series discriminator; rule-run correlation, template snapshot, expiry/cancellation fields; relations, indexes, migration, Prisma tests.

Out: services, routes, workers, UI, production migration execution, legacy-row adoption.

## Dependencies and permitted parallel work

Depends on VS0 exit. No schema work may run in parallel. Fixture-only tests may be prepared without editing Prisma hot files.

## Required reading

1. [`01-VS0-BASELINE-CONTRACTS.md`](01-VS0-BASELINE-CONTRACTS.md) and latest Delta Out
2. `prisma/schema.prisma` models:
   - `CreatorPreviewTemplate`
   - `CreatorScheduleSeries`
   - `CreatorScheduleOccurrence`
   - `CreatorDistributionRule`
   - `CreatorDistributionRuleRun`
   - `CreatorScheduleEvent`
   - `AutopostDraft`
3. `prisma/migrations/20260719180000_autopost_schedule_series_distribution_rules/migration.sql`
4. Prisma schema/migration workspace rules
5. `.cursor/rules/supabase-mcp-read-check.mdc`

## Locked relational shape

Use VS0 names if they differ, but preserve these ownership rules:

```prisma
model CreatorAutomation {
  id                String   @id @default(cuid())
  creatorId         String   @map("creator_id")
  presetKind        String   @map("preset_kind")
  status            String   @default("active")
  title             String
  sourceKind        String   @map("source_kind")
  scheduleSeriesId  String?  @unique @map("schedule_series_id")
  distributionRuleId String  @unique @map("distribution_rule_id")
  previewTemplateId String?  @map("preview_template_id")
  approvalTtlHours  Int      @default(72) @map("approval_ttl_hours")
  version           Int      @default(1)
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")
}
```

Relations:

- `scheduleSeriesId` → `CreatorScheduleSeries`, optional and one-to-one; `SetNull` on child removal.
- `distributionRuleId` → `CreatorDistributionRule`, required and one-to-one; lifecycle service controls deletion/archival.
- `previewTemplateId` → `CreatorPreviewTemplate`, optional; `SetNull` on template deletion.
- Existing rows remain unowned by an automation.

Extend:

- `CreatorScheduleSeries.materializationKind`, default `post_draft`; automation rows use `automation_trigger`.
- `CreatorDistributionRuleRun.scheduleOccurrenceId` optional relation/index.
- Stable run `idempotencyKey` unique after safe existing-row backfill.
- `materializedEventId`, `previewTemplateSnapshot`, `expiresAt`, `completedAt`, and only VS0-approved status additions.
- Optional plan/attempt correlation only if VS0 proves existing `planId` insufficient.

Do not add `CreatorAutomationRun`, duplicate cadence fields, duplicate destination fields, or `lastProcessedPostId`.

## Migration requirements

- Existing series backfill to `post_draft`.
- Existing distribution runs receive deterministic idempotency keys based on rule/source post.
- Existing rules/runs remain semantically unchanged and unowned.
- No destructive cascade from automation archive.
- SQL is safe on populated PostgreSQL and rerun assumptions are documented.

## Files

Create:

- one timestamped migration
- `tests/automations/schema.test.ts`
- migration fixture/test if the repo's migration harness supports it

Edit:

- `prisma/schema.prisma`

Do not touch:

- services/routes/workers/UI
- existing migration files

## Todo work items

### AUT-VS1-T01 — Add connector graph and migration

1. Implement the locked relational shape using VS0 enums/types where Prisma enums are justified.
2. Add back-relations without changing existing delete behavior.
3. Write safe SQL backfill and uniqueness/index creation.
4. Generate Prisma client artifacts only through repository conventions.

Acceptance: migration preserves all legacy rows and cannot create two automations owning the same rule/series.

### AUT-VS1-T02 — Prove relations and idempotency

1. Test one-to-one ownership, creator-scoped joins, template `SetNull`, and archive-safe history.
2. Test old series defaults and old rule-run backfill keys.
3. Test occurrence-key and action-run idempotency constraints under duplicate inserts.
4. Validate Prisma and, when prudent/configured, perform the linked Supabase read-check without mutation.

Acceptance: schema tests prove the connector is not a second run ledger and existing atom constraints remain intact.

## Safe batches

- **B03:** AUT-VS1-T01 only.
- **B04:** AUT-VS1-T02 only.

## Verification

```bash
npx prisma format
npx prisma validate
npx prisma generate
npx vitest run tests/automations/schema.test.ts
npm run typecheck
```

## Exit gate

Migration and schema tests pass; all existing rows have safe defaults/keys; no production migration was applied; Prisma client compiles; VS2 can implement against stable relations.

## Human stop conditions

Stop before a production migration, destructive legacy-rule adoption, relation change that would cascade-delete prepared artifacts, or any schema deviation that introduces a second cadence/run/status authority.

## Delta Out

B03 names B04. B04 names B05 only after migration evidence and the full exit gate.

### Batch 3 — 2026-07-20

```text
Automation Delta Out
- Global batch / claimed work items: B03 / AUT-VS1-T01
- Completed: AUT-VS1-T01
- Files created/edited:
  - prisma/schema.prisma — CreatorAutomation + materializationKind + rule-run TTL/correlation fields; expired|cancelled statuses; back-relations
  - prisma/migrations/20260720070000_creator_automations_connector/migration.sql (new)
  - tests/automations/schema.test.ts (new)
  - tests/automations/spine-characterization.test.ts — expect VS1 connector / TTL statuses
  - docs/studio/automation-build-plans/00-README.md (VS1 → In progress)
  - docs/studio/automation-build-plans/02-VS1-CONNECTOR-SCHEMA.md (this Delta Out)
- Migration and backfill state: SQL authored only; NOT applied to production/linked Supabase. Legacy series default post_draft; rule runs backfill rule:{id}:post:{id}; BEFORE INSERT trigger fills empty idempotency_key for legacy create paths. No legacy series/rules adopted into creator_automations.
- Contracts changed (expected: none unless this batch owns them): none (schema aligns to automations-wire-v1; no wire module edits)
- Commands and results:
  - npx prisma format → ok
  - npx prisma validate → valid
  - npx prisma generate → client generated
  - npx vitest run tests/automations/{spine-characterization,contracts,schema}.test.ts → 42 passed
- Manual/browser checks: n/a
- Feature flags / kill switches: none
- Existing atom regressions checked: no service/route/UI edits; ordinary series/rules remain unowned; no CreatorAutomationRun table
- Supabase MCP read-check (read-only):
  - list_tables: public.creator_automations absent (expected — migration not applied)
  - list_tables: creator_schedule_series / creator_distribution_rule_runs present remotely
  - list_migrations MCP list is sparse vs local migration folders (tracking skew); do not treat as drift proof for Autopost tables
  - Advisory: many Autopost schedule/distribution tables still RLS-disabled on linked project (pre-existing); new creator_automations migration enables RLS with no permissive policies
- Known risks or human gates:
  - Human gate required before migrate deploy
  - VS4 must honor materialization_kind=automation_trigger (schema only here)
  - Explicit occurrence:* idempotency keys still need service writers in later slices; empty-default + trigger covers legacy rule:post inserts
- Reopened owner IDs, if any: none
- Next unblocked batch: B04 (AUT-VS1-T02)
- Pasteable next-worker prompt:
  You are a Schedule Rail Automations builder in Rescue/Relay.
  Read AGENTS.md, .cursor/rules/rescue-workflow-always.mdc,
  docs/studio/automation-build-plans/BUILDER-ORIENTATION.md,
  docs/studio/automation-build-plans/00-README.md,
  docs/studio/automation-build-plans/02-VS1-CONNECTOR-SCHEMA.md (latest Delta Out),
  prisma/schema.prisma CreatorAutomation section,
  and supabase-mcp-read-check.
  Claim global Batch B04 only: AUT-VS1-T02 (prove relations + idempotency).
  Prefer local/test DB proofs; do not apply production migration; do not implement services/routes/UI.
  When complete, append Automation Delta Out, mark VS1 Done if exit gate passes, and name B05 next, then stop.
```

**Slice status after B03:** VS1 remained **In progress**. B04 completes the exit gate.

### Batch 4 — 2026-07-20

```text
Automation Delta Out
- Global batch / claimed work items: B04 / AUT-VS1-T02
- Completed: AUT-VS1-T02
- Files created/edited:
  - tests/automations/schema-relations.integration.test.ts (new) — real-DB ownership/SetNull/Restrict/idempotency/TTL proofs
  - tests/automations/schema.test.ts — DMMF/client surface proofs (B04)
  - docs/studio/automation-build-plans/00-README.md (VS1 → Done)
  - docs/studio/automation-build-plans/02-VS1-CONNECTOR-SCHEMA.md (this Delta Out)
- Migration and backfill state: Proven via ephemeral local Postgres (docker postgres:16 on :5433) with `prisma migrate deploy` through 20260720070000_creator_automations_connector. Linked Supabase / production NOT migrated. Ephemeral container removed after tests.
- Contracts changed (expected: none unless this batch owns them): none
- Commands and results:
  - docker ephemeral PG + npx prisma migrate deploy → 100 migrations applied (incl. creator_automations_connector)
  - npx vitest run tests/automations/ → 50 passed (schema 12, relations IT 6, spine 10, contracts 22)
  - npx prisma validate → valid
- Manual/browser checks: n/a
- Feature flags / kill switches: none
- Existing atom regressions checked: no service/route/UI edits; no CreatorAutomationRun; archive retains rule runs; Restrict blocks deleting owned rules
- Supabase MCP read-check (read-only): public.creator_automations still absent on linked project (expected). Pre-existing RLS-disabled Autopost schedule/distribution tables unchanged (out of B04 scope).
- Known risks or human gates: human authorization still required before migrate deploy to linked Supabase/production. CI default without DATABASE_URL skips relation IT (table probe).
- Reopened owner IDs, if any: none
- Next unblocked batch: B05 (AUT-VS2-T01)
- Pasteable next-worker prompt:
  You are a Schedule Rail Automations builder in Rescue/Relay.
  Read AGENTS.md, .cursor/rules/rescue-workflow-always.mdc,
  docs/studio/automation-build-plans/BUILDER-ORIENTATION.md,
  docs/studio/automation-build-plans/00-README.md,
  docs/studio/automation-build-plans/02-VS1-CONNECTOR-SCHEMA.md (latest Delta Out),
  docs/studio/automation-build-plans/03-VS2-LIFECYCLE-API.md,
  src/autopost/automation-contract.ts, and related Autopost lifecycle services.
  Claim global Batch B05 only: AUT-VS2-T01 (connector lifecycle service).
  Do not add routes/UI yet (B06). Do not apply production migration.
  When complete, append Automation Delta Out and name B06 next, then stop.
```

**Slice status:** VS1 **Done**. Next batch is B05 (VS2 lifecycle service).
