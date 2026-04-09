# Agent context (Rescue)

## Managed swarm (Claude Code / multi-agent)

**Start here for builder flocks:** **`docs/agents/BUILD_BRIEF.md`**, then **`docs/agents/README.md`** (numbered load order).

| Doc | Role |
|-----|------|
| **`docs/agents/SMART_BUILDER_SWARM.md`** | Canonical system prompt + YAML fragment (Relay terminology). |
| **`docs/agents/AIRTABLE_LEDGER.md`** | Project tracker: **Production Ledger** queue — not a generic “milestones” table. |
| **`docs/agents/ChiefArchitect.md`** | Orchestration, batching, session reports. |
| **`docs/agents/FAIL_TO_HUMAN.md`** | Stop conditions (OAuth, secrets, unreachable env). |
| **`docs/agents/PRODUCT_UX_NORTH_STAR.md`** | Artist Relay vs Fan Relay. |
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

**Strategic narrative:** [`road map.md`](road%20map.md). **Business / unit economics:** **`docs/financial-atlas.md`**.

---

## Airtable + v0 attended workflow

See **`Automation/README.md`** and **`Automation/docs/`**. MCP and scripts target base **`applW4dOjVNHoWBM9`** (Production Ledger **`tblDDAKjaaBBIBuPf`**).

**Bridge script:** **`Automation/scripts/ledger-to-v0.mjs`** — requires **`Automation/.env`** (`V0_API_KEY`, Airtable PAT). Node ≥ 22.

**Chat handoff / summary:** **`Automation/docs/CURSOR_HANDOFF.md`**

**Cursor project rules:** **`.cursor/rules/`** (`.mdc` files with frontmatter).
