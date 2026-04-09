# Project tracker — Airtable ledger (schema + agent routing)

**Purpose:** Give managed agents an **exact** map of the **Project tracker** base: table IDs, field names, workflow, and how execution relates to **[`road map.md`](../../road%20map.md)**.

**Naming:** External prompts sometimes say “milestones.” In **this** base the actionable **implementation queue** for UI/build units is table **`Production Ledger`**. Planning screens live in **UI Planning — Design Pages** and **Inventory** — they are **not** the same as ledger **Status**. There is **no** table named **Milestones**.

**Ground truth hierarchy**

1. **`Production Ledger.Status`** + **`Session Lock`** + **`Queue Order`** + **`Error Log`** / **Integrator Notes** — operational queue.
2. **`road map.md`** — stable narrative, phases, architecture anchors (strategy).
3. **Design Pages / Vertical Slices** — IA and boundaries; may **lag** ledger reality; prefer **Production Ledger** when choosing “what’s next.”

Confirm **`baseId`** with MCP **`list_bases`** if unsure.

---

## Base

| Field | Value |
|--------|--------|
| **Name** | Project tracker |
| **baseId** | `applW4dOjVNHoWBM9` |

---

## Tables (IDs)

| Table | tableId | Role |
|--------|---------|------|
| **Production Ledger** | `tblDDAKjaaBBIBuPf` | Primary execution queue: one row per build unit (component, slice bundle, or design-page batch). |
| **UI Planning — Inventory** | `tbluISu3XCKl3Berv` | Screen/component inventory; links to **Primary Vertical Slice**, **Primary design page**. |
| **UI Planning — Vertical Slices** | `tbleD4y1ZbiaCDQ2V` | Slice boundaries (**Complexity**, **Why boundary**, **Includes**). |
| **UI Planning — Global Parameters** | `tblapjC9tNanrUCqG` | Stack tokens, brand, env var **names** (not secret values). |
| **UI Planning — Design Pages** | `tbliRw7EDiZBOLL2z` | ~22 design screens; **Roadmap Rank**, **Audience**, **Design notes**. |

---

## Production Ledger — fields (summary)

Use **exact** option text for **`Status`** (automation-friendly). Full dictionary: **`Automation/docs/LEDGER_SCHEMA.md`**.

| Area | Fields (names) |
|------|------------------|
| **Identity** | **Work Title** (primary), **Work Unit Kind**, **Design page**, **UI Element**, **Vertical Slice**, **Queue Order**, **Effective Complexity**, **Recommended v0 Model** |
| **Workflow** | **Status**, **Session Lock**, **Last Step Actor**, **Attempt Count** |
| **Prompt** | **Prompt Draft**, **Supplemental Guidance**, **Global Params Snapshot** |
| **v0** | **v0 Chat URL**, **v0 Preview URL**, **v0 Copy Block**, **v0 Completed At** |
| **Integration** | **Cursor Branch**, **Cursor PR URL**, **Integrator Notes**, **Error Log**, **Integration Completed At**, **Prompt Ready At** |

### Status values (exact strings)

From **`LEDGER_SCHEMA.md`**: **Queued**, **Prompt Drafting**, **Ready for v0**, **v0 In Progress**, **v0 Complete - Awaiting Integration**, **Integrating**, **Integrated - Local OK**, **Failed**, **Blocked**, **Skipped**.

**Definition of done** for a unit is **not** a single field — it is **`Status`** = **`Integrated - Local OK`** (or project-agreed terminal state) **after** tests/build pass per **Integrator Notes** / acceptance described in the row and **`BUILD_BRIEF.md`**.

---

## Dependency and ordering (no `Depends on` links)

Unlike bases that link predecessor rows, this ledger relies on:

- **`Queue Order`** (lower = sooner among eligible rows).
- **`Vertical Slice`** and **Inventory** links for scope boundaries.
- **`Blocked`** + **`Error Log`** for hard stops.
- Human/orchestrator judgment documented in **`Integrator Notes`** or **ChiefArchitect** session reports.

Do not assume a **`Step ID`** column; identify rows by **`Work Title`** and record id when updating Airtable.

---

## Mapping to `road map.md`

There is **no fixed Step ID ↔ section matrix** in Airtable for Rescue. Orchestrators should:

1. Read **`road map.md`** for phase intent and workstream names.
2. Filter **`Production Ledger`** by **Status**, **Queue Order**, and linked **Vertical Slice** / **Design page** to match the active roadmap thread.
3. Align **Design Pages** roadmap rank (**`Automation/docs/DESIGN_PAGES.md`**, **`INVENTORY_ROADMAP_RANKING.md`**) with ledger **Queue Order** when both exist.

---

## MCP usage (quick reference)

- **Server:** **`user-airtable`** (see **`AGENTS.md`**). Read tool descriptors under **`mcps/user-airtable/tools/`** before calling.
- **List queue:** `list_records` / `search_records` on **`Production Ledger`**, filter **`Status`** not terminal (e.g. not **`Integrated - Local OK`** / **`Skipped`** as appropriate), sort **`Queue Order`**.
- **Before work:** Check **`Session Lock`** — coordinate so two agents do not take the same row.
- **Update on completion:** Patch **`Status`**, **`Integrator Notes`**, **`Integration Completed At`** when locally verified; chunk large updates per MCP limits.

---

## Related repo docs

| Doc | Use |
|-----|-----|
| **`road map.md`** | Phases, workstreams, product boundaries. |
| **`AGENTS.md`** | Base name, MCP id, commands. |
| **`Automation/docs/LEDGER_SCHEMA.md`** | Full Production Ledger field list. |
| **`.cursor/rules/airtable-execution-control-plane.mdc`** | Batching and before/during/after behavior. |
| **`docs/agents/FAIL_TO_HUMAN.md`** | When to stop instead of updating Status optimistically. |
