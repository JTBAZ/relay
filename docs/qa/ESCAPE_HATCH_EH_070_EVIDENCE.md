# ESCAPE_HATCH_EH_070_EVIDENCE

**Slice:** EH-070 Vercel golden path  
**Date:** 2026-07-23  
**productionSafe:** false  
**Builder:** Cursor Grok 4.5 High

## Delivered

1. **Fixture deploy state** — `data/deploy-state.json` with active + prior-stable pointers (`lib/deploy/state.ts`).
2. **Vercel rehearsal** — injectable preview → promote → rollback (`lib/deploy/vercel-path.ts`); no live Vercel API.
3. **Callbacks / domain** — checklist from `NEXT_PUBLIC_SITE_URL`; unset/placeholder fail closed; provider vs custom mode (`lib/deploy/callbacks.ts`).
4. **Admin** — `/admin/deploy`, `GET/POST /api/admin/deploy`; Health items for deploy version, callbacks, rollback; Connections deployment deep-link.
5. **Adapter honesty** — deployment health `ok:true` only after fixture live pointer; still labeled preview / productionSafe false.

## Explicit non-claims / deferrals

- Live Vercel CLI/API, project linking, real promote/instant rollback.
- Live DNS/TLS probes.
- Docker Path B (**EH-071**), email (**EH-072**), backup (**EH-073**), wizard (**EH-074**).
- `productionSafe` remains false.

## Verification

- Kit unit tests: `escape-hatch-deploy-vercel.test.ts` + full `packages/escape-hatch` suite.
- Status: `ESCAPE_HATCH_SLICE = EH-070`, next `EH-071`.
