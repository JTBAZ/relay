# T-009 — P1 — Ingest + DLQ health (Workstream B gates)

## Goal

Improve **observability and gates** for ingest quality: duplicate rate, DLQ rate, idempotent ingest behavior. Monitor **IngestRetryQueue** + DLQ and define alert thresholds per road map Workstream B.

## Scope / non-goals

- **In scope:** Metrics, logging, or dashboards/queries; clear thresholds and documentation.
- **Non-goals:** Rewriting entire ingest pipeline unless required for measurement.

## Validation

- `npm run test` / `npm run build` for code changes.
- Document how to query or view the new signals (short section in Delta Out).

## Handoff

After success, write **Delta Out** and follow **Runs** logging in `docs/database/AIRTABLE_AUTOPIPELINE.md`.
