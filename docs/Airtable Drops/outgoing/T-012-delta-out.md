# Delta Out — T-012 (Analytics foundation / Action Center)

## 1. Delta

- **Recommendation engine (`recommendation-engine.ts`):** Added **`series_continuation`** when the top tag has ≥2 posts; relaxed **`tier_upgrade_opportunity`** (≥3 posts, ≥55% tier concentration, ≥1 active tier).
- **Insight job metrics (`insight-job-metrics.ts`):** In-process counters for `POST /api/v1/analytics/generate`; optional alerts via `RELAY_INSIGHT_JOB_ALERT_MIN_SAMPLES` / `RELAY_INSIGHT_JOB_ALERT_MAX_FAILURE_RATIO`.
- **API (`server.ts`):** Generate route records attempt/success/failure; errors return **500** `ANALYTICS_GENERATE_ERROR`. New **`GET /api/v1/health/analytics`** (same envelope shape as other health routes); index HTML lists the route.
- **Web:** **`/action-center`** — `ActionCenterView` lists cards (signal, diagnosis, recommendation, confidence, expected impact), **Refresh insights**, **Accept** / **Dismiss**, optional insight-job summary from **`GET /api/v1/health/analytics`**. **`relay-api.ts`** helpers: `fetchActionCenterCards`, `postAnalyticsGenerate`, `postActionCenterAccept`, `postActionCenterDismiss`, `fetchAnalyticsHealth`. **`AppNav`:** Action Center link + primary shell styling.
- **Tests:** `tests/insight-job-metrics.test.ts`, `tests/analytics-health-route.test.ts`; `workstream-e.analytics.test.ts` asserts health metrics after generate.
- **`.env.example`:** Documented insight-job alert env vars.

## 2. Risks / blockers

- Insight counters reset on API restart; external scraping still needed for calendar SLO proof.

## 3. Next step hint

Operator: mark Milestone **T-012** Done in Patreon queue; set **Next Task** Delta In per Sort Order.

### Manual spot-check (operator)

1. API: `GET /api/v1/health/analytics` — `status`, `metrics`, `documentation`.
2. Web: `/action-center` with `NEXT_PUBLIC_RELAY_CREATOR_ID` + running API — **Refresh insights**, open cards, Accept/Dismiss.

---

## Airtable **Runs** log (paste)

| Field | Suggested value |
|-------|------------------|
| **Outcome** | `success` |
| **Output Summary** | T-012: Action Center UI, insight metrics + GET /api/v1/health/analytics, engine third card + tier relax, tests + env docs. |
| **CLI Exit Code** | `0` |
