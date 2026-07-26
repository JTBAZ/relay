# ESCAPE_HATCH_EH_053_EVIDENCE

**Slice:** EH-053 Lawful alternate billing recipe  
**Date:** 2026-07-23  
**productionSafe:** false  
**Builder:** Cursor Grok 4.5 High

## Delivered

1. **NOWPayments** `BillingProvider` scaffold (`lib/billing/nowpayments.ts`) with injectable memory client for CI; fails closed without secrets / without injection; no Stripe-style portal (honest fail reason).
2. **Policy matrix** rows for NOWPayments, CCBill, Segpay (dated 2026-07-23) + recipe router offering:
   - Stripe when eligible
   - NOWPayments Checkout when Stripe prohibited/restricted and category allowed
   - CCBill + Segpay as **guidance only** with `requiresMerchantApproval: true` (LLC / approved merchant account most times)
3. **Checkout gating** keyed to active implementation — adult attestation never unlocks Stripe Checkout even when NOWPayments is offered.
4. Docs: `13-PROVIDER-POLICY-EVIDENCE.md`, `15-ALTERNATE-BILLING-RECIPES.md`, batting order, OPERATIONS.

## Explicit non-claims

- Live NOWPayments HTTP + IPN HMAC verification not production-wired.
- No live CCBill or Segpay SDK/Checkout — guidance until creator has approved credentials.
- MoonPay is documented as **not** the Stripe-gap default.
- `productionSafe` remains false.

## Verification

- Kit unit tests for alternate recipes + status nextSlice EH-054.
- Adult attestation: `stripeOffered=false`, `nowpaymentsOffered=true`, Stripe checkout blocked, NOWPayments checkout allowed with injected client.
