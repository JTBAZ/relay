# T-016 — Later — Patron entitlement refresh at scale (Part 3 prereq)

## Goal

**Do not implement in this run** unless product explicitly removes the deferral. This task tracks **Fan** paywall truth: scheduled + on-demand **entitlement refresh** and webhooks at scale, **after** creator pipeline walls are trusted per `docs/part1-patreon-pipeline-focus.md`.

## Scope / non-goals

- **In scope when resumed:** Design or implementation per Part 3 plan; coordination with Fan Relay routes and entitlements.
- **Non-goals:** Starting work while the Airtable row is **Stopped_OffScript** / **Off Script** without human approval.

## Validation

N/A for stub-only; when active, add tests and `npm run test` / `npm run build` per changes.

## Handoff

If you only confirmed deferral: set **Stopped_OffScript** / **Off Script Reason** in Airtable; no code. If resuming: follow **Delta Out** + **Runs** logging in `docs/database/AIRTABLE_AUTOPIPELINE.md`.
