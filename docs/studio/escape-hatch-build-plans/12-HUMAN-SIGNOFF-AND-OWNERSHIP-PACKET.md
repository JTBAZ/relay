# Human signoff and ownership packet

## Completion definition

The wizard completes when the creator has a live, tested provider URL and can operate the site. A custom domain may still be propagating, but its instructions and validation workspace must be ready.

Package generation alone is not completion.

## Human signoff

### Library and brand

- Creator identity, tier catalog, post counts, bodies, attachments, and media reviewed.
- Exclusions and unresolved source limitations accepted explicitly.
- Public/member/tier personas match Patreon expectations.
- Visitor site reflects creator brand and works on desktop/mobile.
- Creator accepts one fixed published scheme and the controlled branding boundary.
- Creator approves feature-post order and every optional public cover used on a locked post.

### Patron frontend

- Production `/`, `/posts/[slug]`, `/tiers`, `/login`, `/account`, and legal routes match [`14-VISITOR-FRONTEND-PRODUCT-CONTRACT.md`](14-VISITOR-FRONTEND-PRODUCT-CONTRACT.md).
- Patron chrome contains no Hatch Console or operator link; `/preview` remains operator-only.
- Empty search state shows the approved feature mosaic and recent feed.
- A typed query or active media/tier/mature filter shows one full eligible gallery; clearing all search state restores curation exactly.
- Search does not expose premium body text, attachment metadata, media URLs, object keys, or highlights to unauthorized accounts.
- Locked posts use the approved generic frame or an explicitly public cover, never a fetched premium original.
- Image stacks, video/audio players, secure downloads, rich body, and attachment order match the approved post.
- The unified tier catalog routes existing Patreon patrons and new independent subscribers correctly.
- Loading, empty, not-found, media failure, stale, expired, dual-source, managed-outage, checkout-failure, and restored states provide a safe next action.
- Desktop, approximately 390px mobile, keyboard, focus, contrast, and reduced-motion checks pass.

### Accounts and access

- Creator can recover the administrator account.
- Existing Patreon patron links and receives correct access.
- Independent test subscriber receives correct access.
- Lower-tier/public account cannot retrieve premium bytes.
- Dual-source patron is not prompted into accidental duplicate billing.
- Signed-in unentitled and insufficient-tier accounts receive the correct tier action without premium metadata leakage.
- Manual grant and revocation work.

### Patreon choice

- Creator-owned OAuth: creator controls app/credentials and refresh test passes; or
- Relay-managed verification: monthly price, data handling, SLA boundary, cancellation effect, and migration path accepted.

### Billing and policy

- Creator's declared use is compatible with the displayed provider recipe on the checked date.
- Every tier maps to product/price/currency/interval/access.
- Sandbox checkout, webhook, cancellation, failed payment, recovery, and portal pass.
- Creator understands processor, refund, dispute, tax, and policy responsibility.
- No live adult-content checkout is routed through Stripe contrary to published policy.

### Infrastructure

- Creator owns hosting, DB/auth, R2, email, billing, and domain accounts.
- R2 checksums and private-read tests pass.
- Deployment health and callbacks pass.
- Transactional email arrives and links to correct origin.
- Backup exists and isolated restore proof is recorded.
- Previous deployment rollback is available.

### Independence

- Creator downloads source and ownership packet.
- Creator logs into generated admin without Relay assistance.
- Optional Relay credentials are removed in a test environment; native site remains usable.
- Managed Patreon can be replaced by creator-owned OAuth without rebuild.
- Creator understands the 90-day defect warranty and paid-maintenance boundary.

## Ownership packet contents

### 1. Ownership manifesto

Plain-language statement that the creator owns:

- imported/normalized data and media;
- generated application instance/configuration;
- domain and provider accounts;
- site customer relationship and independent billing data;
- right to run, modify, migrate, and self-host the delivered copy.

Also state Relay's retained reusable generator/chassis rights and the creator's perpetual package license.

### 2. Source package

- source archive and repository instructions;
- commit/artifact hash;
- chassis/schema/manifest versions;
- build/test commands;
- license notices;
- generated-app test report.

### 3. Data package

- normalized posts/tiers/media metadata;
- source provenance IDs;
- media inventory and checksums;
- exclusions/failures;
- parity report;
- patron/customer export instructions, with PII separated and protected.

### 4. Infrastructure inventory

For each service:

- provider and creator-owned account identifier;
- purpose;
- billing owner and estimated/known recurring cost;
- domain/callback endpoints;
- environment variable names;
- rotation/recovery link;
- backup/export/migration route;
- policy checked date.

No secrets.

### 5. Operating guide

- administrator login/recovery;
- create/schedule/gate a post;
- pin/order feature posts and publish/remove a safe public cover;
- upload/replace media;
- operate gallery search/filter preview and verify default-state restoration;
- manage tiers/prices/patrons;
- inspect health;
- backup/restore;
- rotate keys;
- switch Patreon/billing/hosting adapters;
- contact boundaries for provider, Relay warranty, and paid support.

### 6. Optional Relay services

- Crosspost token scopes/revocation;
- managed Patreon verification subscription, status page, cancellation date, stale behavior, and migration steps;
- explicit statement that native publishing, independent billing, storage, and accounts do not require those services.

### 7. Warranty and change boundary

- handoff date;
- 90-day defect-warranty end date;
- covered delivery defects;
- excluded creator customizations, provider/policy changes, feature work, dependency modernization, and operations;
- paid support/maintenance contact path.

## Acceptance evidence

Attach or link:

- parity and checksum report;
- automated test summary;
- security review;
- browser journey screenshots/record;
- sandbox billing event IDs without sensitive payment data;
- backup/restore result;
- deployment/domain health;
- creator approval and known limitations.

## Refusal conditions

Do not mark handoff complete when:

- premium media is public or unauthorized retrieval succeeds;
- source items disappeared without explanation;
- provider eligibility is unverified or misrepresented;
- required accounts/credentials are Relay-owned without disclosed optional-service terms;
- backup/restore is unproven;
- creator cannot access admin/source;
- live billing was enabled without sandbox/webhook proof;
- tests were skipped but reported as passing;
- prohibited or illegal content is identified.
