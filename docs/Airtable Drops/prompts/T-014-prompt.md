# T-014 — P2 — Gallery performance budget at scale (Workstream D)

## Goal

Improve **gallery** performance toward road map targets (e.g. median find <5s, P95 <300ms at scale) via virtualization, query paths, and saved filters as appropriate.

## Scope / non-goals

- **In scope:** `web/` performance work with measurable before/after; avoid regressing accessibility.
- **Non-goals:** Full redesign of gallery IA unless required for performance.

## Validation

- `npm run lint` and `npm run build` in `web/`.
- Document measurement method (browser / profiler / query counts) in Delta Out.

## Handoff

After success, write **Delta Out** and follow **Runs** logging in `docs/database/AIRTABLE_AUTOPIPELINE.md`.
