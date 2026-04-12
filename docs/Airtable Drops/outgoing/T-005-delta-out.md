# Delta Out — T-005 (Proactive OAuth refresh before automated scrape/sync)

## 1. What “failed” in Airtable (root cause)

The **Runs** row for T-005 (`recAwxCM8A2TykZm2`) shows **CLI exit code 1**, **Outcome error**, **Output Summary `(no output)`**, and **Started At === Finished At**. That indicates the **Cursor `agent` CLI** exited immediately (environment / auth / trust), **not** a failing `npm test` or a missing implementation.

No code defect was identified for T-005 during this audit.

## 2. Implementation (already in repo)

- **`src/auth/auth-service.ts`:** `needsProactivePatreonRefresh`, `ensureFreshAccessForAutomation` (calls `refreshAndRotate` when near expiry, `refresh_failed`, or bad expiry), `PATREON_PROACTIVE_REFRESH_MARGIN_MS` (15m).
- **`src/patreon/patreon-sync-service.ts`:** `ensureFreshAccessForAutomation` at start of **`getSyncState`**, **`scrapeOrSyncImpl`**, **`syncMembers`** (automated + webhook + worker paths go through these).
- **`src/server.ts`:** **`POST /api/v1/auth/patreon/refresh`** → `refreshAndRotate`.
- **Tests:** `tests/patreon-oauth-proactive-refresh.test.ts` (margin / health rules); **`tests/workstream-patreon-scrape.test.ts`** — *“calls Patreon token endpoint to refresh before scrape when access token expires soon”* (proves refresh before `/patreon/scrape` when expiry is inside the proactive window).

## 3. Validation run (this session)

- `npm run test` — targeted T-005-related tests: **pass**.
- Full suite / `npm run build` — per operator (build was run separately).

## 4. Next step hint

- **T-006** can remain **Done** if already verified; T-005 was blocked on **automation noise**, not product readiness.
- Re-run **`run-airtable-autopipeline-task.ps1 -TaskKey T-005`** only if you need a fresh agent transcript; closing the row can use **manual verification** + this delta.
