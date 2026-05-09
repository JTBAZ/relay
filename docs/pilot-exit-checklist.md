# Pilot exit checklist (scaled from roadmap Part 1 gates)

**Purpose:** P9-test-003 — conscious **pilot vs full** targets before calling the pilot “done.” Product owns final sign-off; engineering fills **evidence** links.

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

## Scale table (example — edit to match your pilot charter)

| Gate (full roadmap idea) | Full-scale example | **Pilot target (N)** | Evidence / link | Met? |
|-------------------------|-------------------|----------------------|-----------------|------|
| Creators complete OAuth without support | 10 | **5** | e.g. Airtable / support log | ☐ |
| Media in library (ingest + export) | 5k assets | **500** | Metrics or DB count | ☐ |
| Patron sessions / feed reads | (your metric) | **(your N)** | Dashboard or logs | ☐ |
| Critical Sev-1 bugs open | 0 | **0** | Issue tracker | ☐ |
| `verify:pilot` green on release candidate | required | **required** | CI / local log | ☐ |

Replace rows with the gates your team actually tracks; keep **pilot N** explicit so nobody confuses pilot with production SLOs.

## Notes

- If a gate is **not in scope** for pilot, mark it “N/A” and record why (same doc or linked decision).
- **Human sign-off:** name + date when product accepts the column “Met?”

See also [pilot-browser-matrix.md](pilot-browser-matrix.md) for UX device coverage (P9-test-006).