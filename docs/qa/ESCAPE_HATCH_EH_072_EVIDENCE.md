# ESCAPE_HATCH_EH_072_EVIDENCE

**Slice:** EH-072 Transactional email  
**Date:** 2026-07-23  
**productionSafe:** false  
**Builder:** Cursor Grok 4.5 High

## Delivered

1. **Provider-neutral transport** — `lib/email/` with memory outbox + injectable Resend client.
2. **Golden-path recipe** — Resend HTTP (`ESCAPE_HATCH_EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM`) — names only.
3. **Five message types** — verification, recovery, security alert, subscription notice, connector failure.
4. **Delivery checklist** — SPF/DKIM/DMARC/sender/test-inbox/link-origin/redaction guidance (no live DNS).
5. **Admin** — `GET/POST /api/admin/email` fixture send; Connections/Health email surfaces updated.
6. **Policy matrix** — email row → `preview_only` Resend recipe (not launch-certified).

## Explicit non-claims / deferrals

- Live Resend/SMTP in CI; adult ToS selection / wizard unlock.
- Patrons “resend verification” UX; billing receipt duplication.
- Backup/restore (**EH-073**), deploy wizard (**EH-074**).
- `productionSafe` remains false.

## Verification

- Kit unit tests: `escape-hatch-email.test.ts` + full `packages/escape-hatch` suite.
- Status: `ESCAPE_HATCH_SLICE = EH-072`, next `EH-073`.
