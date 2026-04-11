# T-002 — [Shipped] Slice 2 — Cookie vs OAuth tier access alignment

## Goal

This slice is **already shipped**. Work here is limited to **alignment fixes** between cookie-based and OAuth tier mapping for Patreon ingest, using existing helpers (e.g. `map-patreon-to-ingest`, `enrichTiersFromCampaignPostsList`).

## Scope / non-goals

- **In scope:** Consistency and bugfixes on tier mapping for both paths; tests under patreon tier mapping.
- **Non-goals:** Broad auth redesign; unrelated Patreon API surface changes.

## Validation

- Run `patreon-tier-mapping` and `patreon-cookie-oauth-body` (or equivalent) tests referenced in the milestone notes.
- `npm run test` at repo root for touched packages.

## Handoff

After success, write **Delta Out** and follow **Runs** logging in `docs/database/AIRTABLE_AUTOPIPELINE.md`.
