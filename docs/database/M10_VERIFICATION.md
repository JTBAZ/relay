# M10 — Verification, cleanup, and handoff

**Purpose:** Close the database integration track after M1–M9: run the checks below, then coordinate **human gates** (production flag removal, `.relay-data` archive dates) with the owner.

**Canonical plan:** [`integration-roadmap.md`](integration-roadmap.md) milestone **M10**.

---

## 10.1 — Automated verification (run locally / CI)

| Step | Command | Notes |
|------|---------|--------|
| **10.1.1** | Root: `npm run build` and `npm run test` | Required on every PR; zero regressions. |
| **10.1.1 (optional strict)** | Set **all** `RELAY_DB_STORE_*=1` in `.env` **and** pass `prisma` into `createApp` tests that exercise DB stores | Requires `DATABASE_URL`, `npx prisma migrate deploy`, and domain backfills before flags make sense. Most Vitest suites still use file-backed fixtures; use this for staging / pre-prod smoke, not as the default CI matrix unless you add a dedicated job. |
| **10.1.2** | `cd web && npm run lint && npm run build` | Next.js quality gate. |
| **10.1.3** | Manual / QA per [`docs/qa/UX_ACCEPTANCE_GUARDRAILS.md`](../qa/UX_ACCEPTANCE_GUARDRAILS.md) | Personas and API rules; stop on missing OAuth per [`.docs/anthropic/FAIL_TO_HUMAN.md`](../../.docs/anthropic/FAIL_TO_HUMAN.md). |
| **10.1.4** | `tests/m10-cross-tenant-isolation.test.ts` (mock-level) | Proves DB store query shapes include `creator_id` / `patronUserId` scoping. Full RLS + two live creator accounts is a staging exercise. |
| **10.1.5** | `node scripts/m10-token-log-scan.mjs` (also part of `npm run verify:m10`) | Blocks obvious `console.*` + token patterns under `src/`. Confirm broader review in code review; spot-check `grep` for `Bearer ` / `refresh_token` in logging paths. Guardrails: [`UX_ACCEPTANCE_GUARDRAILS.md`](../qa/UX_ACCEPTANCE_GUARDRAILS.md) §3. |

**One-liner (default CI parity):** from repo root, `npm run verify:m10` (see root `package.json`).

---

## 10.2 — Cleanup (human-gated)

| Step | Action |
|------|--------|
| **10.2.1–10.2.2** | **Remove `File*Store` branches and `RELAY_DB_STORE_*` flags** in `src/server.ts` only after production soak and owner sign-off. Until then, flags remain the supported cutover mechanism. |
| **10.2.3** | Copy `.relay-data/` to **`relay-data-archive/`** (see [`relay-data-archive/README.md`](../../relay-data-archive/README.md)); do not delete the original until the retention window you choose (e.g. 30-day soak). |
| **10.2.4** | Status column: [`migration-from-relay-data.md`](migration-from-relay-data.md). |

---

## 10.3 — Operations docs (done in repo)

| Step | Location |
|------|----------|
| **10.3.1** | Connection pooling: [`operations-and-security.md`](operations-and-security.md) |
| **10.3.2** | `prisma migrate deploy` prerequisite: same file + [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) |
| **10.3.3** | [`AGENTS.md`](../../AGENTS.md), [`road map.md`](../../road%20map.md) — database integration summary |

---

## Airtable (Relay Database Tracker → DB Integration Pipeline)

Use this table for **step IDs** `10.1.x`, `10.2.x`, `10.3.x` (same scope as [`runs/run-19.md`](runs/run-19.md)).

| Phase | When to set **Pipeline status** = **Complete** |
|-------|--------------------------------------------------|
| **10.1** | Automated verification has been run on a real commit (local and/or CI): root `npm run build` / `npm run test`, `web` lint+build, optional `npm run verify:m10`, cross-tenant test, token-log scan — and any failures are fixed or waived in **Notes**. |
| **10.3** | Operations/docs updates listed in §10.3 are merged (pooling note, CI migrate, `AGENTS.md` / `road map.md` DB narrative, `migration-from-relay-data.md` reflects current reality). |
| **10.2** | **Only after** the repo actually does the cutover: no `File*Store` / `RELAY_DB_STORE_*` branches in `src/server.ts` for migrated domains (per §10.2), `.relay-data` copied per [`relay-data-archive/README.md`](../../relay-data-archive/README.md), and `migration-from-relay-data.md` status updated. If you are **deferring** 10.2 (soak, dummy data, test harness not ready), leave **10.2.x** rows **Queued** or **Blocked** and **Notes** with reason — do **not** mark Complete to match a finished Run 19 prompt alone. |

**Expected mismatch:** Run **19** is one prompt covering **10.1–10.3**; **10.2** is **human-gated** and often finishes **later**. Queued 10.2 rows after 19 is “done” in chat are **normal** until §10.2 work ships.

## Deploy checklist (operators)

1. `DATABASE_URL` from secrets.
2. `npx prisma migrate deploy` before new binary serves traffic.
3. Domain backfills completed before enabling each `RELAY_DB_STORE_*` flag.
4. Optional: PgBouncer / pooler in front of Postgres for serverless or high connection counts — see `operations-and-security.md`.
