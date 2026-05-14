# Agent context (Rescue)

## Managed swarm (Claude Code / multi-agent)

**Start here for builder flocks:** **`.docs/anthropic/BUILD_BRIEF.md`**, **`.docs/anthropic/CURRENT_LEDGER_QUEUE.md`** (live Airtable queue + record IDs), then **`.docs/anthropic/README.md`** (numbered load order).

| Doc | Role |
|-----|------|
| **`.docs/anthropic/CURRENT_LEDGER_QUEUE.md`** | **Project tracker Production Ledger:** open rows, prioritization (**Ready for v0** vs **Queued**), MCP refresh. |
| **`.docs/anthropic/SMART_BUILDER_SWARM.md`** | Canonical system prompt + YAML fragment (Relay terminology). |
| **`.docs/anthropic/AIRTABLE_LEDGER.md`** | Project tracker: **Production Ledger** queue — not a generic “milestones” table. |
| **`.docs/anthropic/ChiefArchitect.md`** | Orchestration, batching, session reports. |
| **`.docs/anthropic/FAIL_TO_HUMAN.md`** | Stop conditions (OAuth, secrets, unreachable env). |
| **`.docs/anthropic/PRODUCT_UX_NORTH_STAR.md`** | Artist Relay vs Fan Relay. |
| **`docs/UI_SPECIALIST_RELAY.md`** | Relay UI/UX scope: `web/`, patron mock, guardrails, verification. |
| **`docs/qa/UX_ACCEPTANCE_GUARDRAILS.md`** | Pass/fail UX expectations. |
| **`docs/qa/HTTP_VERB_HYGIENE.md`** | GETs are side-effect-free; mutations use POST/PUT/PATCH/DELETE (logout is POST only). |
| **`.cursor/rules/airtable-execution-control-plane.mdc`** | IDE mirror: read ledger before work, batching, MCP hygiene. |

**MCP:** **`user-airtable`** — base **Project tracker** `applW4dOjVNHoWBM9`. Read MCP tool descriptors before calling. Always read **`Production Ledger`** state before claiming work; use **`Session Lock`**. **`user-supabase`** — read-check migrations/tables/SQL against the linked Supabase project after Prisma or identity work when prudent (`.cursor/rules/supabase-mcp-read-check.mdc`); never paste secrets.

**Relay-native posts plan (Batting Order):** base **Batting Order** `apprid6UGT9E1KlkN`. **Status** (single-select: **Queued** default, **Done**) exists on:
- **`RN - Epics`** `tbl925QBL3fvXCFid` — set an epic to **Done** when all of its work under that epic is complete.
- **`RN - Work items`** `tblwwrxy7KYK04udR` — set each work item to **Done** when that item’s acceptance criteria are met (update via Airtable MCP `update_records` or the Airtable UI).

---

## Repo map (quick)

| Area | Path | Notes |
|------|------|--------|
| Backend / API | `src/` | `npm run test`, `npm run build`, `npm start` from repo root |
| Web (Next.js) | `web/` | `npm run dev`, `npm run lint`, `npm run build` |
| Automation | `Automation/` | `ledger-to-v0`, Airtable docs, attended loop |
| Relational DB (target) | `docs/database/` | PostgreSQL + Prisma direction, migration from `.relay-data/` — not the Airtable ledger; **DB Integration Pipeline** Airtable layout: [`docs/database/AIRTABLE_DB_PIPELINE.md`](docs/database/AIRTABLE_DB_PIPELINE.md) |

**Database integration (M10):** Verification checklist and human gates — [`docs/database/M10_VERIFICATION.md`](docs/database/M10_VERIFICATION.md). Per-domain cutover status — [`docs/database/migration-from-relay-data.md`](docs/database/migration-from-relay-data.md). Pooling + security — [`docs/database/operations-and-security.md`](docs/database/operations-and-security.md).

**Multi-tenant + cloud (Supabase target):** **Agent preamble for Airtable Multi Tenant Changes** — [`docs/architecture/MULTI_TENANT_AGENT_ORIENTATION.md`](docs/architecture/MULTI_TENANT_AGENT_ORIENTATION.md). Runtime schema — [`docs/architecture/multi-tenant-cloud-runtime.md`](docs/architecture/multi-tenant-cloud-runtime.md); migration work items — [`docs/architecture/supabase-migration-work-items.md`](docs/architecture/supabase-migration-work-items.md); identity Option B — [`docs/architecture/multi-tenant-option-b.md`](docs/architecture/multi-tenant-option-b.md).

**Strategic narrative:** [`road map.md`](road%20map.md). **Business / unit economics:** **`docs/financial-atlas.md`**.

---

## Airtable + v0 attended workflow

See **`Automation/README.md`** and **`Automation/docs/`**. MCP and scripts target base **`applW4dOjVNHoWBM9`** (Production Ledger **`tblDDAKjaaBBIBuPf`**).

**Bridge script:** **`Automation/scripts/ledger-to-v0.mjs`** — requires **`Automation/.env`** (`V0_API_KEY`, Airtable PAT). Node ≥ 22.

**Chat handoff / summary:** **`Automation/docs/CURSOR_HANDOFF.md`**

**Cursor project rules:** **`.cursor/rules/`** (`.mdc` files with frontmatter).

---

## Cursor Cloud specific instructions

### Services overview

| Service | Path | Dev command | Port |
|---------|------|-------------|------|
| Backend API (Express + Prisma) | repo root `src/` | `npm run build && npm start` | 8787 |
| Web (Next.js 14) | `web/` | `cd web && npm run dev` | 3000 |
| PostgreSQL 16 | `docker-compose.yml` | `docker compose up -d` | 5433→5432 |

Convenience: `npm run dev:stack` builds the API then runs both API + web concurrently.

### Running services

1. **PostgreSQL** must be running before the API starts: `docker compose up -d` (repo root). Docker must be installed and running (`sudo dockerd` if needed in container environments; use `fuse-overlayfs` storage driver and `iptables-legacy` in nested-container setups).
2. **Root `.env`** must exist with at minimum `DATABASE_URL`, `RELAY_TOKEN_ENCRYPTION_KEY`, `PATREON_CLIENT_ID`, `PATREON_CLIENT_SECRET`. See `.env.example` for documentation. Generate the encryption key: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
3. **Prisma**: after `npm install`, run `npx prisma generate` then `npx prisma migrate deploy` to apply all migrations to the local DB.
4. **Build API**: `npm run build` (runs `prisma generate` + `tsc`).
5. **Start API**: `npm start` (serves on port 8787).
6. **Web**: `cd web && npm install && npm run dev` (serves on port 3000). Requires `web/.env.local` — copy from `web/.env.example`, set `NEXT_PUBLIC_RELAY_API_URL=http://127.0.0.1:8787`.

### Testing

- **Backend tests**: `npm run test` (Vitest, 99 test files / 320 tests). No running services required — tests mock external deps.
- **Web lint**: `cd web && npm run lint` (ESLint via Next.js). Warnings about `<img>` vs `<Image>` are pre-existing and not errors.
- **Web build**: `cd web && npm run build`. Succeeds with warnings only.
- **Full verification**: `npm run verify:m10` runs build + test + lint + web build in sequence.

### Gotchas

- The root and `web/` have **separate** `package.json` / `node_modules` — run `npm install` in both locations.
- PostgreSQL listens on **host port 5433** (not 5432) to avoid conflicts; `DATABASE_URL` must use port 5433.
- The API **exits immediately** if `RELAY_TOKEN_ENCRYPTION_KEY` is missing or invalid.
- Pages like `/` (Studio) and `/designer` require a valid Supabase Auth session or `NEXT_PUBLIC_RELAY_STUDIO_AUTH_DISABLED=1` + API data to render fully. The `/visitor`, `/login`, and `/patreon/connect` pages work without external services.
- The API can partially run without Postgres using JSON file stores in `.relay-data/`, but Prisma client generation always requires a valid `DATABASE_URL` (even a dummy one works for `prisma generate`).
