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
| **`.cursor/rules/airtable-execution-control-plane.mdc`** | IDE mirror: read ledger before work, batching, MCP hygiene. |

**MCP:** **`user-airtable`** — base **Project tracker** `applW4dOjVNHoWBM9`. Read MCP tool descriptors before calling. Always read **`Production Ledger`** state before claiming work; use **`Session Lock`**.

---

## Repo map (quick)

| Area | Path | Notes |
|------|------|--------|
| Backend / API | `src/` | `npm run test`, `npm run build`, `npm start` from repo root |
| Web (Next.js) | `web/` | `npm run dev`, `npm run lint`, `npm run build` |
| Automation | `Automation/` | `ledger-to-v0`, Airtable docs, attended loop |
| Relational DB (target) | `docs/database/` | PostgreSQL + Prisma direction, migration from `.relay-data/` — not the Airtable ledger |

**Strategic narrative:** [`road map.md`](road%20map.md). **Business / unit economics:** **`docs/financial-atlas.md`**.

---

## Airtable + v0 attended workflow

See **`Automation/README.md`** and **`Automation/docs/`**. MCP and scripts target base **`applW4dOjVNHoWBM9`** (Production Ledger **`tblDDAKjaaBBIBuPf`**).

**Bridge script:** **`Automation/scripts/ledger-to-v0.mjs`** — requires **`Automation/.env`** (`V0_API_KEY`, Airtable PAT). Node ≥ 22.

**Chat handoff / summary:** **`Automation/docs/CURSOR_HANDOFF.md`**

**Cursor project rules:** **`.cursor/rules/`** (`.mdc` files with frontmatter).
