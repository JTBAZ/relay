# Escape Hatch EH-052 milestone evidence

**Status:** Builder freeze (preview_only provider policy router)  
**Completed:** 2026-07-23  
**Implementation builder:** Cursor Grok 4.5 High  
**Slice:** EH-052 — Provider policy router  
**Next dependency:** EH-053 — Lawful alternate billing recipe (human approval)  
**productionSafe:** `false` (unchanged)

## Scope

- Dated `PROVIDER_POLICY_MATRIX` (Stripe restricted-businesses checked **2026-07-23**; official page last updated 2026-05-13)
- Content/use attestation file `data/content-use-attestation.json` (non-secret; fail closed on corrupt/secret-looking keys)
- Recipe router: Stripe eligible / archive+Patreon / EH-053 pending
- `assertIndependentCheckoutAllowed` gates `startIndependentCheckout` + `/api/billing/checkout` (403)
- Admin `/admin/billing/policy` + `POST /api/admin/billing/attestation`

## Automated evidence

| Command | Exit | Result |
|---|---:|---|
| `npm run typecheck --prefix packages/escape-hatch` | 0 | Package TypeScript passed |
| `npm test --prefix packages/escape-hatch` | 0 | **22/22 files, 341/341 tests** |
| `npx tsx packages/escape-hatch/src/cli.ts status --json` | 0 | Slice **EH-052**; next **EH-053**; `productionSafe: false` |

## Residual

- EH-053 alternate processor requires human approval
- Attestation is file-local preview storage
- Milestone 3 browser/security gate remains open
