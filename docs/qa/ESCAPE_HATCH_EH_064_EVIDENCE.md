# ESCAPE_HATCH_EH_064_EVIDENCE

**Slice:** EH-064 Optional Relay Crosspost API  
**Date:** 2026-07-23  
**productionSafe:** false  
**Builder:** Cursor Grok 4.5 High

## Delivered

1. **Scoped tokens** — `lib/relay-crosspost/tokens.ts` + `data/relay-crosspost-tokens.json` (hashed secrets, prefix-only list, revoke/expiry).
2. **Inbound API** — `POST /api/relay/crosspost/posts` with Bearer scopes (`crosspost:draft` / `crosspost:publish`); never under `/api/admin/*` elevation.
3. **Ingest** — CMS upsert with `skip_local_edit_mark`; sync-state `origin: "crossposted"` + stable `upstream_id`.
4. **Audit / idempotency** — `data/relay-crosspost-audit.json` (no secrets); `Idempotency-Key` replay.
5. **Admin** — `/admin/crosspost` mint/revoke UI; Connections Crosspost card; revoke does not affect native CMS.

## Explicit non-claims / deferrals

- Relay Studio client and live network E2E.
- Remote media upload, schedule, rich HTML, SQL token store.
- `productionSafe` remains false.

## Verification

- Kit unit tests: `escape-hatch-relay-crosspost.test.ts` + full `packages/escape-hatch` suite.
- Status: `ESCAPE_HATCH_SLICE = EH-064`, next `EH-070`.
