# CP-07a schema authoring evidence

Authored the additive conversational-plan schema in `prisma/schema.prisma` and the sequential migration `prisma/migrations/20261015120000_creator_conversational_plans/migration.sql`. The migration creates the three finite PostgreSQL enums and exactly three composition tables: current plan, immutable revision, and identity-only pointer. It adds a tenant FK from `creator_id` to `tenants.relay_creator_id`, composite creator-scoped child FKs, plan/revision uniqueness and indexes, `schema_version = 1` and nonnegative revision checks, and the pointer slot/kind matrix check.

The only existing-table edits add nullable unique correlation columns to `autopost_drafts`, `creator_schedule_events`, and `post_distribution_plans`. There is no data update, rewrite, backfill, execution status, or second execution ledger. Index names that would exceed PostgreSQL's 63-byte identifier limit are explicitly shortened in Prisma and use the same names in SQL. The three new tables have RLS enabled in the same transaction, with no policy and no `FORCE ROW LEVEL SECURITY`; table privileges are revoked from `PUBLIC` and from `anon`/`authenticated` when those roles exist. The migration adds no grants, including no `service_role` grant or policy.

Validation completed:

- `npx prisma validate` — passed.
- `npx prisma generate` — passed.
- `npx vitest run tests/conversational-planning/persistence-schema.test.ts` — passed, 6 static tests, including SQL identifier length and map/name parity checks.
- `npm run build` — passed, including Prisma generation, TypeScript build, and asset copy.
- `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script` — offline schema rendering confirmed Prisma's generated names for all new tables, indexes, and FKs match the migration names; no datasource comparison or database connection was used.

No database connection, migration application, or live catalog query was used. The deployment design assumes the Relay API's configured Prisma database role bypasses RLS; that role property has not been verified here. RLS posture and revokes are authored in the DDL, while the disposable-database catalog and non-bypass-role proof remain for CP-07b after parent review of this exact migration. The static tests verify schema/DDL text and do not claim PostgreSQL has executed it.
