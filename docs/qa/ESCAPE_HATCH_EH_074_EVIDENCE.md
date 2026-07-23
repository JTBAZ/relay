# ESCAPE_HATCH_EH_074_EVIDENCE

**Slice:** EH-074 Deployment wizard  
**Date:** 2026-07-23  
**productionSafe:** false  
**Builder:** Cursor Grok 4.5 High

## Delivered

1. **Launch wizard** on `/admin/deploy` — Path A (Vercel) / Path B (Docker) choice, ordered steps, stuck-note recovery, diagnostics ack.
2. **Validation** — `assessLaunchReadiness` aggregates callbacks, deploy pointer, Path B recipe (when B), email advisory, EH-073 backup gate.
3. **Backup-before-complete** — `completeLaunchWizard` fail-closed unless backup freshness + restore rehearsal + smoke approval + blocking gates pass.
4. **API** — `GET /api/admin/deploy?wizard=1` and POST `wizard_*` actions (no live providers).
5. **Health** — launch wizard item with next safe action.

## Explicit non-claims / deferrals

- Live Vercel CLI/API, live Docker daemon/Compose, live ACME/DNS/TLS.
- MojoHost as supported Path B host.
- Ownership packet (**EH-080**), golden journeys (**EH-081**), final security/independence (**EH-082**).
- `productionSafe` remains false.

## Verification

- Kit unit tests: `escape-hatch-deploy-wizard.test.ts` + full `packages/escape-hatch` suite.
- Status: `ESCAPE_HATCH_SLICE = EH-074`, next `EH-080`.
