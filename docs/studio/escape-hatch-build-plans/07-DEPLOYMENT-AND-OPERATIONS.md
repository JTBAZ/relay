# Deployment and operations

## Deployment doctrine

The wizard offers a polished golden path without making the generated application inseparable from it.

### Path A: fastest launch

- Vercel-hosted Next.js application;
- creator-owned Supabase Auth/Postgres;
- creator-owned Cloudflare R2;
- creator-owned transactional email account;
- creator-owned billing account;
- creator-owned domain.

### Path B: portable deployment

- Docker image/Compose definition;
- Postgres and portable auth adapter;
- creator-owned R2;
- creator-owned email/billing accounts;
- reverse proxy/TLS recipe;
- one currently policy-validated host recipe.

MojoHost is the first policy-reviewed Path B candidate because its current official creator guidance explicitly welcomes legal, rightfully used adult content and lists virtual-machine infrastructure. It is not a supported wizard option until the deployment, backup/restore, SLA/security, and human gates in [`13-PROVIDER-POLICY-EVIDENCE.md`](13-PROVIDER-POLICY-EVIDENCE.md) pass. Hosting eligibility does not imply billing eligibility.

## Setup automation

Prefer provider OAuth/API integration when it preserves creator ownership. Otherwise:

- deep-link the exact provider page;
- request only required values;
- store secrets directly in the target provider when possible;
- validate each credential immediately;
- show revocation instructions;
- delete temporary Relay copies after handoff.

The master planner must browser-run both deployment routes. Documentation screenshots and selectors are versioned because provider dashboards change.

## Domains and callbacks

Support provider URL first, then custom domain.

Before custom-domain completion verify:

- DNS target and propagation;
- TLS certificate;
- canonical origin;
- `www`/apex redirect choice;
- Patreon OAuth callbacks;
- auth/email callbacks;
- billing success/cancel/portal URLs;
- webhook public endpoints;
- CORS/CSRF allowed origins;
- sitemap/robots policy.

Domain instructions distinguish registrar, DNS host, application host, email sender, and CDN; do not treat them as one service.

## Transactional email

Use a provider-neutral SMTP/email adapter and one validated golden-path provider.

Required messages:

- account verification/sign-in;
- password/admin recovery;
- email change/security alert;
- subscription/access state notices where not sent by the billing provider;
- managed connector or integration failure notices.

Wizard checks SPF, DKIM, DMARC guidance, sender verification, delivery to a test inbox, link origin, and safe redaction. Creator owns the email account and sender domain.

## Secrets

- Generate `.env.example` with names and descriptions only.
- Validate required values with a typed startup schema.
- Separate public, server, build, and migration secrets.
- Never put tokens in the ownership packet, manifest, generated zip history, screenshots, logs, or browser storage.
- Support rotation for database, R2, billing webhooks, Patreon OAuth, Relay assertions, site API, and email.
- Production startup fails closed when required security material is absent or placeholder-shaped.

## Backups and restore

The generated admin exposes backup health but does not expose raw credentials.

Required:

- scheduled Postgres backup;
- R2 inventory/versioning or documented equivalent;
- configuration/manifest backup;
- encrypted secret inventory owned outside the site;
- restore to an isolated environment;
- documented RPO/RTO expectations;
- quarterly reminder if the creator has no managed maintenance.

The wizard cannot complete until one backup is created and a lightweight restore/read verification passes. Release signoff requires a full restore rehearsal.

## Health and observability

Provide creator-readable checks for:

- application/database;
- auth callbacks;
- private media read;
- Patreon freshness;
- billing webhook lag/failures;
- transactional email;
- deployment/version;
- domain/TLS;
- backup freshness;
- optional Relay services.

Logs use trace IDs and redact tokens, signed URLs, emails, payment data, and private media keys. A downloadable diagnostic bundle contains versions, statuses, and recent error codes—not secrets or patron content.

## Deploy and rollback

Workflow:

1. deterministic build;
2. migrations in preview/staging;
3. deploy preview;
4. automated smoke/security tests;
5. creator preview approval;
6. production migration with backup;
7. production deploy;
8. post-deploy health and checkout/access checks;
9. retain previous stable artifact and migration compatibility;
10. one guided rollback when safe.

Database changes are forward-compatible across at least the current and previous application version. Irreversible migrations need a separate human gate and restore plan.

## Updates and support

- The delivered chassis/version is recorded in the manifest.
- Defects demonstrably present at handoff are covered for 90 days.
- The warranty does not include creator modifications, provider-policy changes, new features, dependency modernization, or hands-on operations.
- After 90 days, updates and operational work are paid unless a separate agreement says otherwise.
- Relay-managed Patreon verification is maintained only while its monthly add-on is active.
- Security notices may still be published without promising free implementation.

## Exit gates

- Clean deploy on both supported paths.
- Provider URL and custom-domain rehearsal.
- Backup and isolated restore.
- Rollback to prior stable artifact.
- No Relay credential required for native site operation.
- Optional Relay connector outage degrades only Patreon verification, not admin, native publishing, independent billing, or media already authorized through other sources.
