# Build batting order

Execute one documented slice at a time. The program docs define scope and dependency order; git commits or PRs define implementation truth; milestone reports record tests, browser/security evidence, decisions, and next work. Airtable is not part of the Escape Hatch build flow.

## Milestone 0 — contracts and prototype baseline

### EH-000 Inventory and status

- **Builder:** Cursor Grok 4.5 High
- Inventory current CLI/template, Part 2 services/stubs, duplicate types, untested fixtures, and security gaps.
- Add executable status output distinguishing preview-only from production-safe.
- Verify current fixture generation and package tests.

### EH-001 Shared contracts

- **Builder:** Cursor Grok 4.5 High
- Extract versioned SiteBundle/CloneSiteModel/generated-app contracts.
- Align tier/access semantics with `src/clone/tier-rules.ts`.
- Add schema validation and compatibility tests.

**Gate:** Existing fixture/CLI behavior remains reproducible; soft-gate is still clearly labeled.

## Milestone 1 — real-shape data and media parity

### EH-010 Sanitized golden fixtures

- **Builder:** Cursor Grok 4.5 High
- Build fixture matrix from supported OAuth/cookie extraction shapes.
- Add automated secret/PII scan and fixture provenance notes.

### EH-011 Canonical generated-app importer

- **Builder:** Cursor Grok 4.5 High
- Canonical/clone/export → independent app import.
- Separate immutable provenance from local mutable state.
- Idempotent replay and conflict queue.

### EH-012 R2 migration engine

- **Builder:** Cursor Grok 4.5 High
- Creator-owned bucket setup, resumable stream copy, checksums, retry ledger, private-read verification.

### EH-013 Library truth wizard

- **Builder:** Cursor Grok 4.5 High
- Data audit, exclusions, access ambiguities, parity report.
- Master browser review.

**Gate:** 100% accounted for; 98% sampled parity; every copied object verified.

## Milestone 2 — production application chassis

### EH-020 Generated repository

- **Builder:** Cursor Grok 4.5 High
- Full Next.js package, typed env, migrations, adapters, manifest, Vercel and Docker builds.

### EH-021 Premium patron theme

- **Builder:** Cursor Grok 4.5 High
- Adapt Relay patron gallery into one standalone theme.
- Remove network/comments/favorites; add controlled branding.

### EH-022 Native admin shell

- **Builder:** Cursor Grok 4.5 High
- Admin navigation, health framing, posts/media/tier workflows with fixture data.

**Gate:** Generated app installs/builds from clean directory and works without Relay runtime credentials.

## Milestone 3 — accounts, entitlements, hard media

### EH-030 Supabase identity/data path

- **Builder:** Cursor Grok 4.5 High
- Creator-owned Supabase/Auth/Postgres, schema, RLS, bootstrap/recovery.

### EH-031 Portable identity/data path

- **Builder:** Cursor Grok 4.5 High
- Postgres/auth adapter parity for Docker.

### EH-032 Entitlement service

- **Builder:** Cursor Grok 4.5 High
- Patreon OR independent billing OR manual grant; freshness and audit.

### EH-033 Private media delivery

- **Builder:** Cursor Grok 4.5 High
- Server-enforced access and short-lived R2 delivery; cache/security tests.

### EH-034 Account/paywall UX

- **Builder:** Cursor Grok 4.5 High
- Login/link/account/locked states and access-source clarity.

### EH-035 Visitor visual system

- **Builder:** Composer 2.5 Fast
- Cold-gallery tokens/type, media-first mosaic, visitor vs operator chrome split, account/login under PatronChrome (not Hatch Console). Preserve EH-030–034 honesty; `productionSafe` stays false.

**Gate:** security review; zero unauthorized premium byte reads; browser personas pass; visual acceptance (desktop + ~390px).

## Milestone 4 — Patreon continuity and Relay add-on

### EH-040 Creator-owned Patreon OAuth

- **Builder:** Cursor Grok 4.5 High
- **Status (kit):** Implemented in `packages/escape-hatch` (preview_only; `productionSafe: false`). Next: **EH-041**.
- Guided app setup, exchange/refresh/link, campaign validation, encrypted tokens.

### EH-041 Relay-managed verification service

- **Builder:** Cursor Grok 4.5 High
- Site registration, callback allowlist, signed assertions, rotation, revocation, monitoring, migration metadata.

### EH-042 Relay billing entitlement for connector

- **Builder:** Cursor Grok 4.5 High
- Separate configurable monthly add-on on Relay billing; webhook truth, feature flag, cancellation/grace.

### EH-043 OAuth choice and migration UX

- **Builder:** Cursor Grok 4.5 High
- Neutral choice, costs/dependency disclosure, setup, health, switch-off path.

**Gate:** both paths pass; managed outage is bounded; migration requires no site rebuild.

## Milestone 5 — independent billing

### EH-050 Billing provider contract

- **Builder:** Cursor Grok 4.5 High
- Normalized lifecycle/capability/policy interface and entitlement events.

### EH-051 Stripe eligible-business adapter

- **Builder:** Cursor Grok 4.5 High
- Creator-owned Stripe Billing/Checkout/Portal/webhooks and sandbox lifecycle.

### EH-052 Provider policy router

- **Builder:** Cursor Grok 4.5 High
- Dated official-policy matrix, content/use attestation, eligibility and launch blocking.

### EH-053 Lawful alternate billing recipe

- **Builder:** Cursor Grok 4.5 High
- Implement only after human approval of provider policy and sandbox evidence.

### EH-054 Tier and billing wizard

- **Builder:** Cursor Grok 4.5 High
- Mapping, preflight, duplicate-billing safeguards, sandbox results.

**Gate:** every advertised adapter passes sandbox parity; ineligible creators are never offered Stripe.

## Milestone 6 — operating CMS and integrations

### EH-060 Posts/media

- **Builder:** Cursor Grok 4.5 High
- Native create/edit/schedule/publish, R2 uploads, access simulation.

### EH-061 Tiers/patrons

- **Builder:** Cursor Grok 4.5 High
- Tier mapping/retirement, access reasons, grants, session controls.

### EH-062 Appearance/connections/health

- **Builder:** Cursor Grok 4.5 High
- Controlled brand publishing and actionable provider health.

### EH-063 Optional Patreon sync

- **Builder:** Cursor Grok 4.5 High
- Read-only transition sync, conflict queue, local-edit protection.

### EH-064 Optional Relay Crosspost API

- **Builder:** Cursor Grok 4.5 High
- Revocable scoped tokens, drafts/publish, audit/idempotency.

**Gate:** complete admin browser workflow; no provider dashboard needed for daily operations.

## Milestone 7 — deployment, email, recovery

### EH-070 Vercel golden path

- **Builder:** Cursor Grok 4.5 High
- Preview/production, domain, callbacks, rollback.

### EH-071 Portable Docker path

- **Builder:** Cursor Grok 4.5 High
- Compose/reverse proxy/TLS and current policy-validated host recipe.

### EH-072 Transactional email

- **Builder:** Cursor Grok 4.5 High
- Provider-neutral adapter, one validated recipe, DNS/delivery checks.

### EH-073 Backup/restore/update manifest

- **Builder:** Cursor Grok 4.5 High
- Scheduled backups, isolated restore, version/compatibility/diagnostics.

### EH-074 Deployment wizard

- **Builder:** Cursor Grok 4.5 High
- Smart-guided external steps, validation, recovery, launch checklist.

**Gate:** both paths deploy cleanly; domain/email/restore/rollback proven in browser and automation.

## Milestone 8 — handoff and release

### EH-080 Ownership packet

- **Builder:** Cursor Grok 4.5 High
- Source/data/media manifests, costs, dependencies, warranty, operations, migration rights.

### EH-081 Full golden journeys

- **Owner:** Fable/Sol master using browser; builders only fix findings.
- General eligible creator on Vercel/Stripe.
- Creator-owned Patreon OAuth.
- Relay-managed Patreon verification and cancellation/migration.
- Portable lawful-content route with validated provider policy.
- Mobile/keyboard/admin/patron/recovery.

### EH-082 Release security and independence

- **Builder:** Cursor Grok 4.5 High fixes; master/security reviewer accepts.
- Remove Relay optional services and prove native operation.
- Final security review, backup restore, rollback, secret scan.

**Gate:** human checklist signed; milestone report complete; release notes name supported adapters and dated policy evidence.

## Work-item minimum

Every `EH-*` implementation prompt and milestone report includes:

- exact status/dependencies;
- approved builder model;
- owned files;
- required skills;
- tests/browser/security evidence;
- human gates;
- rollback;
- integration notes and completion timestamp.
