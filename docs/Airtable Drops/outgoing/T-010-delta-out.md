# Delta Out — T-010 (Part 1 A exit gate instrumentation)

## 1. Delta

- **`src/auth/part1a-gate-metrics.ts`:** In-process counters (since boot): creator OAuth exchange attempts/success/failure (`PatreonAuthService.exchangeCodeAndPersist`), patron OAuth attempts/success/failure (`exchangePatreonPatronOAuth`), token refresh attempts/success/failure (`PatreonAuthService.refreshAndRotate`, including proactive refresh via `ensureFreshAccessForAutomation`).
- **`GET /api/v1/health/part1a`:** JSON `successEnvelope` with `status` `ok` \| `degraded`, `metrics` (includes `uptime_ms`, `boot_iso`), ratios (`creator_oauth_completion_ratio`, `patron_oauth_completion_ratio`, `token_refresh_failure_ratio`), `alerts[]`, `documentation[]` (SLO context: calendar-day proof needs log/metric pipeline).
- **Env (optional alerts):** `RELAY_PART1A_MIN_SAMPLES_FOR_ALERTS`, `RELAY_PART1A_ALERT_CREATOR_OAUTH_MIN_COMPLETION`, `RELAY_PART1A_ALERT_TOKEN_REFRESH_MAX_FAILURE_RATIO` — see root `.env.example`.
- **Tests:** `tests/part1a-gate-metrics.test.ts`, `tests/part1a-health-route.test.ts`.

## 2. Risks / blockers

- Counters reset on deploy/restart; a **daily** “under 1% refresh failure” SLO needs external TSDB/log aggregation or midnight resets, not this endpoint alone.

## 3. Next step hint

Continue to **T-011** per Sort Order (`Next Task` link).

### How to read gates (operator)

1. `GET http://127.0.0.1:8787/api/v1/health/part1a` (or your `PORT`).
2. Watch `data.creator_oauth_completion_ratio` vs ~0.95 and `data.token_refresh_failure_ratio` vs ~0.01 **after enough samples** (`RELAY_PART1A_MIN_SAMPLES_FOR_ALERTS`).
3. For production dashboards, scrape the JSON or ship `patreon_oauth_connected` / `patreon_token_refreshed` events from the existing event bus if wired to analytics.

---

## Airtable **Runs** log (paste)

| Field | Suggested value |
|-------|------------------|
| **Outcome** | `success` |
| **Output Summary** | T-010: Part 1 A metrics module + `/api/v1/health/part1a`; OAuth/refresh instrumentation; env alerts; tests. |
| **CLI Exit Code** | `0` |
