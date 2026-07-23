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
- **Status (kit):** Implemented in `packages/escape-hatch` (preview_only; `productionSafe: false`).
- Guided app setup, exchange/refresh/link, campaign validation, encrypted tokens.

### EH-041 Relay-managed verification service

- **Builder:** Cursor Grok 4.5 High
- **Status:** Implemented (preview_only; `productionSafe: false`). Kit `relay_managed` assertion verify + Relay `src/escape-hatch/managed-verify` in-memory service.
- Site registration, callback allowlist, signed assertions, rotation, revocation, monitoring, migration metadata.

### EH-042 Relay billing entitlement for connector

- **Builder:** Cursor Grok 4.5 High
- **Status:** Implemented (preview_only; `productionSafe: false`). Separate configurable monthly add-on; webhook truth, feature flag, cancellation/grace; gates managed-verify mint.

### EH-043 OAuth choice and migration UX

- **Builder:** Cursor Grok 4.5 High
- **Status:** Implemented (preview_only; `productionSafe: false`). Neutral `/admin/patreon/choice` (neither path preselected), disclosure cards, setup/health, switch-off to `creator_oauth` without rebuild. Next: **EH-050** (complete) → **EH-051**.

**Milestone 4 gate residuals:** kit/CI honesty for both paths + bounded managed outage copy + no-rebuild migration; live multi-tenant managed outage drill remains open. `productionSafe` stays false.

## Milestone 5 — independent billing

### EH-050 Billing provider contract

- **Builder:** Cursor Grok 4.5 High
- **Status:** Implemented (preview_only; `productionSafe: false`). Shared `BillingProvider` contract, normalized lifecycle events, billing entitlement grant/revoke (`source: billing`), stub default + fail-closed Stripe shell. Next: **EH-051** (complete) → **EH-052**.

### Visitor Frontend Product Contract gate

- **Owner:** Sol planning/review; implementation remains Cursor Grok 4.5 High.
- **Contract:** [`14-VISITOR-FRONTEND-PRODUCT-CONTRACT.md`](14-VISITOR-FRONTEND-PRODUCT-CONTRACT.md).
- **Status:** Accepted contract required before EH-054 and EH-060/EH-061 acceptance. EH-051/EH-052/EH-053 may proceed because provider adapters and policy evidence are presentation-independent.
- Locks canonical patron/operator routes, controlled cold-gallery system, pinned mosaic plus recent feed, query/filter full-gallery mode, post body/media/attachment shape, minimal locked frame with optional public cover, unified tier conversion, responsive/accessibility baseline, and persona/network acceptance.

### EH-051 Stripe eligible-business adapter

- **Builder:** Cursor Grok 4.5 High
- **Status:** Implemented (preview_only; `productionSafe: false`). Creator-owned Stripe Billing/Checkout/Portal/signed webhooks with injectable CI client, `/api/billing/*` routes, checkout/portal hooks for `/tiers` and `/account`. Next: **EH-052** (complete) → **EH-053**.

### EH-052 Provider policy router

- **Builder:** Cursor Grok 4.5 High
- **Status:** Implemented (preview_only; `productionSafe: false`). Dated official-policy matrix, content/use attestation, recipe router, Checkout/paid-launch blocking for ineligible use. Admin `/admin/billing/policy`. Next: **EH-053**.

### EH-053 Lawful alternate billing recipe

- **Builder:** Cursor Grok 4.5 High
- **Status:** Implemented (preview_only; `productionSafe: false`). NOWPayments crypto adapter shell + injectable CI client; dated matrix rows for NOWPayments / CCBill / Segpay; recipe router offers crypto Checkout for Stripe-gap categories; CCBill/Segpay listed as merchant-approval guidance (LLC/approved account most times) without live Checkout. Evidence: `docs/qa/ESCAPE_HATCH_EH_053_EVIDENCE.md`, `15-ALTERNATE-BILLING-RECIPES.md`. Next: **EH-054**.

### EH-054 Tier and billing wizard

- **Builder:** Cursor Grok 4.5 High
- **Status:** Implemented (preview_only; `productionSafe: false`). Tier→price map (`data/billing-tier-map.json`), admin wizard on `/admin/tiers`, preflight API, unified visitor `/tiers` with context-aware CTAs, duplicate-billing Checkout guard, PatronChrome Tiers link. Evidence: `docs/qa/ESCAPE_HATCH_EH_054_EVIDENCE.md`. Next: **EH-060**.

**Gate:** every advertised adapter passes sandbox parity; ineligible creators are never offered Stripe.

## Milestone 6 — operating CMS and integrations

### EH-060 Posts/media

- **Builder:** Cursor Grok 4.5 High
- **Status:** Implemented (preview_only; `productionSafe: false`). Local posts/media CMS: draft/publish + feature_order + public_cover + body_plain on `data/site.json`; admin editor on `/admin/posts`; POST/DELETE `/api/admin/posts`; local multipart upload to `data/private-media/`; searchable gallery with draft filter. Explicit deferrals: R2 multipart, schedule cron, rich HTML. Evidence: `docs/qa/ESCAPE_HATCH_EH_060_EVIDENCE.md`. Next: **EH-061**.

### EH-061 Tiers/patrons

- **Builder:** Cursor Grok 4.5 High
- **Status:** Implemented (preview_only; `productionSafe: false`). Tier retire/benefit_copy on `site.json`; `/admin/tiers` CMS editor + persona preview; `/admin/patrons` manual grants (`data/manual-grants.json`), access-reason inspect, portable session revoke; public `/tiers` hides retired. Evidence: `docs/qa/ESCAPE_HATCH_EH_061_EVIDENCE.md`. Next: **EH-062**.

### EH-062 Appearance/connections/health

- **Builder:** Cursor Grok 4.5 High
- **Status:** Implemented (preview_only; `productionSafe: false`). `/admin/appearance` publishes approved theme dials to `site.json` + `theme-vars.css`; `/admin/connections` adapter cards with next actions; `/admin/health` actionable rollup. Evidence: `docs/qa/ESCAPE_HATCH_EH_062_EVIDENCE.md`. Next: **EH-063**.

### EH-063 Optional Patreon sync

- **Builder:** Cursor Grok 4.5 High
- **Status:** Implemented (preview_only; `productionSafe: false`). Read-only transition sync into `site.json` with `data/patreon-sync-state.json`, CMS local-edit protection, conflict queue on `/admin/patreon`, post origin badges. Live network posts fetch deferred (fixture/injectable). Evidence: `docs/qa/ESCAPE_HATCH_EH_063_EVIDENCE.md`. Next was **EH-064** (done).

### EH-064 Optional Relay Crosspost API

- **Builder:** Cursor Grok 4.5 High
- **Status:** Implemented (preview_only; `productionSafe: false`). Revocable scoped Bearer tokens (`crosspost:draft` / `crosspost:publish`), inbound `POST /api/relay/crosspost/posts`, audit + Idempotency-Key, `/admin/crosspost` mint/revoke, Connections Crosspost card. Origin `crossposted` in sync-state. Evidence: `docs/qa/ESCAPE_HATCH_EH_064_EVIDENCE.md`. Next: **EH-070**.

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
