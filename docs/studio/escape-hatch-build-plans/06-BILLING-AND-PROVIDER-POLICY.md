# Billing and provider policy

## Financial boundary

The creator is the business the patron pays. Provider accounts, customer relationships, funds, payouts, refunds, disputes, taxes, and negative balances belong to the creator and their chosen processor.

Relay charges:

- a one-time Escape Hatch construction fee;
- an optional monthly Relay-managed Patreon verification add-on;
- optional quoted maintenance or managed hosting later.

Relay takes no percentage of independent-site subscription revenue in v1.

## Required specialist guidance

- Stripe implementation: read `stripe-best-practices` and its current Billing/security references.
- Any future Relay platform-payment flow: run `connect-recommend`; do not copy legacy account-type patterns.
- Provider policies change: use official current sources and record retrieval date.
- Security review is mandatory for checkout, webhook, portal, refund, and entitlement code.

## Billing adapter

Every implementation conforms to a shared `BillingProvider` contract:

- connect and validate creator-owned account;
- list/create/update tier products and recurring prices;
- create hosted/embedded checkout;
- create account-management portal or documented equivalent;
- verify signed webhooks;
- normalize subscription lifecycle events;
- expose capability/readiness state;
- support sandbox/test mode;
- declare supported currencies, intervals, tax features, content categories, and regions;
- export customer/subscription mapping needed for migration.

The entitlement service consumes normalized events, never provider-specific client payloads.

## Stripe path

Offer Stripe only after current eligibility checks.

Use:

- current Stripe SDK/API;
- Billing APIs and Checkout Sessions for subscriptions;
- dynamic payment methods—do not hardcode `payment_method_types`;
- Customer Portal for patron self-service where appropriate;
- verified webhooks as payment truth;
- idempotency for all mutations and event replays;
- restricted keys where supported, never browser-exposed secret keys.

The wizard validates at least: successful checkout, webhook receipt, active grant, cancel-at-period-end, immediate cancellation policy, failed renewal, restored payment, tier change, and portal return.

## Lawful adult and controversial-content path

Stripe's published restricted-business policy prohibits pornography and mature content designed for sexual gratification. Relay must not route an ineligible creator through Stripe, disguise the content, or advise misclassification.

Instead:

1. collect a creator declaration sufficient for routing, not a copy of their private catalog;
2. evaluate current official policies for hosting, storage, email, and billing;
3. show only validated compatible recipes;
4. require creator acceptance of provider terms;
5. block paid launch when no supported processor is validated;
6. keep the application usable as an archive/free/Patreon-entitled site while billing is unresolved;
7. preserve the adapter boundary so a processor can be replaced.

Supporting a new processor requires:

- official policy and regional review;
- human product/legal approval;
- sandbox account and capability proof;
- subscription, webhook, dispute/cancellation, and entitlement parity tests;
- secrets and incident runbook;
- documented costs and creator responsibilities;
- dated browser walkthrough.

## Provider policy matrix

Maintain a release artifact with:

- provider/product;
- official policy URL;
- checked date and reviewer;
- allowed/restricted/prohibited use description;
- region limitations;
- account-approval requirements;
- payment, hosting, storage, or email role;
- adapter/test status;
- migration route;
- next review date.

“Compatible” is not permanent. The wizard displays the checked date and links the creator to the current policy.

## Tier mapping

For every source tier, review:

- display name and benefits;
- access rank;
- amount and currency;
- monthly/annual interval;
- tax behavior;
- legacy/removed status;
- active Patreon patron count;
- destination product and price;
- behavior for patrons with both sources.

Prevent:

- unmapped paid tiers at launch;
- accidental lower-tier access expansion;
- currency/interval mismatch;
- duplicate checkout for active Patreon access without explicit migration intent;
- client-created price amounts;
- live checkout before sandbox and webhook proof.

## Patreon-to-independent billing transition

- Existing Patreon access remains valid while current.
- Independent subscription access may coexist.
- Account UI clearly shows which source currently grants access.
- A migration CTA explains whether to cancel Patreon, when new billing starts, and how to avoid overlap.
- Relay does not cancel Patreon pledges or claim the creator has migrated a patron without patron action.

## Relay-managed OAuth surcharge

The monthly price remains configurable until measured operating costs exist. Finance must model:

- Patreon API/token refresh volume;
- signing/key infrastructure;
- monitoring and incident response;
- support contacts and migration assistance;
- privacy/compliance overhead;
- billing processing and bad debt;
- margin reserve for provider API changes.

This add-on is a software/service fee, not a toll on Patreon or independent subscription revenue. Entitlement is gated by the creator's Relay subscription record and canceled only through normal Relay billing/webhook truth.

## Accounting and copy

- Store money as integer minor units.
- Record currency on every price and transaction mapping.
- Do not call third-party estimates “included” in the one-time fee.
- Show one-time Relay charge, monthly Relay add-ons, and provider charges separately.
- Never say “zero risk,” “uncensorable,” “guaranteed compatible,” or “keep 100%” without clarifying processor/tax costs.
