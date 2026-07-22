# Generated site admin

## Product job

The creator should operate the delivered site from its own admin, not from Supabase, R2, source files, or a command line. Provider dashboards remain available for ownership and advanced recovery, but they are not the daily CMS.

UI builders use `frontend-design`, `vercel-react-best-practices`, and `web-design-guidelines`. The master planner browser-tests each workflow with realistic creator data.

## Navigation

Keep the admin narrow:

- Home
- Posts
- Media
- Tiers & access
- Patrons
- Appearance
- Connections
- Site health

No comments, favorites, DMs, community moderation, discovery network, or generalized automation suite.

## Home

Show:

- site URL and deployment version;
- next scheduled post;
- recent posts;
- patron/access totals by source;
- actionable connection/backup/domain alerts;
- last Patreon sync and media verification;
- a clear “Create post” action.

Avoid vanity charts in v1. Health and next action outrank analytics.

## Posts

Creator can:

- create, edit, preview, publish, unpublish, schedule, and duplicate;
- add title, sanitized rich body, tags, embeds/links, and community CTA;
- attach/reorder images, video, audio, and downloads;
- choose Public, All paid members, exact tiers, or tier-or-higher;
- see imported/native/crossposted origin and Patreon sync state;
- resolve sync conflicts without overwriting local work;
- copy a patron-facing link.

Every access change includes “View as” simulation before save. Schedule and publish mutations are server-authorized and idempotent.

## Media

- direct-to-R2 multipart upload with progress/resume;
- mime, size, checksum, processing, and usage status;
- private/public classification;
- replace while preserving post references and audit history;
- download/delete impact preview;
- orphan and failed-copy recovery.

Premium previews use authenticated delivery. The admin never constructs permanent public R2 URLs.

## Tiers and access

- list Patreon and independent tiers side by side;
- map source tier to billing product/price and access rank;
- show active patron counts and affected posts;
- edit benefit/display copy without changing provider identity;
- retire a tier with migration preview;
- test access personas.

Live price/provider changes require recent authentication and billing sandbox/preflight checks where feasible.

## Patrons

Show minimum operational data:

- site account;
- linked Patreon and billing identities;
- effective tiers and source;
- entitlement freshness/status;
- manual grants and expiry;
- account/security state.

Actions:

- inspect access reason;
- resend account verification/recovery;
- grant/revoke time-bounded manual access with reason;
- unlink an external identity through a protected flow;
- export the creator's lawful customer data;
- revoke sessions.

Do not expose raw OAuth tokens, full payment instruments, or unnecessary Patreon profile data.

## Appearance

Use the single premium theme contract:

- logo/avatar and hero media;
- title, introduction, community/Discord link;
- accent and approved typography pairing;
- light/dark choice where supported;
- gallery density/cover crop;
- paywall copy.

Changes stage in preview and publish as a versioned configuration. No raw scripts or CSS.

## Connections

Cards for database/auth, R2, Patreon, billing, email, domain, optional Relay Crosspost, and optional managed Patreon verification.

Each card shows:

- creator/Relay ownership;
- account identifier without secret;
- status and last successful check;
- recurring cost owner;
- reconnect/rotate/migrate;
- what breaks when disconnected.

Switching Patreon verification or billing adapters uses a guided migration, not an environment-variable scavenger hunt.

## Site health

- deployment/version and update compatibility;
- domain/TLS;
- DB/auth;
- private media probe;
- webhook freshness;
- Patreon freshness;
- email;
- backup/restore status;
- audit and diagnostic download.

Health copy provides the next safe action. “Connected” is not enough when scopes, capabilities, callbacks, or webhooks are unhealthy.

## Optional Relay Crosspost

The independent site may expose a revocable, scoped API token so Relay Crosspost can create a draft or publish media posts.

Requirements:

- site remains source of truth for received posts;
- per-token scopes, expiry, rotation, and audit;
- idempotency and replay protection;
- no Relay access to site billing/admin;
- creator can disconnect without affecting native publishing;
- incoming drafts clearly show origin.

## UX acceptance

Browser tests cover:

1. bootstrap admin and recovery;
2. create media post and schedule;
3. change access and verify patron denial/allow;
4. map/retire a tier;
5. inspect dual-source patron and add expiring grant;
6. replace branding and publish;
7. diagnose a broken webhook/R2 credential;
8. revoke Crosspost;
9. complete each critical action at mobile width;
10. keyboard-only operation and visible errors.
