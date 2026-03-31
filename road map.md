# Project Relay Roadmap

## Executive Summary

Creators on Patreon have limited control over how their work is discovered, archived, and monetized outside Patreon. Relay addresses this through a two-tier product strategy:

- Part 1, Gallery Export: creators can export and host their media in a searchable, artist-owned gallery managed through Relay.
- Part 2, Gallery Clone: creators can reproduce their full membership experience (content, tiers, and access logic) on infrastructure they control, with guided audience re-population.

This roadmap prioritizes creator safety, legal compliance, migration confidence, and measurable value at each release gate.

## Builder Navigation (Read This First)

Use this roadmap as the execution sequence and use the reference docs for deeper implementation decisions:

- Standardized build contracts, quality gates, and traceability:
  - [builder-boost-pack/README.md](c:\Users\jorda\Documents\Coding Projects\Rescue\builder-boost-pack\README.md)
- Analytics decisioning, action cards, data contracts, and execution APIs:
  - [analytics-action-center-spec.md](c:\Users\jorda\Documents\Coding Projects\Rescue\analytics-action-center-spec.md)
- Pricing model, COGS guardrails, hosting modes, and post-independence operations:
  - [monetization-scheme-infrastructure-plan.md](c:\Users\jorda\Documents\Coding Projects\Rescue\monetization-scheme-infrastructure-plan.md)

Quick routing:

- Context and product behavior for recommendations -> Analytics Action Center Spec.
- Data sourcing, event contracts, and service boundaries -> Builder Boost Pack contracts + Analytics Action Center Spec.
- Pathing for managed vs BYOI deployment and migration economics -> Monetization Scheme and Infrastructure Plan.
- Security, compliance, and outreach governance decisions -> Builder Boost Pack standards + Monetization Scheme and Infrastructure Plan.

## Product Boundaries

### Part 1: Gallery Export

Goal: creator-owned media availability and discovery without requiring full platform migration.

Includes:
- Patreon OAuth connection and recurring ingest.
- Media normalization, tagging, and gallery search.
- Exported content storage under creator-owned or creator-assigned storage.
- Analytics for content performance and audience behavior.

Does not include:
- Full Patreon replacement checkout flow.
- Tier-gated clone site deployment.

### Part 2: Gallery Clone

Goal: one-click transition path from Patreon-dependent presence to creator-owned subscription site.

Includes:
- Replica data model for posts, tiers, and access rules.
- Deployable clone site with tier access control.
- Payment provider handoff (Stripe/PayPal first).
- Re-Populate workflow to invite existing members to mapped replacement tiers.

## Architecture Baseline

### Application Stack

- Backend: Node.js + TypeScript + NestJS.
- Frontend: Next.js + React + Tailwind.
- Database: PostgreSQL + Prisma.
- Queue and jobs: BullMQ + Redis.
- Object storage: S3 or Cloudflare R2.
- Observability: Sentry + structured logs (Pino).

### Data Domains

- Identity: users, creators, OAuth credentials, provider metadata.
- Content: campaigns, posts, media, tags, content versions.
- Membership: tiers, tier rules, patron snapshots, migration mappings.
- Operations: sync jobs, retries, dead letters, migration runs, email batches.

### Security Defaults

- Encrypt OAuth and provider credentials at rest.
- Signed URLs for private media delivery.
- Least privilege service roles for storage and database.
- Per-tenant rate limits and API abuse controls.

Reference for operational cost and hosting tradeoffs:
- [monetization-scheme-infrastructure-plan.md](c:\Users\jorda\Documents\Coding Projects\Rescue\monetization-scheme-infrastructure-plan.md)

## Part 1 Delivery Track: Gallery Export

### Objective

Deliver time-to-value fast: connect Patreon, import content, launch searchable gallery, and give creators reliable exports.

###    A: Onboarding and Auth

- Implement Patreon OAuth with token refresh and rotation handling.
- Persist encrypted credentials with explicit credential health statuses.
- Add onboarding progress states:
  - Connect Patreon
  - Initial Import
  - Organize Content
  - Publish Gallery

Exit gate:
- 95 percent of eligible creators complete OAuth without support intervention.
- Token refresh failure rate under 1 percent per day.

### Workstream B: Ingestion and Normalization

- Build idempotent ingest pipeline for campaigns, posts, media, and tier metadata.
- Normalize content into media-centric records while preserving source post relationships.
- Track upstream deletions/edits and maintain version history.
- Add retry policy (exponential backoff) and dead-letter queue.

Builder reference:
- Data contracts and event surface for downstream analytics/action logic:
  - [analytics-action-center-spec.md](c:\Users\jorda\Documents\Coding Projects\Rescue\analytics-action-center-spec.md)

Exit gate:
- Initial import for 5,000 media items completes in under 20 minutes.
- Duplicate creation rate below 0.1 percent.
- Dead-letter rate below 0.5 percent of jobs.

### Workstream C: Export Storage and Delivery

- Download and store original-resolution assets to creator-assigned storage target.
- Attach checksums and integrity metadata to every exported object.
- Support optional local manifest export:
  - `media-manifest.json`
  - `post-map.json`
  - `tier-map.json`
- Serve thumbnails and gallery assets through cache layer/CDN.

Exit gate:
- 99.9 percent media retrieval success over rolling 7 days.
- Integrity verification passes for 100 percent sampled exports.

### Workstream D: Gallery Experience

- Build virtualized, filterable gallery:
  - Search by title, tags, date range, tier, and media type.
- Add bulk tag editor and metadata correction workflow.
- Implement quick preview, keyboard navigation, and saved filters.

Exit gate:
- Median time to locate a known asset under 5 seconds.
- P95 gallery interaction latency under 300 ms for 10,000 items.

### Workstream E: Analytics Foundation

- Capture content and audience trend snapshots.
- Provide creator-facing insights:
  - Top performing tags.
  - Posting cadence vs engagement.
  - Tier-specific content performance.
- Mark all estimated metrics clearly when source data is incomplete.

Builder reference:
- Use the Analytics Action Center Spec as implementation source of truth for:
  - action-card schema
  - recommendation confidence and explainability rules
  - API surface and execution pathways
  - KPI instrumentation and rollout phases
  - [analytics-action-center-spec.md](c:\Users\jorda\Documents\Coding Projects\Rescue\analytics-action-center-spec.md)

Exit gate:
- Dashboard exposes at least 3 actionable insight cards per creator.
- Insight generation job success rate at or above 99 percent.

### Required Assets for Part 1

Technical assets:
- Patreon OAuth app and callback environments.
- Queue worker deployment with autoscaling policy.
- Object storage bucket policy templates and key management.
- CDN distribution and cache invalidation strategy.

Operational assets:
- Creator onboarding guide and troubleshooting flow.
- Support runbook for failed syncs and expired credentials.
- Data retention and deletion policy.

## Part 2 Delivery Track: Gallery Clone

### Objective

Enable creators to transition from Patreon dependency to a creator-owned subscription site with minimal audience loss.

### Workstream F: Replica Model and Clone Generation

- Extend schema to represent clone-ready posts, media relations, tiers, and access constraints.
- Generate clone site content model from canonical dataset.
- Support preview environment with deterministic URL structure before launch.

Exit gate:
- Clone preview parity reaches 98 percent on sampled pages.
- Tier rule evaluation is deterministic and test-covered.

### Workstream G: Access and Identity

- Implement access control for public, member-only, and tier-specific content.
- Support Patreon-auth fallback during transition window.
- Add independent account creation for post-migration continuity.

Exit gate:
- Unauthorized tier content access rate equals zero in test suite and staging attack tests.

### Workstream H: Payment Provider Handoff

- Initial providers: Stripe and PayPal (additional providers after launch).
- Create tier-to-product mapping wizard with preflight checks:
  - Currency consistency
  - Tax behavior
  - Billing interval compatibility
- Add dry-run mode before live charge enablement.

Builder reference:
- Pricing packages, plan boundaries, and managed vs BYOI implications:
  - [monetization-scheme-infrastructure-plan.md](c:\Users\jorda\Documents\Coding Projects\Rescue\monetization-scheme-infrastructure-plan.md)

Exit gate:
- 100 percent of configured tiers can be validated in preflight mode.
- Payment checkout success rate at or above 97 percent in pilot.

### Workstream I: Re-Populate Audience Recovery

- Build consent-safe invite pipeline that maps prior membership tier to destination tier.
- Create signed, expiring re-subscribe links per recipient and tier.
- Add migration campaign controls:
  - Staged sends
  - Bounce and complaint monitoring
  - Automatic suppression list enforcement
- Provide creator preview:
  - Recipient counts by tier
  - Message preview
  - Risk flags before send

Builder reference:
- Campaign safety rails, recommendation-to-execution model, and measurement loop:
  - [analytics-action-center-spec.md](c:\Users\jorda\Documents\Coding Projects\Rescue\analytics-action-center-spec.md)
- Deliverability economics, policy posture, and service responsibility boundaries:
  - [monetization-scheme-infrastructure-plan.md](c:\Users\jorda\Documents\Coding Projects\Rescue\monetization-scheme-infrastructure-plan.md)

Exit gate:
- Email delivery rate at or above 98 percent (excluding hard bounces).
- Complaint rate below 0.1 percent.
- Re-subscribe conversion benchmark established and tracked per cohort.

### Workstream J: One-Click Deploy and Rollback

- Integrate deploy APIs (Vercel first, optional Netlify second).
- Release flow:
  - Build clone
  - Preview approval
  - DNS and domain check
  - Launch
- Implement rollback to previous stable deployment with one action.

Exit gate:
- Median production deployment time under 2 minutes after approval.
- Verified rollback completes in under 5 minutes.

### Required Assets for Part 2

Technical assets:
- Clone template repository with theme slots and tier gating hooks.
- Payment provider adapter layer.
- Email infrastructure with domain authentication (SPF, DKIM, DMARC).
- Migration orchestration service with audit log storage.

Operational assets:
- Legal/compliance review checklist for outreach and migration communications.
- Domain and DNS setup guide for creators.
- Incident runbook for migration failures and rollback recovery.

## Re-Populate User Experience Flow

### Creator Flow

1. Select migration campaign.
2. Review tier mapping suggestions and edit as needed.
3. Run preflight checks (contacts, suppressions, link validity, template quality).
4. Preview recipient counts and sample messages.
5. Launch staged send (small cohort first, then full audience).
6. Track conversion dashboard and retry non-openers safely.

### Patron Flow

1. Receive invite with creator branding and clear reason for transition.
2. Click tier-specific secure link.
3. Review destination benefits and pricing.
4. Create account or sign in.
5. Complete checkout and gain mapped access immediately.

### UX Safeguards

- No send without passing preflight validation.
- No tier assignment without explicit mapping confirmation.
- Automatic pause if bounce/complaint threshold is exceeded.
- Every campaign action written to immutable audit log.

## Compliance and Policy Guardrails

- Respect source platform terms and regional privacy laws.
- Process member contact data only with valid legal basis.
- Provide unsubscribe and preference center in all outreach emails.
- Enforce suppression list checks before any campaign send.
- Maintain audit trails for imports, exports, and outreach actions.

Builder reference:
- Contract/policy baseline and operational compliance ownership model:
  - [monetization-scheme-infrastructure-plan.md](c:\Users\jorda\Documents\Coding Projects\Rescue\monetization-scheme-infrastructure-plan.md)

## Testing and Release Gates

### Test Coverage

- Unit: ingest transforms, tier mapping logic, entitlement checks.
- Integration: OAuth refresh, queue retry behavior, payment adapters.
- End-to-end: creator onboarding, clone deploy, Re-Populate campaign.
- Security: auth bypass tests, signed URL expiration tests, data isolation tests.

### Reliability SLOs

- API availability at or above 99.9 percent monthly.
- Sync freshness target: 95 percent of creators updated within configured interval.
- Background job success rate at or above 99 percent.

### Release Policy

- Pilot with a small creator cohort first.
- Require dry-run migration success before production migrations.
- Gate broad release on conversion, support load, and reliability targets.

Builder reference:
- Analytics rollout phases and recommendation quality gates:
  - [analytics-action-center-spec.md](c:\Users\jorda\Documents\Coding Projects\Rescue\analytics-action-center-spec.md)
- Monetization rollout milestones and infra readiness checkpoints:
  - [monetization-scheme-infrastructure-plan.md](c:\Users\jorda\Documents\Coding Projects\Rescue\monetization-scheme-infrastructure-plan.md)

## Milestone Build Order

1. Part 1 foundation: OAuth, ingest, normalized data model.
2. Part 1 value: export storage, gallery UX, analytics.
3. Part 1 hardening: SLOs, observability, support runbooks.
4. Part 2 foundation: replica schema, clone generation, access model.
5. Part 2 migration: payment handoff, Re-Populate pipeline, deploy and rollback.
6. Part 2 hardening: compliance automation, deliverability tuning, DR readiness.

## End State

Relay provides a practical ladder to creator independence:

- Part 1 gives creators ownership and discoverability now.
- Part 2 gives creators an operational off-ramp from Patreon when they choose.
- Both parts are measured by migration safety, creator confidence, and audience continuity.