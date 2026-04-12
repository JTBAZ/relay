# Delta Out — T-013 (Export storage integrity + retrieval SLOs)

## 1. Delta

- **`src/export/export-retrieval-metrics.ts`:** In-process counters for POST `/api/v1/export/media`, GET `/api/v1/export/media/.../content`, GET `.../preview`, POST `/api/v1/export/verify`; optional alerts via `RELAY_EXPORT_HEALTH_MIN_SAMPLES` / `RELAY_EXPORT_HEALTH_MAX_CONTENT_FAILURE_RATIO` (default failure budget 0.1% vs ~99.9% retrieval target).
- **`GET /api/v1/health/export`:** Same envelope pattern as other health routes (`status`, `metrics`, `alerts`, `documentation`). API index HTML lists the route.
- **`ExportService.sampleIntegrityChecks`:** Fisher–Yates random subset (cap 50) + existing `verifyIntegrity` (on-disk SHA-256 vs `export_index`).
- **`POST /api/v1/export/integrity-sample`:** Body `{ creator_id, limit? }` — returns `checked`, `matched`, `mismatched[]`; increments integrity sample counters.
- **`.env.example`:** Documented export health env vars.
- **Tests:** `tests/export-retrieval-metrics.test.ts`, `tests/export-health-route.test.ts`; `workstream-c.export.test.ts` asserts health + integrity-sample.

## 2. Risks / blockers

- Counters are per process since boot; rolling 7d SLO proof still needs log/APM or scheduled scrapes of `GET /api/v1/health/export`.

## 3. Next step hint

Continue **T-014** (gallery performance budget) per Sort Order.

### Ops commands (operator)

- `GET /api/v1/health/export` — retrieval ratios + alerts.
- `POST /api/v1/export/integrity-sample` with `{ "creator_id": "<id>", "limit": 20 }` — checksum sampling.

---

## Airtable **Runs** log (paste)

| Field | Suggested value |
|-------|------------------|
| **Outcome** | `success` |
| **Output Summary** | T-013: export retrieval metrics, GET /health/export, integrity-sample API + ExportService sampling, tests + env. |
| **CLI Exit Code** | `0` |
