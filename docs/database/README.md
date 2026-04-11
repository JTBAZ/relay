# Relay — database planning

Authoritative relational design and migration plans for Relay’s **runtime** data. This folder is the engineering reference for PostgreSQL + Prisma (per `road map.md` — Architecture Baseline).

## Scope

- **In scope:** Schema direction, migrations from `.relay-data/` JSON stores, integrity, tenant isolation, encryption boundaries, retention posture, and how services should read/write data.
- **Out of scope:** Airtable **Production Ledger** — that queue is for humans/agents and project operations, **not** the application database (see `AGENTS.md`, `.docs/anthropic/AIRTABLE_LEDGER.md`).

## Product and contract references (read order)

| Doc | Role |
|-----|------|
| [`road map.md`](../../road%20map.md) | Architecture Baseline, Data Domains, Part 1 A/E, Part 3 K/L |
| [`.docs/anthropic/PRODUCT_UX_NORTH_STAR.md`](../../.docs/anthropic/PRODUCT_UX_NORTH_STAR.md) | Artist Relay vs Fan Relay, single access model |
| [`docs/qa/UX_ACCEPTANCE_GUARDRAILS.md`](../qa/UX_ACCEPTANCE_GUARDRAILS.md) | Route/API expectations for QA |
| [`docs/patreon-ingest-canonical.md`](../patreon-ingest-canonical.md) | Canonical ingest vs presentation |
| [`docs/relay-artist-metadata.md`](../relay-artist-metadata.md) | Overrides survive re-ingest |
| [`docs/pattern-library.md`](../pattern-library.md) | Viewer parity, Library vs fan surfaces |
| [`analytics-action-center-spec.md`](../../analytics-action-center-spec.md) | Analytics / recommendation minimum model |
| [`builder-boost-pack/contracts/events.md`](../../builder-boost-pack/contracts/events.md) | Event envelope, `tenant_id`, idempotency |

## Documents in this folder

| File | Contents |
|------|----------|
| [`relational-model.md`](relational-model.md) | Principles, ERD, representative Prisma-oriented schema |
| [`migration-from-relay-data.md`](migration-from-relay-data.md) | `.relay-data/` → tables mapping, dual-write / cutover |
| [`operations-and-security.md`](operations-and-security.md) | Indexes, partitioning, RLS, encryption, analytics alignment, open product flags |
| [`integration-roadmap.md`](integration-roadmap.md) | **Execution plan:** 10 milestones, phased work items, dependency order, parallel tracks, open-pipe stubs for future build structures |
| [`staging-identity-verification.md`](staging-identity-verification.md) | Staging checks when `RELAY_DB_STORE_IDENTITY=1`; links to API smoke routes |
| [`staging-canonical-verification.md`](staging-canonical-verification.md) | Staging checks when canonical ingest uses Postgres (`RELAY_DB_STORE_CANONICAL=1`) |
| [`sub-agent-prompts.md`](sub-agent-prompts.md) | **Index** + Universal preamble; **19 standalone run files** in [`runs/`](runs/README.md) |
| [`AIRTABLE_DB_PIPELINE.md`](AIRTABLE_DB_PIPELINE.md) | **Canonical Airtable schema** for **Relay Database Tracker** → **DB Integration Pipeline** (fields, base/table IDs, **runs** batching) |
| [`AIRTABLE_AUTOPIPELINE.md`](AIRTABLE_AUTOPIPELINE.md) | **Agent + delta + Cursor CLI** autosequencer (Tasks/Runs/System State, delta contract, local runner script) — **not** the DB integration base |

### Enabling Postgres-backed analytics (M6)

Turning on **`RELAY_DB_STORE_ANALYTICS=1`** is what switches the API from **`FileAnalyticsStore`** (`.relay-data` / `analytics.json`) to **`DbAnalyticsStore`**. It is **not** automatic when migrations exist; you must complete the cutover on each environment:

1. **`DATABASE_URL`** set and reachable (repo root `.env`).
2. **Apply migrations** so analytics tables exist: `npx prisma migrate deploy` (or `npm run db:migrate` in dev).
3. **Backfill** existing file data into Postgres: `npm run backfill:analytics` (runs `build` then `scripts/backfill-analytics.mjs`).
4. Set **`RELAY_DB_STORE_ANALYTICS=1`**, restart the API (`npm start` / your process manager).

If the flag is on before migrate + backfill, behavior can be wrong or empty relative to the file you were using. See milestone **M6** in [`integration-roadmap.md`](integration-roadmap.md) and run prompt [`runs/run-15.md`](runs/run-15.md).

### Enabling Postgres-backed Part 2 stores (M8)

Clone sites, payments, audience migration jobs, and deploy records can stay on **JSON files** until you opt in. To use **Postgres** for any of those domains, set the matching flag(s) **only after** migrate + backfill on that environment:

1. **`DATABASE_URL`** set and reachable.
2. **`npx prisma migrate deploy`** (or `npm run db:migrate` in dev) so M8 tables exist on that database.
3. **`npm run backfill:part2`** — copies Part 2 JSON under `.relay-data/` into Postgres (`scripts/backfill-part2.mjs` after `build`).
4. Enable **only** the flags you need, then restart:
   - **`RELAY_DB_STORE_CLONE`**
   - **`RELAY_DB_STORE_PAYMENTS`**
   - **`RELAY_DB_STORE_MIGRATION`**
   - **`RELAY_DB_STORE_DEPLOY`**

The four flags are **independent** (e.g. you can enable clone + deploy and leave payments on files). If you do not plan to cut over Part 2 yet, leave them unset; you may still run **`migrate deploy`** so the schema is ready when you flip switches. See milestone **M8** in [`integration-roadmap.md`](integration-roadmap.md) and [`runs/run-17.md`](runs/run-17.md).

## Repo reality

The repo root has **`prisma/schema.prisma`**, **`prisma/migrations/`**, and **`prisma.config.ts`** (Prisma 7: DB URL is configured for the CLI in `prisma.config.ts`; see root `.env.example` **`DATABASE_URL`**). GitHub Actions **`.github/workflows/ci.yml`** runs **`prisma migrate deploy`** against an ephemeral Postgres, then **`npm run build`**, **`npm test`**, and **`node scripts/m10-token-log-scan.mjs`**; a separate **`web`** job runs **`npm ci`**, **`npm run lint`**, and **`npm run build`** under **`web/`** (M10 parity with **`npm run verify:m10`** minus duplicating backend steps). **`src/server.ts`** wires **`Db*Store`** implementations when the matching **`RELAY_DB_STORE_*`** flag is set (and `prisma` is passed in); otherwise the same routes use **file-backed** `.relay-data/` defaults. Schema includes **M9** future stubs (Part 3, Smart Tag placeholders, `WebhookEndpoint`). NPM scripts: **`npm run db:generate`**, **`npm run db:migrate`**, **`npm run db:push`**; **`npm run build`** runs **`prisma generate`** before `tsc`. **M10** release verification: **[`M10_VERIFICATION.md`](M10_VERIFICATION.md)** and **`npm run verify:m10`** at repo root.

## See also

- **[`AGENTS.md`](../../AGENTS.md)** — repo map entry for `docs/database/`
- **[`docs/pattern-library.md`](../pattern-library.md)** — viewer parity and data contracts (same semantics as storage evolves)

## Airtable — DB Integration Pipeline (optional)

Roadmap execution is tracked in the **Relay Database Tracker** base (**DB Integration Pipeline** table): one row per roadmap step, with prompts batched into **19 runs** (`run-01.md` … `run-19.md`). Full field list, base/table IDs, and the **runs** formula (same `Doc reference` / `Next run prompt` for every step in a run) are in **[`AIRTABLE_DB_PIPELINE.md`](AIRTABLE_DB_PIPELINE.md)**. This is separate from the **Project tracker** Production Ledger (product/UI work).
