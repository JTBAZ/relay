# Multi-tenant + Supabase migration — agent orientation

Use this document at the **start of a new agent session** when executing work tracked in **Airtable → Multi Tenant Changes**. It points to the right **architecture docs**, **run prompts**, and **queue rules** so implementation matches the plan (Option B identity + optional Supabase cloud path).

---

## Paste into new agent session

Copy everything inside the fence below into the chat **system** or **first user** message when the assignee will run **Airtable-tracked** MIG / MT work.

```text
You are a coding agent on the Rescue / Relay repo. Your task is to execute rows from the Airtable table **Multi Tenant Changes** (Relay Database Tracker) for multi-tenant identity and/or Supabase cloud migration — not the Project tracker Production Ledger, and not the DB Integration Pipeline (roadmap steps 1.1.1, …).

AIRTABLE
- Base ID: appDbIOVX38X6U8Sf
- Table: Multi Tenant Changes · table id tbl9PWH9Q0tvKOmKa
- Step IDs: **MIG-xx** (Supabase / cloud migration checklist) and **MT-xxx** (in-repo batches with mt-run prompts). Same table; **Sort order** lists MIG work first (lower numbers), then MT work — that is prioritization, not “MT blocks MIG” unless a row explicitly Depends on an MT step.

QUEUE RULES
1. Consider only rows with **Pipeline status** = Queued (unless resuming In progress).
2. A row is eligible only if every **Depends on** Step ID is already **Complete** (comma-separated means ALL must be complete).
3. Among eligible rows, prefer the **lowest Sort order** unless the human names a specific **Step ID**.
4. While working a batch: set those rows to **In progress**; when verified, set **Complete** and append **Notes** per row (commands run, PR link, migration name). Never put API keys, tokens, or passwords in Airtable Notes — env **names** only.
5. **Doc reference** on a row is canonical: for **MIG-** rows it is usually `docs/architecture/supabase-migration-work-items.md` (GitHub URL on `main`). For **MT-** rows it is `docs/architecture/multi-tenant-runs/mt-run-NN.md` — open that file and paste the **Full prompt (paste into agent)** fenced block for the whole run batch sharing that Doc reference.

TWO TRACKS (same table)
- **MIG-xx — Supabase migration:** Implement from [`docs/architecture/supabase-migration-work-items.md`](supabase-migration-work-items.md) + [`multi-tenant-cloud-runtime.md`](multi-tenant-cloud-runtime.md). There is no separate mt-run file per MIG step; use the checklist “Done when” column and **Notes** in Airtable.
- **MT-xxx — In-repo multi-tenant runs:** Full prompts live in [`multi-tenant-runs/README.md`](multi-tenant-runs/README.md). **Orientation** (Airtable workflow rules once) is in [`multi-tenant-runs/mt-run-01.md`](multi-tenant-runs/mt-run-01.md) § *Orientation*; runs 02–10 omit that preamble — use only the fenced prompt in each `mt-run-NN.md`.

READ FIRST (repo paths)
1. [`docs/architecture/multi-tenant-option-b.md`](multi-tenant-option-b.md) — Option B: Account, Tenant, TenantMembership.
2. [`docs/architecture/multi-tenant-cloud-runtime.md`](multi-tenant-cloud-runtime.md) — Supabase Auth, DB, R2, paywall assumptions.
3. For MIG work: [`docs/architecture/supabase-migration-work-items.md`](supabase-migration-work-items.md).
4. For MT batch work: the specific [`multi-tenant-runs/mt-run-NN.md`](multi-tenant-runs/README.md) linked from your Airtable **Doc reference** row(s).
5. Repo map and verification expectations: root [`AGENTS.md`](../../AGENTS.md); on failure to verify due to secrets/OAuth/DB, stop per [`.docs/anthropic/FAIL_TO_HUMAN.md`](../../.docs/anthropic/FAIL_TO_HUMAN.md).

ENGINEERING RULES
- Minimal diffs; match existing patterns in `src/identity/`, `prisma/schema.prisma`, `src/server.ts`, `web/`.
- After changes: run the appropriate verify commands for touched packages (e.g. `npm run build`, `npm run test`, `npm run lint --prefix web` as applicable).
- When prudent: **read-check the linked Supabase project** via Cursor MCP **`user-supabase`** (`list_migrations`, `list_tables`, or read-only `execute_sql`) so schema/data changes are reflected remotely — see `.cursor/rules/supabase-mcp-read-check.mdc`. Do not paste secrets.

When done with the assigned Step ID(s), summarize files changed, Airtable rows updated, and any manual follow-up for the human.
```

---

## Canonical links (human-readable)

| Topic | Document |
|-------|----------|
| Airtable field names + workflow | [`AIRTABLE_MULTI_TENANT_CHANGES.md`](AIRTABLE_MULTI_TENANT_CHANGES.md) |
| Identity Option B | [`multi-tenant-option-b.md`](multi-tenant-option-b.md) |
| Cloud runtime (Supabase, R2, etc.) | [`multi-tenant-cloud-runtime.md`](multi-tenant-cloud-runtime.md) |
| MIG checklist (phases 0–6) | [`supabase-migration-work-items.md`](supabase-migration-work-items.md) |
| MT run index + `mt-run-NN.md` | [`multi-tenant-runs/README.md`](multi-tenant-runs/README.md) |
| Supabase MCP read-check (migrations / schema) | [`.cursor/rules/supabase-mcp-read-check.mdc`](../../.cursor/rules/supabase-mcp-read-check.mdc) |

---

## How runs batch in Airtable

- **MIG rows:** One row per checklist ID (**MIG-00**, **MIG-01**, …). **Doc reference** often points at the same `supabase-migration-work-items.md` URL for many rows.
- **MT rows:** Multiple Step IDs (**MT-007**, **MT-008**, …) may share one **Doc reference** (`mt-run-02.md`, …). Completing that run means marking **Complete** on **every** row that shares that URL after one implementation pass.

---

## Related

- [`../database/AIRTABLE_DB_PIPELINE.md`](../database/AIRTABLE_DB_PIPELINE.md) — same *runs* idea for the **other** table in Relay Database Tracker (Postgres integration roadmap).
