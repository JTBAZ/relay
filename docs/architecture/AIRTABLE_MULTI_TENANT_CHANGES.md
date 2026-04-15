# Relay Database Tracker — Multi Tenant Changes

**New agent session:** start with **[`MULTI_TENANT_AGENT_ORIENTATION.md`](MULTI_TENANT_AGENT_ORIENTATION.md)** (copy-paste preamble + read order).

Canonical reference for the **Multi Tenant Changes** Airtable table (multi-tenant identity, Option B). **Run prompts** live in [`multi-tenant-runs/`](multi-tenant-runs/README.md).

## Orientation vs run prompts

- **Airtable + workflow orientation** (base/table IDs, rules, how to update **Pipeline status**) is written once in **[`multi-tenant-runs/mt-run-01.md`](multi-tenant-runs/mt-run-01.md)** § *Orientation*.
- **[`multi-tenant-runs/mt-run-02.md`](multi-tenant-runs/mt-run-02.md)** … **[`mt-run-10.md`](multi-tenant-runs/mt-run-10.md)** contain **only** the technical **Full prompt** for each batch (no repeated orientation preamble).

## Identifiers

| | Value |
|---|--------|
| **Base** | Relay Database Tracker · `appDbIOVX38X6U8Sf` |
| **Table** | Multi Tenant Changes · `tbl9PWH9Q0tvKOmKa` |

## What this is not

| System | Role |
|--------|------|
| **Multi Tenant Changes** | Step IDs **MIG-**xx (Supabase cloud migration — [`supabase-migration-work-items.md`](supabase-migration-work-items.md)) and **MT-*** (in-repo multi-tenant runs — [`multi-tenant-runs/README.md`](multi-tenant-runs/README.md)) |
| **DB Integration Pipeline** | Integration roadmap steps **`1.1.1`**, … — different table |
| **Production Ledger** | Product/v0 queue — do not mix Step IDs |

## Field dictionary (exact names)

See § Field dictionary in the historical spec or your Airtable: **Step ID**, **Sort order**, **Phase**, **Milestone**, **Depends on**, **Pipeline status** (**Queued** / **In progress** / **Complete**), **Doc reference**, **Next run prompt**, **Notes**, **Execution mode**, **Status**, **Assignee**.

## Workflow

1. Pick **Queued** rows whose **Depends on** are all **Complete**; prefer lowest **Sort order**.
2. Open the shared **Doc reference** for that run (or `supabase-migration-work-items.md` for **MIG-** rows); paste the **Full prompt** from the linked `mt-run-NN.md` when the row is **MT-***.
3. Set rows **In progress**, then **Complete** with **Notes** after verification.

---

## Related

- [`multi-tenant-option-b.md`](multi-tenant-option-b.md) — identity **Option B** (`Account`, `Tenant`, `TenantMembership`).
- [`multi-tenant-cloud-runtime.md`](multi-tenant-cloud-runtime.md) — Supabase Auth, ingest, R2, paywall (runtime schema).
- [`supabase-migration-work-items.md`](supabase-migration-work-items.md) — phased migration checklist (**MIG-**xx).
- [`../database/AIRTABLE_DB_PIPELINE.md`](../database/AIRTABLE_DB_PIPELINE.md) — same *runs* pattern for Postgres integration roadmap (different Airtable table).
- [`multi-tenant-runs/README.md`](multi-tenant-runs/README.md) — index of `mt-run-01` … `mt-run-17` (account-first track **MT-031**–**MT-037** in runs 11–17).
