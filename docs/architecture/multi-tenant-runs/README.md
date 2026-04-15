# Multi Tenant Changes — run prompts

**New agent — Airtable execution:** **[`../MULTI_TENANT_AGENT_ORIENTATION.md`](../MULTI_TENANT_AGENT_ORIENTATION.md)** (pasteable preamble, MIG vs MT, queue rules).

**Architecture (read first):** [`../multi-tenant-option-b.md`](../multi-tenant-option-b.md) (identity Option B) · [`../multi-tenant-cloud-runtime.md`](../multi-tenant-cloud-runtime.md) (Supabase + Prisma + Patreon + R2) · [`../supabase-migration-work-items.md`](../supabase-migration-work-items.md) (migration checklist).

Each **`mt-run-NN.md`** contains a **Full prompt (paste into agent)** block for one batch of Airtable steps.

- **Orientation** (Airtable rules, base/table IDs, global agent rules) appears **only** in **[mt-run-01.md](mt-run-01.md)**.
- **Runs 02–10** start with the run title + Step IDs + precondition — paste the fenced prompt only.

**Airtable layout (fields, runs batching):** see [`../AIRTABLE_MULTI_TENANT_CHANGES.md`](../AIRTABLE_MULTI_TENANT_CHANGES.md) if present, or the **Orientation** section inside `mt-run-01.md`.

| Run | File | Step IDs |
|-----|------|----------|
| 01 | [mt-run-01.md](mt-run-01.md) | MT-001 – MT-006 |
| 02 | [mt-run-02.md](mt-run-02.md) | MT-007, MT-008 |
| 03 | [mt-run-03.md](mt-run-03.md) | MT-009, MT-010 |
| 04 | [mt-run-04.md](mt-run-04.md) | MT-011 |
| 05 | [mt-run-05.md](mt-run-05.md) | MT-012, MT-013 |
| 06 | [mt-run-06.md](mt-run-06.md) | MT-014 |
| 07 | [mt-run-07.md](mt-run-07.md) | MT-015 – MT-017 |
| 08 | [mt-run-08.md](mt-run-08.md) | MT-018 – MT-021 |
| 09 | [mt-run-09.md](mt-run-09.md) | MT-022 – MT-025 |
| 10 | [mt-run-10.md](mt-run-10.md) | MT-026 – MT-030 |
| 11 | [mt-run-11.md](mt-run-11.md) | MT-031 |
| 12 | [mt-run-12.md](mt-run-12.md) | MT-032 |
| 13 | [mt-run-13.md](mt-run-13.md) | MT-033 |
| 14 | [mt-run-14.md](mt-run-14.md) | MT-034 |
| 15 | [mt-run-15.md](mt-run-15.md) | MT-035 |
| 16 | [mt-run-16.md](mt-run-16.md) | MT-036 |
| 17 | [mt-run-17.md](mt-run-17.md) | MT-037 |

**Account-first onboarding (runs 11–17)** extends the queue after MT-030: schema → workspace API → Supabase session bridge → OAuth hardening → Patreon web flow → Next.js context → tests/rollout.

**GitHub (`main`):** `https://github.com/JTBAZ/relay/blob/main/docs/architecture/multi-tenant-runs/mt-run-NN.md` — matches **Doc reference** / **Next run prompt** in Airtable when remote is `JTBAZ/relay`.
