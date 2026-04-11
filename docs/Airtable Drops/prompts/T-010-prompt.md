# T-010 — P1 — Part 1 A exit gate instrumentation

## Goal

Instrument **Part 1 A** success criteria from the road map: e.g. **95% OAuth completion without support**, **token refresh failure <1% per day** (or current targets). Deliver **metrics, dashboards, or log queries** that prove the gates.

## Scope / non-goals

- **In scope:** Telemetry, queries, or dashboard definitions; links to where humans verify numbers.
- **Non-goals:** Changing OAuth product flows unless required for measurement only.

## Validation

- `npm run test` / `npm run build` if code emits metrics.
- Short validation note: how to read each gate in production or staging.

## Handoff

After success, write **Delta Out** and follow **Runs** logging in `docs/database/AIRTABLE_AUTOPIPELINE.md`.
