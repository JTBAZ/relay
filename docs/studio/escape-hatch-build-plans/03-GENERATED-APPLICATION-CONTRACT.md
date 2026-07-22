# Generated application contract

## Deliverable

Escape Hatch generates a complete, creator-owned Next.js TypeScript application. “TSX website” means the presentation layer is editable TSX, not that security and persistence are compressed into a static page.

The package must contain:

- App Router pages and components;
- server routes/actions for authenticated operations;
- database schema and forward migrations;
- auth, billing, Patreon, storage, email, and deployment adapters;
- creator admin;
- sanitized seed/demo data separate from creator production data;
- unit, integration, generated-app, and browser tests;
- Dockerfile/Compose assets and Vercel configuration;
- environment schema and example file with names only;
- backup/restore and upgrade commands;
- license and ownership materials.

## Required specialist guidance

- React/Next implementation: `vercel-react-best-practices`.
- Visitor/admin visual work: `frontend-design`, followed by `web-design-guidelines`.
- Supabase/Auth/RLS: `supabase` and `supabase-postgres-best-practices`.
- Billing: `stripe-best-practices`; Connect guidance only for Relay's own add-on billing, not creator subscription custody.
- Security-critical changes require the `security-review` subagent before milestone acceptance.

## Repository shape

The exact names may evolve, but generated packages must preserve these boundaries:

```text
app/
  (public)/             visitor gallery, post, login, account
  admin/                creator operations
  api/                  webhooks, signed media, sync, health
components/
lib/
  auth/
  billing/
  entitlements/
  patreon/
  storage/
  email/
  policy/
db/
  schema/
  migrations/
scripts/
  setup, verify, backup, restore, update
tests/
deploy/
  vercel, docker
escape-hatch.manifest.json
OWNERSHIP.md
OPERATIONS.md
```

## Visitor routes

- `/` — branded gallery.
- `/posts/[slug]` — post detail with server-resolved access.
- `/tiers` — independent tier catalog and Patreon-transition explanation.
- `/login` — site account and Patreon-link entry.
- `/account` — active access sources, billing management, Patreon link, migration guidance.
- `/community` or configured external link — Discord/community handoff.
- `/privacy`, `/terms`, `/content-policy` — creator-configured legal surfaces with clear template status.

## Admin routes

Defined fully in [`08-GENERATED-SITE-ADMIN.md`](08-GENERATED-SITE-ADMIN.md). At minimum:

- dashboard/health;
- posts and media;
- tiers/prices/access;
- patrons and overrides;
- brand/site settings;
- connections and billing policy status;
- deployment, domain, backup, and audit log.

## Domain contracts

### Content

Preserve title, sanitized rich body, publish timestamp, tags, stable slug, media ordering/roles, attachments, source provider IDs, and provenance. Source IDs are immutable integration keys; display slugs may change with redirect history.

### Access

One shared server-side evaluator handles:

- `public`;
- `member_only` (active paid access, not merely a free follow);
- `tier_gated` exact/mapped tiers;
- tier-or-higher based on explicit rank/amount ordering;
- creator/admin bypass with audit;
- manual grants with expiry and reason.

Generated client code never contains a second authoritative access implementation.

### Media

- Premium objects are private.
- Pages request short-lived signed URLs or stream through an authenticated route.
- Object keys are opaque and not treated as authorization.
- Downloads set safe content disposition and mime handling.
- Caches cannot turn a premium response public.
- Public derivatives and premium originals use distinguishable policy.

### Accounts

Independent site accounts are canonical for the generated site. Patreon and billing identities link to those accounts. Provider email alone is not sufficient proof for automatic merging; use verified link flows and collision handling.

## Adapter contracts

The package must compile against interfaces for:

- `AuthProvider`;
- `DatabaseProvider`;
- `StorageProvider`;
- `BillingProvider`;
- `PatreonVerificationProvider`;
- `TransactionalEmailProvider`;
- `DeploymentProvider`.

The v1 implementations are:

- Supabase Auth/Postgres and portable Postgres/auth;
- Cloudflare R2;
- Stripe for eligible creator businesses;
- creator-owned Patreon OAuth and Relay-managed Patreon verification;
- one validated transactional email recipe;
- Vercel and Docker deployment.

Adapters cannot weaken shared entitlement, audit, idempotency, or webhook contracts.

## Visual chassis

Use the Relay patron gallery as the source, then remove Relay-network features that do not belong:

- preserve media-forward hierarchy, cover behavior, tier clarity, typography discipline, responsive gallery, and paywall affordances;
- remove Relay navigation, discovery economy, comments, favorites, and network-specific actions;
- use creator brand assets and controlled tokens;
- do not expose Hatch Console chrome on the live patron site.

## Manifest

`escape-hatch.manifest.json` records:

- chassis and schema versions;
- generated timestamp and creator/site IDs;
- enabled adapters and versions;
- source export manifest hash;
- applied migrations;
- required environment variable names;
- feature flags;
- known exclusions;
- warranty start/end;
- optional Relay service dependencies and cancellation behavior.

No secret or patron PII belongs in the manifest.

## Portability invariant

The source package must remain buildable after removing Relay API credentials. Optional Crosspost and managed Patreon verification may become unavailable, but native admin publishing, independent accounts, billing, storage, backups, and the live visitor site must continue to work.
