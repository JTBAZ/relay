# Alternate billing recipes (EH-053)

Dated routing aid for Stripe-gap creators. Not legal advice. Re-check official terms before every launch.

**Review date:** 2026-07-23 · `productionSafe: false`

## Recipe summary

| Recipe | Checkout adapter | Who it is for | Honest prerequisite |
|---|---|---|---|
| **NOWPayments** crypto recurring | `ESCAPE_HATCH_BILLING_PROVIDER=nowpayments` (preview shell + injectable CI client) | Stripe-prohibited / restricted declared use (esp. adult sexual gratification) | Creator NOWPayments account + API key + IPN secret; live HTTP/IPN verify still open |
| **CCBill** high-risk card | Guidance only (no live adapter yet) | Creators who need Visa/MC on adult/high-risk sites | **Approved merchant account** — registered business (LLC/corp common), IDs, bank, live HTTPS site, compliance review |
| **Segpay** high-risk card | Guidance only (no live adapter yet) | Same as CCBill alternate | **Approved merchant account** — legal entity + underwriting; Escape Hatch does not auto-provision |
| Archive / free / Patreon | Always | Everyone while independent billing is unresolved | No independent Checkout |

## NOWPayments (primary implementable alternate)

- Product: <https://nowpayments.io/>
- Recurring / subscriptions marketing: <https://nowpayments.io/crypto-subscriptions>
- Adult-industry positioning (marketing): <https://nowpayments.io/blog/adult-industry-anonymous>
- Env: `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, `ESCAPE_HATCH_BILLING_PROVIDER=nowpayments`
- Crypto renewals require the patron to pay each cycle — **not** card autopull.
- MoonPay classic is an on-ramp, not merchant subscriptions. MoonPay Commerce ToS restricts certain sexually oriented materials — **not** the default Stripe-gap recipe.

## CCBill (card — merchant approval)

- Signup / FAQ: <https://ccbill.com/doc/general-faqs>
- Official FAQ expects company or sole-proprietor information, two forms of ID, site URL, and payout bank details. Visa/Mastercard processing typically needs U.S./Canada/EU/UK presence (see CCBill designated-country list).
- **Most adult merchants need an approved account and a registered entity (LLC or equivalent).** Escape Hatch lists this as **guidance** until the creator has credentials and a dedicated adapter ships.
- Do not claim one-click CCBill Checkout from the kit.

## Segpay (card — merchant approval)

- Home / merchant inquiry: <https://www.segpay.com/>
- Adult / dating / subscription vertical processor. Underwriting asks for website, sales estimates, country of incorporation, banking, and policy pages.
- **Approved merchant account + legal entity is the normal path.** Guidance-only in EH-053 — no auto-provision, no Checkout unlock from the recipe card alone.

## Routing rules (kit)

1. Complete content/use attestation (`/admin/billing/policy`).
2. If Stripe **allowed** → offer Stripe Checkout only (never misclassify adult use).
3. If Stripe **prohibited/restricted** → offer NOWPayments Checkout recipe; show CCBill + Segpay as merchant-approval guidance; archive/Patreon always remains.
4. `assertIndependentCheckoutAllowed` checks the **active** `BillingProvider` — adult attestation never unlocks Stripe even when NOWPayments is offered.

## Stop rules

- Never advise hiding adult content to unlock Stripe.
- Marketing blogs do not override ToS.
- CCBill/Segpay approval is between the creator and the processor — Escape Hatch cannot guarantee acceptance.
- Secrets stay in env / OS keychain — never Airtable or git.
