# T-011 — P1 — Artist Library + Designer UI completion (~remaining 30%)

## Goal

Close remaining **Artist Library + Designer** UX gaps per `docs/pattern-library.md`: sync pill, Patreon menu polish, empty/error states, and consistency with Relay UI patterns.

## Scope / non-goals

- **In scope:** `web/` UI aligned with existing components; guardrails in `docs/qa/UX_ACCEPTANCE_GUARDRAILS.md` where applicable.
- **Non-goals:** Implementing unattended sync core (T-007) here; **do not** swap creator vs patron OAuth routes.

## Validation

- `npm run lint` and `npm run build` in `web/`.
- Manual spot-check of touched routes (document in Delta Out).

## Handoff

After success, write **Delta Out** and follow **Runs** logging in `docs/database/AIRTABLE_AUTOPIPELINE.md`. Coordinate with **Project tracker** Production Ledger if overlapping UI units.

**Note:** This row may have **Automation Allowed** off while humans own the surface; only run when the Airtable row allows it.
