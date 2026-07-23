# ESCAPE_HATCH_EH_061_EVIDENCE

**Slice:** EH-061 Tiers/patrons CMS  
**Date:** 2026-07-23  
**productionSafe:** false  
**Builder:** Cursor Grok 4.5 High

## Delivered

1. **Tier contract** — optional `retired`, `benefit_copy` on `CloneTierRule`.
2. **Tier CMS** — `lib/cms/tiers.ts` + `POST /api/admin/tiers`; `AdminTierEditor` on `/admin/tiers`; retired tiers omitted from public `/tiers` catalog.
3. **Patrons** — `/admin/patrons` + `data/manual-grants.json` via `lib/cms/grants.ts`; GET/POST/DELETE `/api/admin/grants` (upsert, revoke, access inspect).
4. **Evaluator wiring** — local manual grants merged in `evaluateCurrentAccess` for Path A/B members and soft personas (provider `none`).
5. **Persona preview** — `AdminPersonaPreview` uses the same `evaluateAccess` path.
6. **Session control** — `POST /api/admin/sessions/revoke` for portable Path B only.

## Explicit non-claims / deferrals

- Supabase admin session revoke, lawful customer export, live Customer Portal from `/account`.
- Full 8-persona browser Milestone 3 gate.
- `productionSafe` remains false.

## Verification

- Kit unit tests: `escape-hatch-cms-tiers-patrons.test.ts` + full `packages/escape-hatch` suite.
- Status: `ESCAPE_HATCH_SLICE = EH-061`, next `EH-062`.
