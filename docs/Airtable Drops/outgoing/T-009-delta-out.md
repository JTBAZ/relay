# Delta Out — T-009 (Ingest + DLQ health / Workstream B gates)

## 1. Delta

- **`src/ingest/ingest-health-metrics.ts`:** In-process counters since boot: batches completed, `idempotent_skips_total`, `rows_mutated_total`, `posts_written_total`, `dlq_appends_total`, `retry_failures_before_dlq_total`. `recordIngestBatchResult` wired from `IngestService.runBatch`. `IngestRetryQueue` records each retry failure and one `recordDlqAppend` when a job lands on the DLQ.
- **`DeadLetterQueue.count()`:** Added to file + DB implementations — `DbDeadLetterQueue` uses `COUNT` on `ingest_dlq` rows; file backend uses array length.
- **`GET /api/v1/health/ingest`:** JSON envelope (`successEnvelope`) with `status` `ok` | `degraded`, `metrics`, `duplicate_handling_ratio`, `dlq_per_batch`, `pending_retry_jobs`, `dlq_record_count`, `alerts[]`. Alerts use optional env thresholds (see `.env.example`).
- **Tests:** `tests/ingest-health-metrics.test.ts`, `tests/ingest-health-route.test.ts`; `m5-operations-db` covers `count()`; `workstream-b.retry-dlq` resets metrics in `beforeEach`.

## 2. Risks / blockers

- Counters are **per process**; restart resets them. Persistent DLQ depth comes from `dlq_record_count` (DB or file).
- High-cardinality production: prefer scraping `GET /api/v1/health/ingest` from your monitor or forwarding `alerts` to paging.

## 3. Next step hint

Open **T-010** per Sort Order; confirm scope against the linked prompt file.

### How to query signals (operator)

1. **HTTP:** `curl -s http://127.0.0.1:8787/api/v1/health/ingest` (same port as `PORT` / default 8787). Check `data.status`, `data.alerts`, and `data.metrics`.
2. **Postgres DLQ:** `SELECT count(*) FROM "JobRun" WHERE kind = 'ingest_dlq';` (or your migrated table name) when `RELAY_DB_STORE_DLQ=1`.
3. **File DLQ:** row count in `RELAY_INGEST_DLQ_PATH` / default `.relay-data/ingest_dlq.json` array length.

---

## Airtable **Runs** log (paste)

| Field | Suggested value |
|-------|------------------|
| **Outcome** | `success` |
| **Output Summary** | T-009: ingest health metrics + DLQ count API; env thresholds; tests. |
| **CLI Exit Code** | `0` |
