# Escape Hatch EH-042 milestone evidence

**Status:** Accepted as a preview-only Relay billing entitlement path for the managed Patreon connector  
**Completed:** 2026-07-22  
**Master planner/reviewer:** Sol  
**Implementation builder:** Cursor Grok 4.5 High ([EH-042 builder](fce284a6-70a8-4c30-94a9-9ab4fa375717))  
**Acceptance close-out:** Sol (contract + freeze gates + security disposition)  
**Slice:** EH-042 — Relay billing entitlement for connector  
**Next dependency:** EH-043 — OAuth choice and migration UX  
**productionSafe:** `false` (unchanged)

## Scope and ownership

EH-042 ships a **separate configurable monthly Relay add-on** that gates managed Patreon verification (EH-041) while leaving creator-owned OAuth (EH-040) independent.

### Relay (`src/escape-hatch/managed-verify-billing/`)
- Product SKU `relay_managed_patreon_connector` — configurable `ESCAPE_HATCH_MANAGED_VERIFY_PRICE_CENTS`, separate invoice identity + cost-coverage notes.
- Entitlement state machine: `active | grace | cancelled | past_due | none` with grace window after cancel / failed payment.
- Stripe-like webhook normalization + HMAC signature verification (fail closed when signature required / secret misconfigured); idempotent by event id.
- Feature flag `ESCAPE_HATCH_MANAGED_VERIFY_BILLING_ENABLED` — when off, connector entitlement denied.
- Gates `createManagedVerifyService` assertion mint when `billingGate` is wired (server mounts both EH-041 + EH-042).
- Cancellation / migration copy: exact last service date, creator_oauth steps, native surfaces continue, patrons not deleted; stale warning signal.
- HTTP: `/api/v1/escape-hatch/managed-verify-billing/{product,entitlement/:siteId,webhook}`.

### Kit (`packages/escape-hatch`)
- Env observation (read-only mirror): `ESCAPE_HATCH_RELAY_CONNECTOR_BILLING_ENABLED`, `…_ENTITLEMENT_STATUS`, `…_LAST_SERVICE_DATE` (`.env.example` + OPERATIONS).
- `/admin/patreon` shows add-on status, grace/cancel last date, migration honesty, kill-switch.
- When billing not entitled: `relay_managed` adapter health degraded/denied; `creator_oauth` still works.
- No kit Stripe Checkout UI for this add-on (Relay-side).
- Status slice **EH-042** → next **EH-043**; `productionSafe` remains **`false`**.

It does **not** implement EH-043 choice UX, EH-050/051 independent site Stripe, or flip `productionSafe`.

## Automated evidence

Builder freeze + Sol acceptance re-run 2026-07-22:

| Command | Exit | Result |
|---|---:|---|
| `npx tsx packages/escape-hatch/src/cli.ts status --json` | 0 | Slice **EH-042**; next **EH-043**; `productionSafe: false` |
| `npm run typecheck --prefix packages/escape-hatch` | 0 | Package TypeScript passed |
| `npm run escape-hatch:test` | 0 | 18 files, **305 tests** passed (incl. `escape-hatch-connector-billing.test.ts`) |
| `npx vitest run tests/escape-hatch-managed-verify-billing.test.ts` | 0 | **9** Relay billing tests passed |

## Security review (mandatory gate)

Security review subagent ([Security Review](80ebca79-9453-4ec5-86fa-b142469dfebb)) scoped to EH-042 uncommitted owned paths.

| Severity | Finding | Disposition |
|---|---|---|
| High (closed) | Unsigned webhooks accepted by default → forged entitlement activation | Closed: signature required by default; unsigned only with explicit `ESCAPE_HATCH_MANAGED_VERIFY_BILLING_SIGNATURE_REQUIRED=0` or `…_ALLOW_UNSIGNED=1`. Missing secret while required → 503 `webhook_secret_required`. |
| Medium (closed) | Webhook HMAC verified against re-serialized JSON (no `express.raw`) | Closed: `POST …/managed-verify-billing/webhook` mounted with `express.raw` before `express.json()` (mirrors `/api/v1/billing/webhook`); handler rejects non-Buffer bodies. |

Controls confirmed:

- Webhook authenticity fail-closed + event-id idempotency.
- Managed-verify assertion mint gated by billing entitlement (`active`/`grace` only).
- Feature flag kill switch denies connector even with active record.
- Cancellation/grace + stale warning; no patron-link deletion; no secrets in API/admin payloads.
- `productionSafe` stays **false**.

## Residual / human deferrals

- In-memory Relay billing store / registry — not durable multi-tenant production storage.
- Kit entitlement status is an env mirror of Relay webhook truth (not live polling).
- Live Stripe Checkout / Customer Portal for the add-on remains Relay billing spine work (not kit Checkout).
- OAuth choice / migration UX screen is **EH-043**.
- Milestone 3 browser personas + broader security gate remains open → `productionSafe: false`.
- Unsigned webhook opt-in is for CI/dev only — never enable on Internet-facing production.
## Privacy / data-processing (names only)

Relay may process for the add-on: site id, creator/billing account id, subscription id, entitlement state, last service date, webhook event ids. Must not retain site Stripe secrets, admin passwords, or premium media. Cancellation must not delete linked patrons.
