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
| **`docs/studio/goal-cycle-build-plans/00-README.md`** | **Goal Cycle worker program:** Library-first Coach planning, credits, trend evidence, paid-support attribution, rail materialization, extension execution, outcomes, and rollout. Claim slices in dependency order and use its builder orientation. |
| **`docs/studio/escape-hatch-build-plans/00-README.md`** | **Escape Hatch worker program:** creator-owned Patreon-to-site wizard, hard paywalls, independent billing/deployment, optional managed OAuth, testing, and ownership handoff. |
| **`docs/qa/HTTP_VERB_HYGIENE.md`** | GETs are side-effect-free; mutations use POST/PUT/PATCH/DELETE (logout is POST only). |
| **`.cursor/rules/airtable-execution-control-plane.mdc`** | IDE mirror: read ledger before work, batching, MCP hygiene. |
| **`docs/pilot-two-stage-charter.md`** | **Canonical Stage 1 / Stage 2 split** — functionality exit vs monetization viability; Stage 2 blockers. |
| **`docs/pilot-build-plan.md`** | Stage 1 execution: Phases P0–P9, Airtable-style work items, v0 asset register (read charter first). |

**MCP:** **`user-airtable`** — base **Project tracker** `applW4dOjVNHoWBM9`. Read MCP tool descriptors before calling. Always read **`Production Ledger`** state before claiming work; use **`Session Lock`**. **`user-supabase`** — read-check migrations/tables/SQL against the linked Supabase project after Prisma or identity work when prudent (`.cursor/rules/supabase-mcp-read-check.mdc`); never paste secrets.

**Relay-native posts plan (Batting Order):** base **Batting Order** `apprid6UGT9E1KlkN`. **Status** (single-select: **Queued** default, **Done**) exists on:
- **`RN - Epics`** `tbl925QBL3fvXCFid` — set an epic to **Done** when all of its work under that epic is complete.
- **`RN - Work items`** `tblwwrxy7KYK04udR` — set each work item to **Done** when that item’s acceptance criteria are met (update via Airtable MCP `update_records` or the Airtable UI).

**Escape Hatch agent boundary:** Fable or Sol plans/reviews only. **Cursor Grok 4.5 High is the sole approved implementation builder** for auth, paywall/media, billing/OAuth, migration, deploy, recovery, security-critical work, wizard/generated-site UI, fixtures, tests, docs, and bounded integration. Do not recruit Composer 2.5 Fast for Escape Hatch work. The master browser-reviews every UI slice and complete milestone journey. Escape Hatch uses its docs + git + milestone reports for execution state; it does not use Airtable unless a human explicitly adds that workflow later. Full contract: [`docs/studio/escape-hatch-build-plans/10-AGENT-ORCHESTRATION.md`](docs/studio/escape-hatch-build-plans/10-AGENT-ORCHESTRATION.md).

---

## Repo map (quick)

| Area | Path | Notes |
|------|------|--------|
| Backend / API | `src/` | `npm run test`, `npm run build`, `npm start` from repo root (default port **8787**) |
| Web (Next.js) | `web/` | `npm run dev`, `npm run lint`, `npm run build` |
| Automation | `Automation/` | `ledger-to-v0`, Airtable docs, attended loop |
| Relational DB (target) | `docs/database/` | PostgreSQL + Prisma direction, migration from `.relay-data/` — not the Airtable ledger; **DB Integration Pipeline** Airtable layout: [`docs/database/AIRTABLE_DB_PIPELINE.md`](docs/database/AIRTABLE_DB_PIPELINE.md) |

**Database integration (M10):** Verification checklist and human gates — [`docs/database/M10_VERIFICATION.md`](docs/database/M10_VERIFICATION.md). Per-domain cutover status — [`docs/database/migration-from-relay-data.md`](docs/database/migration-from-relay-data.md). Pooling + security — [`docs/database/operations-and-security.md`](docs/database/operations-and-security.md).

**Multi-tenant + cloud (Supabase target):** **Agent preamble for Airtable Multi Tenant Changes** — [`docs/architecture/MULTI_TENANT_AGENT_ORIENTATION.md`](docs/architecture/MULTI_TENANT_AGENT_ORIENTATION.md). Runtime schema — [`docs/architecture/multi-tenant-cloud-runtime.md`](docs/architecture/multi-tenant-cloud-runtime.md); migration work items — [`docs/architecture/supabase-migration-work-items.md`](docs/architecture/supabase-migration-work-items.md); identity Option B — [`docs/architecture/multi-tenant-option-b.md`](docs/architecture/multi-tenant-option-b.md).

**Strategic narrative:** [`road map.md`](road%20map.md). **Goal Cycle product/build contract:** [`docs/studio/GOAL_CYCLE_PRODUCT_CONTRACT.md`](docs/studio/GOAL_CYCLE_PRODUCT_CONTRACT.md) and [`docs/studio/goal-cycle-build-plans/00-README.md`](docs/studio/goal-cycle-build-plans/00-README.md). **Schedule Rail Automations worker program:** [`docs/studio/automation-build-plans/00-README.md`](docs/studio/automation-build-plans/00-README.md) — connector-first composition of series, rules, drafts, rail/reminders, Previewizer, and human-confirmed distribution. **Business / unit economics:** **`docs/financial-atlas.md`**. **Monetization build plan (billing spine + Tip economy):** [`docs/MONETIZATION_MASTER_MAP.md`](docs/MONETIZATION_MASTER_MAP.md).

---

## Airtable + v0 attended workflow

See **`Automation/README.md`** and **`Automation/docs/`**. MCP and scripts target base **`applW4dOjVNHoWBM9`** (Production Ledger **`tblDDAKjaaBBIBuPf`**).

**Bridge script:** **`Automation/scripts/ledger-to-v0.mjs`** — requires **`Automation/.env`** (`V0_API_KEY`, Airtable PAT). Node ≥ 22.

**Chat handoff / summary:** **`Automation/docs/CURSOR_HANDOFF.md`**

**Cursor project rules:** **`.cursor/rules/`** (`.mdc` files with frontmatter).
