# Monetization Scheme and Infrastructure Plan

## Builder Integration

For build controls, compliance gates, and traceable execution, pair this plan with:

- [docs/financial-atlas.md](docs/financial-atlas.md) — **canonical** tier table, Skip/Boost economics, storefront assumptions, projections, and ruled-out revenue models (this plan focuses on *infra COGS and packaging*; the atlas is *what we charge and pay*).
- [docs/studio/escape-hatch-build-plans/00-README.md](docs/studio/escape-hatch-build-plans/00-README.md) — Escape Hatch product, ownership, wizard, generated application, deployment, and service-boundary canon.
- [builder-boost-pack/README.md](c:\Users\jorda\Documents\Coding Projects\Rescue\builder-boost-pack\README.md)
- [builder-boost-pack/builder-decision-checklist.md](c:\Users\jorda\Documents\Coding Projects\Rescue\builder-boost-pack\builder-decision-checklist.md)
- [builder-boost-pack/standards/security-compliance-checklist.md](c:\Users\jorda\Documents\Coding Projects\Rescue\builder-boost-pack\standards\security-compliance-checklist.md)
- [builder-boost-pack/delivery/workstream-traceability-matrix.md](c:\Users\jorda\Documents\Coding Projects\Rescue\builder-boost-pack\delivery\workstream-traceability-matrix.md)

Authority note:
- This document defines commercial and operating strategy.
- For implementation-level contracts and gate checks, follow the Builder Boost Pack contracts and standards first.

## Strategic Position

Use a hybrid model:

- Recurring SaaS for ongoing value.
- One-time creator-owned Escape Hatch construction package.
- Optional monthly Relay-managed Patreon verification.
- Optional paid maintenance or managed hosting after the creator-owned product proves demand.

This aligns revenue with recurring cost structure (storage, compute, support, deliverability).

## Packaging Model

### Plan A: Core SaaS (Default)

Includes:

- Patreon sync and backup health.
- Gallery, analytics, and recommendations.
- Standard support.

Pricing levers:

- Flat Studio/Autopost/Growth Engine ladder per `docs/financial-atlas.md`; creator size bands are retired.
- Creator-owned infrastructure absorbs its own storage, egress, and email costs after Escape Hatch handoff.

### Plan B: Escape Hatch Construction Package (One-Time)

Includes:

- Patreon data/tier/media parity review.
- Creator-owned generated Next.js application.
- Private media migration to creator-owned R2.
- Independent account and billing setup.
- Vercel/Supabase or portable deployment guidance.
- Go-live, rollback, backup/restore, and ownership packet.

Does not include Re-Populate campaigns, comments/favorites/community hosting, provider charges, or indefinite maintenance.

### Plan C: Managed Patreon Verification (Monthly Add-On)

Includes:

- Relay-mediated Patreon OAuth and token refresh.
- Site-scoped signed entitlement assertions.
- Connector monitoring, key rotation, incident handling, and migration metadata.
- Guided migration to creator-owned OAuth on cancellation.

It does not host the generated site, media, account database, or independent checkout. Price must cover ongoing connector COGS and support rather than act as a percentage toll.

### Optional: Paid Maintenance / Future Managed Hosting

- Escape Hatch delivery defects are covered for 90 days.
- Post-warranty dependency/security upgrades, provider migrations, and hands-on operations are quoted.
- A future managed-hosting retainer may bundle hosting, monitoring, backups, and updates, but must remain optional and preserve export/migration rights.

## Why One-Time Can Work

- The creator owns and pays recurring infrastructure, so Relay does not silently inherit hosting/storage COGS.
- The construction price includes measured assembly, migration, QA, deployment, handoff labor, and a 90-day defect reserve.
- Ongoing Relay obligations are separately funded by managed Patreon verification or paid maintenance/hosting.
- Native site operation cannot depend on buying those services.

## Infrastructure Strategy: Before and After Independence

### Pre-Independence (Patreon Connected)

- Multi-tenant managed stack.
- Shared workers and observability.
- Creator-assigned storage option where possible.
- Per-tenant usage metering.

### Post-Independence Modes

1. Creator-owned Vercel/Supabase/R2 mode (recommended v1)
   - Fast guided launch with creator-owned accounts, keys, domain, billing, and customer relationship.
2. Portable Docker/Postgres mode
   - Exportable application and deployment templates.
   - One currently policy-validated hosting recipe for lawful creators who cannot use the primary route.
3. Future managed mode
   - Optional Relay hosting/operations only after service pricing, SLOs, moderation/privacy, and exit guarantees are approved.

## Cost Model Guardrails

Track COGS per tenant:

- Object storage and CDN egress.
- Background jobs and queue throughput.
- Email sends and deliverability tooling.
- Support hours.
- Payment processing overhead (if managed checkout).
- Generated-site build, media-copy, browser QA, and handoff labor.
- Managed Patreon token refresh, signing, monitoring, incidents, privacy/compliance, and migration support.
- 90-day delivery-defect reserve.

Enforce controls:

- Quote exceptional migration volume before construction rather than taxing patron count or revenue.
- Throttle/resume media-copy operations and expose creator-owned provider estimates.
- Meter managed connector usage for COGS planning without billing per Patreon patron or revenue.

## Revenue Mechanics

- Core recurring fee anchored to outcome value.
- One-time Escape Hatch fee for construction, migration, verification, deployment, and ownership handoff.
- Monthly managed Patreon verification surcharge.
- Paid post-warranty maintenance and future optional managed-hosting retainer.
- Annual discounts to improve retention and cash flow.

Optional add-ons:

- Premium SLA.
- Advanced campaign consulting.
- Custom design and theme work.

## Contract and Policy Essentials

- Data processing terms and privacy addendum.
- Explicit migration consent and communication policy.
- Backup language and RPO/RTO commitments.
- Responsibility split for managed vs BYOI deployments.
- Exit and export guarantees aligned with creator independence promise.

## Recommended Path Forward

1. Launch Core SaaS and the creator-owned Escape Hatch construction package.
2. Ship creator-owned OAuth and the separately billed managed Patreon verification choice in Escape Hatch v1.
3. Make creator-owned infrastructure the v1 handoff; do not postpone portability.
4. Measure delivery COGS and connector attach/support rates before locking prices.
5. Add paid maintenance and managed hosting only with clear SLO, moderation/privacy, and exit obligations.
6. Position around ownership and fixed disclosed service charges, never a tax on creator subscription success.

## Operational Milestones to Support Monetization

- M1: Usage metering and billing primitives.
- M2: Migration playbooks and support SOPs.
- M3: Provider-policy routing, transactional email, and compliance gates.
- M4: Creator-owned Vercel and portable deployment/restore templates.
- M5: Managed Patreon verification billing, monitoring, cancellation, and migration.
- M6: Optional managed-hosting SLOs and on-call operations.

## Decision Matrix for Creator Path

- Lowest friction -> creator-owned Vercel/Supabase/R2 guided path.
- Policy or portability requirement -> Docker/Postgres/R2 path with validated provider recipe.
- Patreon OAuth setup burden -> optional monthly Relay-managed verification.
- Ongoing operations burden -> paid maintenance now; optional managed hosting when available.
