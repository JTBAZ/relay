# Pilot exit checklist (scaled from roadmap Part 1 gates)

**Purpose:** P9-test-003 — conscious **pilot vs full** targets before calling **Stage 1** “done.” Product owns final sign-off; engineering fills **evidence** links.

**Stage boundary:** This checklist is **Stage 1 — Functionality** only ([pilot-two-stage-charter.md](pilot-two-stage-charter.md)). Meeting these gates does **not** authorize Stripe live charges, Tip beta for the cohort, or `RELAY_FAN_PREMIUM_ENABLED`. Stage 2 has its own entry blockers and exit draft in that charter.

**Automation before sign-off:** `npm run verify:pilot` (see [pilot-build-plan.md](pilot-build-plan.md) P9-test-001).

## CI vs local `verify:pilot` (P9-test-001)

On pull requests, [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) is the **automation source of truth**:

| Local command | CI equivalent |
|---------------|----------------|
| `npm run build` | `backend` job → Prisma generate + migrate + `npm run build` |
| `npm test` | `backend` job → `npm test` |
| — | `backend` job → `node scripts/m10-token-log-scan.mjs` (**stricter** than `verify:pilot`; matches `verify:m10`) |
| `npm run lint --prefix web` | `web` job → `npm run lint --prefix web` |
| `npm run build --prefix web` | `web` job → `npm run build --prefix web` |
| `npm run test:jobs` | `redis-jobs` job → BullMQ integration tests |

Together, green CI implies the same checks as `verify:pilot` **plus** migrate deploy, token-log scan, and Redis job tests. Before a **release candidate**, run **`npm run verify:pilot`** locally (or rely on CI if all jobs passed on the same commit).

**Security (P8-sec-006):** Complete the manual steps at the end of [pilot-security-headers.md](pilot-security-headers.md).

---

## Scale table (Stage 1 — edit only with Stage 1 charter in mind)

| Gate (full roadmap idea) | Full-scale example | **Stage 1 target (N)** | Evidence / link | Met? |
|-------------------------|-------------------|----------------------|-----------------|------|
| Creators complete OAuth without support | 10 | **5** | e.g. Airtable / support log | ☐ product |
| Patron sessions / feed reads | (your metric) | **25** | Dashboard or logs | ☐ product |
| Critical Sev-1 bugs open | 0 | **0** | Issue tracker | ☐ |
| `verify:pilot` green on release candidate | required | **required** | CI / local log | ☑ engineering (2026-05-23) |
| UX gates A–J (PUX + PILOT-011…016) | required | **required** | `docs/pilot-ux-dev-login.md` | ☑ automated (2026-05-23) |
| Browser matrix spot-check | Chrome blocking | **required** | `docs/pilot-browser-matrix.md` | ☐ QA/product |
| Prod `RELAY_DB_STORE_*` + RLS | required | **required** | `scripts/pilot-env-check.mjs` | ☐ staging |

Replace rows with the gates your team actually tracks; keep **Stage 1 N** explicit so nobody confuses Stage 1 with production SLOs or Stage 2 monetization gates.

## Notes

- If a gate is **not in scope** for Stage 1, mark it “N/A” and record why (same doc or linked decision). Stripe / Tips / fan premium are **Stage 2** — mark N/A here, not as Stage 1 blockers.
- **Human sign-off:** name + date when product accepts the column “Met?”
- After Stage 1 exit, proceed to Stage 2 prep only per [pilot-two-stage-charter.md](pilot-two-stage-charter.md).

See also [pilot-browser-matrix.md](pilot-browser-matrix.md) for UX device coverage (P9-test-006).