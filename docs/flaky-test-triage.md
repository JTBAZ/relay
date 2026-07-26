# Flaky test triage (pilot)

**Purpose:** P9-test-005 — how we handle **intermittent** failures in Vitest / CI without masking real regressions.

## CI today

- **GitHub Actions** [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs `npm test` with **no automatic per-test retries** unless you add them.
- **Redis integration** job runs `npm run test:jobs` separately; failures there are usually env/service issues, not “flaky unit” noise.

## Policy

1. **First failure** — Treat as real; reproduce locally with the same command as CI (`npm test` or the single file path).
2. **If confirmed flaky** — Open a tracked issue labeled **`flaky-test`** (or team equivalent) with **fix-by date** and **owner**.
3. **Short-term quarantine** — Prefer fixing root cause within **one sprint**. If you must silence CI temporarily:
   - Use `describe.skip` / `it.skip` **only** with a comment linking the issue, **or**
   - Move the test behind an explicit env gate (e.g. `SKIP_FLAKY=1` in CI only after team agreement — **discouraged** for pilot).
4. **Retries** — If you add Vitest `--retry` (or GitHub Action step retries), document the count here and in workflow comments; retries should be **low** (e.g. 1–2) so true failures still fail the job quickly.

## Anti-patterns

- Permanently skipping tests with no issue.
- Raising retries to “make CI green” without fixing timing, mocks, or shared global state.
