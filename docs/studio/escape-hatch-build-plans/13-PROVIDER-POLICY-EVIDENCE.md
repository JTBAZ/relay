# Provider policy evidence

This is a dated routing aid, not legal advice or a permanence guarantee. A provider appears in the wizard only after its policy, technical adapter, sandbox/deployment, security, and human gates pass. Recheck official terms before every supported-recipe release.

**Review date:** 2026-07-22

## Current matrix

| Provider | Role | Current evidence | Product status |
|---|---|---|---|
| Vercel | Primary Next.js host | Primary technical target; content-policy review must be refreshed before launch | Implementation target, not yet release-certified |
| Supabase | Primary auth/Postgres | Creator-owned Auth/Postgres target; RLS/security guidance required | Implementation target, not yet release-certified |
| Cloudflare R2 | Private media | S3-compatible storage; published pricing states no internet egress fee | Existing Relay smoke coverage; generated-site adapter pending |
| Stripe | Eligible-business subscriptions | Published prohibited-business list bars pornography/mature content designed for sexual gratification | Eligible creators only; sandbox adapter pending |
| MojoHost | Portable lawful-adult host candidate | Official creator guidance explicitly welcomes legal, rightfully used adult content and offers virtual machines/infrastructure | Policy-reviewed candidate; Docker deployment/SLA/security rehearsal required before wizard support |
| Transactional email provider | Auth/security email | Not selected | Blocked pending policy, deliverability, API/SMTP, and sandbox review |
| Alternate billing provider | Lawful categories Stripe prohibits | Not selected | Blocked pending human-approved provider research and full adapter parity |

## Official evidence

### Stripe

- Prohibited and Restricted Businesses: <https://stripe.com/legal/restricted-businesses>
- Current published language includes adult services, adult video stores, and pornography/mature content designed for sexual gratification among prohibited businesses.
- Consequence: content eligibility is checked before showing Stripe setup. Relay never advises a creator to hide or misclassify their business.

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
