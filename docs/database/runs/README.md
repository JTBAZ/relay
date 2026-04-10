# DB Integration Pipeline — run prompts

Each file is a **standalone** prompt: **orientation** (table + Step IDs) + **Universal preamble** + **task body** + **handoff** to the next run.

| Run | File | Milestone (summary) |
|-----|------|----------------------|
| 01 | [run-01.md](run-01.md) | M1 · Local Postgres |
| 02 | [run-02.md](run-02.md) | M1 · Prisma bootstrap |
| 03 | [run-03.md](run-03.md) | M1 · Prisma client singleton |
| 04 | [run-04.md](run-04.md) | M1 · Migration CI + Windows helper |
| 05 | [run-05.md](run-05.md) | M2 · Identity schema |
| 06 | [run-06.md](run-06.md) | M2 · Identity DB stores |
| 07 | [run-07.md](run-07.md) | M2 · Identity wiring + backfill |
| 08 | [run-08.md](run-08.md) | M3 · Canonical schema |
| 09 | [run-09.md](run-09.md) | M3 · Canonical DB stores |
| 10 | [run-10.md](run-10.md) | M3 · Canonical backfill + wire |
| 11 | [run-11.md](run-11.md) | M4 · Curation schema |
| 12 | [run-12.md](run-12.md) | M4 · Curation DB stores |
| 13 | [run-13.md](run-13.md) | M4 · Curation wire + backfill |
| 14 | [run-14.md](run-14.md) | M5 · Operations + DLQ + events |
| 15 | [run-15.md](run-15.md) | M6 · Analytics |
| 16 | [run-16.md](run-16.md) | M7 · Patron engagement |
| 17 | [run-17.md](run-17.md) | M8 · Part 2 backend stores |
| 18 | [run-18.md](run-18.md) | M9 · Future stubs |
| 19 | [run-19.md](run-19.md) | M10 · Verification + cleanup |

**Regenerate** (after editing `_generate_runs.py`): `python docs/database/runs/_generate_runs.py`

**Index:** [`../sub-agent-prompts.md`](../sub-agent-prompts.md) (batch instructions + parallel matrix).

**Airtable (DB Integration Pipeline):** each step’s **Doc reference** points at the GitHub URL for this run file; **Next run prompt** points at the following run (blank for M10 terminal steps). Links in generated files assume `https://github.com/JTBAZ/relay` — if your canonical remote differs, update Airtable or regenerate with `_generate_runs.py` after changing the base URL in that script.
