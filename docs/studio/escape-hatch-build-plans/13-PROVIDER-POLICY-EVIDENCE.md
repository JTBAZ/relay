# Provider policy evidence

This is a dated routing aid, not legal advice or a permanence guarantee. A provider appears in the wizard only after its policy, technical adapter, sandbox/deployment, security, and human gates pass. Recheck official terms before every supported-recipe release.

**Review date:** 2026-07-23

## Current matrix

| Provider | Role | Current evidence | Product status |
|---|---|---|---|
| Vercel | Primary Next.js host | Primary technical target; content-policy review must be refreshed before launch | Implementation target, not yet release-certified |
| Supabase | Primary auth/Postgres | Creator-owned Auth/Postgres target; RLS/security guidance required | Implementation target, not yet release-certified |
| Cloudflare R2 | Private media | S3-compatible storage; published pricing states no internet egress fee | Existing Relay smoke coverage; generated-site adapter pending |
| Stripe | Eligible-business subscriptions | Published prohibited-business list bars pornography/mature content designed for sexual gratification | Eligible creators only; EH-051 adapter preview_only |
| NOWPayments | Crypto recurring (Stripe-gap) | Product pages list adult business among verticals; recurring/subscription APIs documented | EH-053 preview shell + injectable CI client; live HTTP/IPN verify open |
| CCBill | High-risk card merchant | Official FAQ: company/sole-proprietor info, IDs, site URL, bank; compliance review before account ready | **Guidance only** — approved merchant account / LLC most times; no live kit adapter |
| Segpay | High-risk card merchant | Merchant inquiry / underwriting for adult & subscription sites | **Guidance only** — approved merchant account / LLC most times; no live kit adapter |
| MojoHost | Portable lawful-adult host candidate | Official creator guidance explicitly welcomes legal, rightfully used adult content and offers virtual machines/infrastructure | Policy-reviewed candidate; Docker deployment/SLA/security rehearsal required before wizard support |
| Transactional email provider | Auth/security email | Not selected | Blocked pending policy, deliverability, API/SMTP, and sandbox review |

See also: [`15-ALTERNATE-BILLING-RECIPES.md`](./15-ALTERNATE-BILLING-RECIPES.md).

## Official evidence

### Stripe

- Prohibited and Restricted Businesses: <https://stripe.com/legal/restricted-businesses>
- Current published language includes adult services, adult video stores, and pornography/mature content designed for sexual gratification among prohibited businesses.
- Consequence: content eligibility is checked before showing Stripe setup. Relay never advises a creator to hide or misclassify their business.

### NOWPayments

- Home: <https://nowpayments.io/>
- Crypto subscriptions: <https://nowpayments.io/crypto-subscriptions>
- Adult-industry marketing article: <https://nowpayments.io/blog/adult-industry-anonymous>
- Checked: 2026-07-23. Marketing is not permanence — re-read ToS before launch.
- Consequence: primary implementable EH-053 alternate when Stripe prohibits the declared use. Crypto renewals ≠ card autopull.

### CCBill

- General FAQs / signup prerequisites: <https://ccbill.com/doc/general-faqs>
- Checked: 2026-07-23. Application expects company or sole-proprietor information, two forms of ID, website URL, and payout bank. Account becomes ready only after compliance review.
- Consequence: list as merchant-approval guidance. **Do not auto-offer live Checkout** until the creator has an approved account and a dedicated adapter ships. LLC/registered entity is the common path for adult merchants.

### Segpay

- Home / get started: <https://www.segpay.com/>
- Checked: 2026-07-23. Merchant underwriting typically needs legal entity, banking, live site, and content/policy review.
- Consequence: same honesty bar as CCBill — guidance until approved credentials exist.

### Cloudflare R2

- Pricing: <https://developers.cloudflare.com/r2/pricing/>
- Current published Standard pricing includes 10 GB-month free tier and no internet egress charge, with storage/operation charges above the allowance.
- Consequence: R2 is the primary media contract, but creator still sees current estimates and owns the account.

### MojoHost candidate

- Adult creator infrastructure statement: <https://mojohost.com/adult-content-creators-time-to-build-your-home-base/>
- Legal documents: <https://mojohost.com/legal-info/>
- DMCA policy: <https://mojohost.com/digital-millennium-copyright-act-dmca/>
- Current provider statement says legal, rightfully used adult content is welcome and lists virtual machines, dedicated servers, cloud storage, and CDN infrastructure.
- Consequence: MojoHost is the first portable-host recipe candidate. Do not expose it as a supported one-click option until a builder proves Docker deployment, TLS/domain callbacks, backups, restore, monitoring, capacity, SLA/support, data-region needs, and safe termination/migration.

## Required recipe certification

For each advertised provider recipe, attach:

1. official policy URLs and checked date;
2. supported region/business/content declaration;
3. account created by the human owner;
4. sandbox or disposable deployment;
5. exact browser-guided setup;
6. automated connectivity/capability test;
7. secret rotation and account recovery;
8. backup/export/migration route;
9. costs and recurring owner;
10. outage/termination behavior;
11. security review;
12. human approval and next review date.

## Stop rules

- Marketing statements and third-party summaries do not override provider terms.
- Hosting acceptance does not imply payment, email, CDN, or legal eligibility.
- A host's support for adult content does not waive consent, age, recordkeeping, intellectual-property, privacy, or jurisdiction requirements.
- “No provider selected” is safer than routing a creator to an unverified or incompatible service.
- Policy changes remove the recipe from new wizard sessions until re-certified; existing creators receive migration guidance.
- CCBill/Segpay require **approved merchant accounts** (LLC/entity most times) — never present them as frictionless defaults.
