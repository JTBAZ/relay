# Escape Hatch EH-050 milestone evidence

**Status:** Accepted as a preview-only billing provider contract (normalize + entitlement wiring)  
**Completed:** 2026-07-23  
**Implementation builder:** Cursor Grok 4.5 High  
**Master planner / reviewer:** Sol  
**Slice:** EH-050 — Billing provider contract  
**Next dependency:** EH-051 — Stripe eligible-business adapter  
**productionSafe:** `false` (unchanged)

## Scope and ownership

EH-050 ships the shared independent-site **BillingProvider** contract and normalized entitlement event path. It does **not** implement live Stripe Checkout, Customer Portal, or production webhooks (EH-051).

### Kit (`packages/escape-hatch/template`)

- Expanded `BillingProvider` in `lib/adapters/types.ts` (connect, products/prices, checkout, portal, webhook verify, normalize, readiness/policy, sandbox, migration export).
- `lib/billing/`:
  - types: lifecycle events, capability matrix, policy declaration, `BillingEntitlementEvent` (`source: "billing"`)
  - `normalizeWebhookEvent` — signature required; unsigned/malformed fail closed
  - `applyBillingEntitlementEvent` — snapshot upsert for EH-032 merge / `evaluateAccess`
  - readiness reporter + stub default + Stripe fail-closed shell
- Adapter wiring: default `stub`; `ESCAPE_HATCH_BILLING_PROVIDER=stripe` selects shell (still fail closed).
- Env names documented (`.env.example`, `lib/env.ts`) — secrets not required for build.
- `OPERATIONS.md` documents contract boundary + EH-051 Stripe handoff.
- Status slice **EH-050** → next **EH-051**; `productionSafe` remains **`false`**.

### Explicitly out of scope

- EH-051 live Stripe SDK / Checkout / Portal / signed webhook verify
- EH-052 provider policy router
- EH-053 alternate processor
- Weakening Patreon EH-040–043 paths

## Automated evidence

Builder freeze 2026-07-23:

| Command | Exit | Result |
|---|---:|---|
| `npx tsx packages/escape-hatch/src/cli.ts status --json` | 0 | Slice **EH-050**; next **EH-051**; `productionSafe: false` |
| `npm run typecheck --prefix packages/escape-hatch` | 0 | Package TypeScript passed |
| `npm run escape-hatch:test` | 0 | 20 files, **326** tests passed (incl. `escape-hatch-billing-contract.test.ts` — 13 tests) |

## Independent master acceptance close-out

Sol reran the acceptance gate on 2026-07-23 against the uncommitted EH-050 implementation:

| Command | Exit | Result |
|---|---:|---|
| `npx tsx packages/escape-hatch/src/cli.ts status --json` | 0 | Slice **EH-050**; next **EH-051 — Stripe eligible-business adapter**; `productionSafe: false` |
| `npm run typecheck --prefix packages/escape-hatch` | 0 | Package TypeScript passed |
| `npm run escape-hatch:test` | 0 | **20/20 files passed; 326/326 tests passed** |

**Acceptance disposition:** Pass. EH-050 is accepted as a preview-only provider contract; no acceptance blocker remains. Live Stripe money paths and signed webhook verification remain explicitly deferred to EH-051, so `productionSafe` stays `false`.

## Security review (mandatory gate)

Security review subagent ([Security Review](d0b75835-0163-4b9b-b690-20d163379707)) scoped to EH-050 uncommitted owned paths.

| Severity | Finding | Disposition |
|---|---|---|
| — | No medium / high / critical issues | Pass |

Controls confirmed:

- `normalizeWebhookEvent` fail-closed on unsigned / malformed / missing site id.
- Stub + Stripe shell `verifyWebhookSignature` always fail; no HTTP billing webhook route in this slice.
- `applyBillingEntitlementEvent` requires `source: "billing"` + identity; provider client payloads not trusted as grants.
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` server-only; stub honesty; `productionSafe` stays **false**.

EH-051 notes (not findings): do not use `verifiedEnvelopeFromParsed` in production; verify → normalize → apply; prefer durable idempotency on `lifecycleEventId`.

## Residual / human deferrals

- Live Stripe Checkout / Portal / webhook signature verify → **EH-051**
- Dated provider policy matrix / content routing → **EH-052**
- Milestone 3 browser personas + broader security gate → `productionSafe: false`
- Relay `src/payments/provider-adapter.ts` remains synthetic (not kit proof)

## Financial boundary

Creator is the business the patron pays. Relay takes no percentage of independent-site subscription revenue in v1.
