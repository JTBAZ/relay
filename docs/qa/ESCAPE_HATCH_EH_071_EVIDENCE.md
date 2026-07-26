# ESCAPE_HATCH_EH_071_EVIDENCE

**Slice:** EH-071 Portable Docker path  
**Date:** 2026-07-23  
**productionSafe:** false  
**Builder:** Cursor Grok 4.5 High

## Delivered

1. **Path B recipe** — `deploy/docker/compose.path-b.yml`, `Caddyfile.sample`, README (MojoHost = policy candidate, not wizard-supported).
2. **Fixture rehearsal** — `lib/deploy/docker-path.ts` injectable build/up → promote → rollback (shared state with EH-070).
3. **Recipe inventory** — `lib/deploy/path-b-recipe.ts` + Health item; MojoHost honesty.
4. **Admin** — `/admin/deploy` Docker Path B section; API `path: docker`.
5. **Manifest / OPERATIONS** — Docker target notes updated for EH-071.

## Explicit non-claims / deferrals

- Required live `docker build` / compose in CI.
- Live ACME/DNS/TLS probes.
- MojoHost as supported/wizard host.
- Transactional email (**EH-072**), backup (**EH-073**), deploy wizard (**EH-074**).
- `productionSafe` remains false.

## Verification

- Kit unit tests: `escape-hatch-deploy-docker.test.ts` + full `packages/escape-hatch` suite.
- Status: `ESCAPE_HATCH_SLICE = EH-071`, next `EH-072`.
