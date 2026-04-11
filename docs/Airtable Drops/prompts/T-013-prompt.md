# T-013 — P2 — Export storage integrity + retrieval SLOs (Workstream C)

## Goal

Align export **object storage** and **export_index** behavior with road map **retrieval SLOs** (e.g. 99.9% rolling window) and **checksum sampling** where specified.

## Scope / non-goals

- **In scope:** Integrity checks, monitoring hooks, fixes tied to export storage paths.
- **Non-goals:** Unrelated export UX unless required for integrity reporting.

## Validation

- `npm run test` / `npm run build` for backend changes.
- Note any ops commands or sampling scripts in Delta Out.

## Handoff

After success, write **Delta Out** and follow **Runs** logging in `docs/database/AIRTABLE_AUTOPIPELINE.md`.
