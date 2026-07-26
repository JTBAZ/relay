# Identity, entitlements, and paywall

This is a security-critical contract. Grok implements it; Fable/Sol plans and reviews it. Builders must use the `supabase`, `supabase-postgres-best-practices`, and relevant Stripe skills. Each milestone requires a `security-review` subagent and browser attack/recovery checks.

## Account model

The generated site's account is the durable identity. External identities link to it:

- Patreon user/campaign membership;
- billing customer/subscription;
- admin authentication;
- optional Relay managed-verification subject.

Never authorize from user-editable metadata, email text alone, client-provided tier IDs, or UI state.

For the Supabase path:

- enable RLS on exposed tables;
- use `app_metadata`, database joins, or server-owned claims for authorization—not `user_metadata`;
- keep service-role/secret keys server-only;
- use short-lived sessions for sensitive operations and explicit session revocation;
- make security-sensitive views `security_invoker` or private.

## Entitlement rule

A patron receives access when at least one verified source grants a mapped tier:

```text
effective access = active Patreon entitlement OR active independent billing entitlement OR unexpired manual grant
```

The evaluator returns source, tier IDs, observed timestamp, stale-after timestamp, and reason. A boolean alone is insufficient for operations or UX.

Rules:

- duplicate sources do not create duplicate accounts;
- active Patreon access suppresses an unnecessary independent checkout warning and explains migration;
- cancellation of one source does not revoke another active source;
- stale Patreon data follows explicit fail-open/fail-closed policy by content class and shows degraded copy;
- manual grants require reason, actor, expiry, and audit entry;
- admin bypass is server-side and audited.

## Creator-owned Patreon OAuth

The wizard guides the creator through:

- creating/choosing a Patreon OAuth client;
- registering exact callbacks;
- entering credentials directly into an encrypted setup channel;
- testing state, exchange, refresh, campaign identity, and member entitlement;
- recording credential ownership and rotation instructions.

The generated site encrypts refresh tokens at rest with a creator-owned key. No token appears in a generated zip, browser bundle, log, diagnostic packet, or Relay record after handoff.

## Relay-managed Patreon verification

This is an optional monthly Relay service, not the default independence path.

### Service boundary

- Independent site redirects to Relay with site ID, return URL, nonce, and PKCE/state material.
- Relay authenticates Patreon, resolves entitlement, and returns a short-lived signed assertion scoped to the site.
- The site verifies issuer, audience, signature, nonce, expiry, entitlement observation time, and key ID.
- Relay does not serve site media, hold site billing credentials, or become the site's account database.
- Allowlisted callback origins and per-site keys prevent open redirects and cross-site assertion reuse.

### Billing and cancellation

- The add-on appears separately on the creator's Relay invoice.
- Price is configurable and must cover OAuth/token operations, monitoring, security, support, and provider-change risk.
- Cancellation copy states the exact last service date and provides creator-owned OAuth migration steps.
- Native site accounts, Stripe subscriptions, media, and admin continue working after cancellation.
- The site warns the creator before Patreon-derived entitlements become stale; it must not delete linked patrons.

### Operational requirements

- tenant isolation;
- key rotation with overlapping verification;
- signed assertion replay protection;
- token refresh and provider failure monitoring;
- status/incident communication;
- privacy/data-processing disclosure;
- per-site revocation;
- export of non-secret link metadata for migration;
- feature flag and kill switch.

## Media authorization

Every premium-media request:

1. authenticates the site account;
2. resolves current server-side entitlement;
3. confirms post visibility and tier rule;
4. records an access audit/metric without sensitive URL logging;
5. returns a short-lived signed R2 URL or streams bytes.

Prohibited:

- premium files in `public/`;
- permanent public R2 URLs;
- using object-key secrecy as access control;
- authorizing from query-string tier IDs;
- CDN caching without private/no-store or entitlement-safe cache keys;
- returning a signed URL with a lifetime longer than the entitlement policy allows.

## Admin bootstrap and recovery

- First admin is bound during wizard setup and confirmed through a second channel.
- Recovery requires creator-controlled email plus provider recovery; no universal Relay backdoor.
- Role changes, exports, token creation, billing-provider changes, and destructive content actions require recent authentication.
- Emergency recovery is documented, logged, time-bounded, and unavailable after Relay handoff unless the creator buys support and explicitly authorizes access.

## Security test matrix

At minimum:

- public/member/tier allow and deny;
- tier-or-higher boundary;
- patron with multiple sources;
- stale, expired, revoked, and replayed assertions;
- cross-creator account/media/tier IDs;
- modified JWT/user metadata;
- guessed R2 keys and expired signed URLs;
- cache poisoning and URL leakage;
- OAuth state/PKCE/open redirect attacks;
- webhook replay/out-of-order events;
- administrator session theft/revocation;
- managed connector cancellation/migration.

No launch while any unauthorized media read is reproducible.
