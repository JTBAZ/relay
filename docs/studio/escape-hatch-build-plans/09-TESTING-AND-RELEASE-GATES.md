# Testing and release gates

## Principle

No slice is complete because its happy-path mock returns success. Tests must prove the same data shapes Relay extracts, the same access rules patrons rely on, and the same external boundaries the creator will own.

## Test layers

### 1. Contract and fixture tests

- Validate Patreon JSON:API, ingest, canonical, export, clone, and generated-app schemas.
- Use sanitized golden fixtures derived from supported OAuth/cookie extraction shapes.
- Assert fixture redaction: no live tokens, secrets, patron PII, or explicit private media.
- Version contracts and test backward compatibility.

### 2. Unit tests

- tier/access evaluator;
- entitlement-source union and freshness;
- slug and redirect behavior;
- default-home versus active-search gallery state transitions and exact curation restoration;
- authorized search-field visibility and filter behavior;
- media policy and signed URL lifetime;
- webhook normalization/idempotency;
- provider policy eligibility;
- manifest and ownership packet generation.

### 3. Integration tests

- creator-owned Supabase/Postgres schema and RLS;
- portable Postgres/auth adapter parity;
- R2 multipart copy/upload/read/delete;
- Patreon OAuth exchange/refresh/link;
- Relay managed-verification assertion issue/verify/rotate/revoke;
- billing sandbox checkout/webhook/portal lifecycle;
- email delivery adapter;
- backup/restore;
- generated package build.

### 4. Security tests

- cross-tenant/account/post/media identifiers;
- modified claims and client tier IDs;
- OAuth state/PKCE/open redirect;
- assertion/webhook replay and out-of-order delivery;
- guessed object keys, expired signatures, CDN cache leakage;
- admin privilege/recovery/session revocation;
- SSRF/file upload/mime/content-disposition;
- secrets in bundles, logs, zip, manifests, and diagnostics.

Every security-critical milestone runs the `security-review` subagent after tests. Findings block acceptance until resolved or explicitly human-deferred with risk.

### 5. Generated-application tests

Generate from each fixture family, install from a clean directory, migrate a clean DB, build, start, and test:

- visitor gallery/post routes;
- public tier, login/account, and legal routes;
- legacy `/p/[slug]` redirect and operator-only `/preview`;
- admin;
- provider adapters;
- Docker and Vercel build;
- package contains no Relay-local absolute paths;
- package runs with all optional Relay services removed.

### 6. Browser tests

Master planner uses `browser-use`.

Every UI slice:

- desktop and mobile;
- keyboard path;
- realistic content;
- loading, empty, degraded, and retry state;
- one destructive-action confirmation;
- screenshots and friction notes.
- no premium body/media/embed/attachment metadata request from unauthorized states.

Every milestone:

- full Relay Studio wizard;
- generated patron site personas;
- generated admin workflow;
- external provider sandbox/setup steps;
- launch and handoff.

### 6a. Visitor frontend contract matrix

The canonical matrix is [`14-VISITOR-FRONTEND-PRODUCT-CONTRACT.md`](14-VISITOR-FRONTEND-PRODUCT-CONTRACT.md). At minimum, browser tests prove:

- empty query with default filters shows creator-pinned mosaic plus recent feed;
- a typed query or any active media/tier/mature filter replaces both sections with one full eligible gallery;
- clearing query and every filter restores feature order, feed order, URL state, and accessible focus behavior;
- title/tag/body search does not return unauthorized premium body excerpts or attachment metadata;
- image stacks, gated video/audio players, and downloads allow and deny by the same server entitlement;
- locked posts use a generic frame or explicitly public cover without fetching a premium original;
- `/tiers` presents context-aware actions for public, Patreon, independent, insufficient, and dual-source states;
- patron chrome contains no Hatch Console or other operator link;
- desktop, approximately 390px mobile, keyboard, reduced-motion, loading, empty, error, and recovery states pass.

### 7. Operations tests

- interrupted/resumed media copy;
- migration replay;
- deploy failure and rollback;
- expired credentials and rotation;
- optional Relay connector outage;
- backup freshness and isolated restore;
- billing/email/webhook incident diagnostics.

## Existing regression suites to preserve

At minimum, builders select and run relevant tests from:

```text
tests/patreon-golden-fixtures.test.ts
tests/map-patreon-post-to-ingest.test.ts
tests/patreon-tier-mapping.test.ts
tests/patreon-sync-post-access.test.ts
tests/patreon-patron-oauth.test.ts
tests/patron-entitlement-snapshot.test.ts
tests/pilot-ux-permission-parity.test.ts
tests/media-export-access-context.test.ts
tests/patron-media-export-access.test.ts
tests/media-delivery-policy.test.ts
tests/relay-upload-r2.test.ts
tests/r2-config.test.ts
tests/workstream-f.clone.test.ts
tests/workstream-g.access-identity.test.ts
packages/escape-hatch/tests/escape-hatch.test.ts
```

Existing Part 2 payment/deploy tests exercise stubs and do not prove production provider readiness.

## Required new test packages

Organize by vertical slice, not one giant end-to-end file:

- `escape-hatch-contracts`
- `escape-hatch-golden-extract`
- `escape-hatch-media-migration`
- `escape-hatch-entitlements`
- `escape-hatch-managed-patreon`
- `escape-hatch-billing-adapters`
- `escape-hatch-generated-app`
- `escape-hatch-admin`
- `escape-hatch-wizard`
- `escape-hatch-deploy-vercel`
- `escape-hatch-deploy-portable`
- `escape-hatch-backup-restore`
- `escape-hatch-security`

Use repository naming conventions when materialized; these names describe ownership boundaries, not mandatory directories.

## Milestone gates

### Data gate

- 100% items accounted for; at least 98% sampled page parity.
- All access ambiguities visible/resolved.
- Checksums match for every successful media copy.

### Paywall gate

- Zero unauthorized premium byte reads.
- RLS/tenant tests pass on real Postgres.
- Creator-owned and managed Patreon paths pass.
- Dual-source cancellation and stale-state tests pass.

### Billing gate

- Every advertised adapter passes real sandbox lifecycle tests.
- Provider-policy evidence is current and human-approved.
- No ineligible creator is offered Stripe.

### Visitor frontend contract gate

- Human signoff covers route map, patron/operator separation, two-state gallery, search/filter boundary, post schema, teaser policy, unified tier conversion, controlled branding, media behavior, and exclusions.
- EH-054 does not pass until `/tiers` mapping and duplicate-billing behavior match the contract.
- EH-060/EH-061 do not pass until post/media/tier/admin behavior matches the contract.
- Known preview drift is recorded as planned work or compatibility migration, never reported as complete.

### UX gate

- Master browser acceptance has no blocking ambiguity or unrecoverable path.
- Desktop/mobile/keyboard checks pass.
- Creator can resume after leaving during provider setup or media copy.

### Deployment gate

- Clean Vercel and portable deploys.
- Provider URL, domain, TLS, callback, webhook, and email checks.
- Backup/restore and rollback proven.

### Independence gate

- Remove Relay credentials/services.
- Native admin, independent accounts/billing, media, and visitor site remain operational.
- Managed Patreon can be migrated to creator-owned OAuth without rebuild.

## Release commands

Each work item specifies exact commands in its acceptance block. Final release includes:

```powershell
npm run build
npm run test
npm run lint --prefix web
npm run build --prefix web
npm run escape-hatch:test
```

Add generated-app, provider-sandbox, security, browser, and restore commands as they land. Never silently skip integration suites because credentials or services are missing; report them as “not run” and block the corresponding gate.
