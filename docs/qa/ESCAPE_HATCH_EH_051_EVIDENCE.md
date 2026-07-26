# Escape Hatch EH-051 milestone evidence

**Status:** Builder freeze — preview-only Stripe eligible-business adapter  
**Completed:** 2026-07-23  
**Implementation builder:** Cursor Grok 4.5 High  
**Master planner / reviewer:** Sol (acceptance close-out pending)  
**Slice:** EH-051 — Stripe eligible-business adapter  
**Next dependency:** EH-052 — Provider policy router  
**productionSafe:** `false` (unchanged)

## Scope and ownership

EH-051 ships the creator-owned **Stripe BillingProvider** adapter for eligible-business Checkout, Customer Portal, signed webhooks, product/price CRUD, and migration export — with an injectable client for CI sandbox. EH-050 contract retained. Default provider remains **stub**; `ESCAPE_HATCH_BILLING_PROVIDER=stripe` selects the live adapter.

### Kit (`packages/escape-hatch/template`)

- `lib/billing/stripe.ts` + `stripe-client.ts` + `stripe-signature.ts` — injectable Stripe surface; memory client for tests; live SDK wrap when secrets present.
- `lib/billing/customer-map.ts` — process-local authUser ↔ Stripe customer binding (preview); portal/checkout ignore client `customerId` when identity is configured.
- Routes: `app/api/billing/checkout`, `portal`, `webhook` — fail-closed without config; webhook → verify → normalize → entitlement sink + customer-map remember.
- Hooks for `/tiers`, paywalls, `/account`; readiness/reporter honesty for stub vs stripe.
- Env names documented (`.env.example`, `lib/env.ts`) — secrets not required for build.
- `OPERATIONS.md` documents EH-051 adapter + EH-052 policy handoff.
- Status slice **EH-051** → next **EH-052**; `productionSafe` remains **`false`**.

### Explicitly out of scope

- EH-052 dated provider policy matrix / ineligible content routing
- EH-053 alternate processor
- Milestone 3 browser personas + broader security gate
- Flipping `productionSafe` to true
- Relay `src/payments/provider-adapter.ts` remains synthetic (not kit proof)
- Durable multi-instance customer map (SQL) — preview memory only for EH-051

## Security review disposition (agent `771a75c5-29b1-496c-9b8e-08f16afb5616`)

| Finding | Severity | Disposition | Remediation |
|---|---|---|---|
| **EH051-1** Portal IDOR via client `customerId` | High | **Fixed** | Identity path: portal resolves customer only from session + `customer-map` (`billing_customer_link_missing` if absent). Client `customerId` ignored. |
| **EH051-2** Checkout `customerId` injection | High | **Fixed** | Identity path: discard body `customerId`; use map lookup or omit (Stripe creates; webhook `rememberBillingCustomerLink`). |
| **EH051-3** Protocol-relative open redirect (`//…`) | Medium | **Fixed** | Checkout/portal reuse Patreon `isSafeReturnPath` / `normalizeReturnPath`; unsafe supplied paths → `400 unsafe_return_path`. |

Core pipeline (webhook verify → normalize → `source: billing` apply, stub/placeholder fail-closed, `productionSafe: false`) remains sound per review.

## Automated evidence

Builder freeze 2026-07-23 (pre-remediation):

| Command | Exit | Result |
|---|---:|---|
| `npx tsx packages/escape-hatch/src/cli.ts status --json` | 0 | Slice **EH-051**; next **EH-052 — Provider policy router**; `productionSafe: false` |
| `npm run typecheck` (cwd `packages/escape-hatch`) | 0 | Package TypeScript passed |
| `npm test` (cwd `packages/escape-hatch`) | 0 | **21/21 files passed; 332/332 tests passed** (incl. `escape-hatch-billing-stripe.test.ts` — 6 tests) |

Security remediation re-verify (post EH051-1/2/3):

| Command | Exit | Result |
|---|---:|---|
| `npm run typecheck` (cwd `packages/escape-hatch`) | 0 | Package TypeScript passed |
| `npm test` (cwd `packages/escape-hatch`) | 0 | **21/21 files passed; 336/336 tests passed** (`escape-hatch-billing-stripe.test.ts` — 10 tests, +4 customer-binding / return-path) |

### Freeze repair notes

Prior background runs failed because EH-051 status correctly titled next slice **Provider policy router**, while sibling status tests still expected `/Stripe\|eligible/i` for `nextSlice.title`. Updated 12 test files to `/policy/i` (aligned with `escape-hatch-billing-stripe.test.ts`). Typecheck was already green (`parseTierFromCsv` + `as unknown` Stripe cast).

## Residual / human deferrals

- Dated official-policy matrix + launch blocking for ineligible Stripe use → **EH-052**
- Milestone 3 browser personas + broader security gate → `productionSafe: false`
- Live Stripe network smoke outside injectable CI client remains operator-owned
- Customer map is **process-local preview memory** — not durable across instances; durable store + optional staff portal override still deferred
- Master Sol acceptance after remediation re-verify

## Financial boundary

Creator is the business the patron pays. Relay takes no percentage of independent-site subscription revenue in v1.
