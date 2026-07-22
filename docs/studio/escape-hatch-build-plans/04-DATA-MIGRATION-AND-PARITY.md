# Data migration and parity

## Source pipeline

```text
Patreon JSON:API or authorized extraction
  -> SyncBatchInput
  -> CanonicalSnapshot/Postgres canonical rows
  -> CreatorExportIndex + R2 objects
  -> CloneSiteModel
  -> Escape Hatch application seed/import
```

Do not create a new Patreon mapper inside Escape Hatch. Reuse:

- [`src/patreon/jsonapi-types.ts`](../../../src/patreon/jsonapi-types.ts);
- [`src/ingest/types.ts`](../../../src/ingest/types.ts);
- [`src/ingest/canonical-store.ts`](../../../src/ingest/canonical-store.ts);
- [`src/clone/types.ts`](../../../src/clone/types.ts);
- [`src/clone/tier-rules.ts`](../../../src/clone/tier-rules.ts);
- [`src/export/types.ts`](../../../src/export/types.ts);
- [`packages/escape-hatch/src/types.ts`](../../../packages/escape-hatch/src/types.ts).

## Required fixture policy

Tests use sanitized golden fixtures captured from real Relay-supported response shapes. Never commit:

- live OAuth/cookie tokens;
- Patreon client secrets;
- R2 credentials;
- real patron names, email addresses, addresses, payment identifiers, or session IDs;
- raw creator datasets without explicit consent and irreversible sanitization.

Fixtures must retain structural oddities even when values are replaced: absent relationships, sparse `included`, nullable fields, duplicate media URLs, tier sentinel values, HTML bodies, attachment roles, and pagination links.

### Required golden fixture families

Build from or extend:

- `tests/fixtures/patreon/oauth-list-post-text-only.json`;
- `tests/fixtures/patreon/cookie-list-with-media.json`;
- `tests/fixtures/pilot-ux-seed.json`;
- `packages/escape-hatch/fixtures/sample.bundle.json`;
- `packages/escape-hatch/fixtures/clone-site.json`;
- `packages/escape-hatch/fixtures/relay-dump/`.

Add sanitized fixtures for:

1. public text-only post;
2. all-patrons post with image;
3. exact-tier and tier-or-higher posts;
4. video, audio, attachment, embed, and multi-image gallery;
5. missing cover with valid attachment;
6. duplicate/normalized CDN URLs;
7. free follower versus paid member;
8. deleted/unpublished/tombstoned post;
9. export failure and missing blob;
10. mature/legal-adult metadata without explicit media;
11. Unicode title/slug and long sanitized rich body;
12. creator with changed tier names/prices and legacy patrons.

## Normalized import contract

The generated site stores source provenance and independent state separately.

### Immutable provenance

- source provider and provider object ID;
- original publication timestamp;
- source tier IDs and access snapshot;
- source media ID, mime, byte length, and checksum;
- extraction/import batch ID;
- source revision and last successful sync.

### Independent mutable state

- local slug and redirects;
- local body/branding edits;
- local publish/schedule status;
- local tier mappings and products;
- independent media object key;
- local visibility/access override;
- imported, native, or crossposted origin.

An optional Patreon sync must not overwrite a local native post or silently replace an edited imported post. Conflicts produce a review item.

## Media migration

R2 is the primary media destination.

For every object:

1. resolve the current Relay export/storage source;
2. stream copy—do not load large assets fully into process memory;
3. compute/compare SHA-256 and byte length;
4. preserve safe mime and original filename metadata;
5. write to an opaque creator/site namespace;
6. verify a private authenticated read;
7. record the copy result in an idempotent migration ledger.

Migration is resumable and replay-safe. Retries never create duplicate logical assets. A failed item records reason, attempt count, and next action.

Premium objects may not be copied to generated `public/`. Public thumbnails may be materialized separately only when the post is public or the derivative is intentionally safe.

## Tier parity

Use the authoritative Relay tier evaluator. Test:

- `relay_tier_public`;
- `relay_tier_all_patrons`;
- paid-member semantics;
- exact tier;
- tier-or-higher rank/amount;
- removed/renamed tier mappings;
- patrons with multiple active tiers;
- manual access grant;
- active Patreon plus canceled independent subscription;
- canceled Patreon plus active independent subscription.

The wizard must display ambiguity instead of choosing a paid tier by array order.

## Parity report

Before deployment, produce a creator-readable and machine-readable report:

- posts expected/imported/excluded/failed;
- media expected/copied/verified/failed and bytes;
- tiers expected/mapped/unmapped;
- access simulations and mismatches;
- body/attachment omissions;
- source batch and manifest hashes.

The default exit gate is at least 98% sampled page parity and 100% accounted-for items. “Accounted for” includes creator-approved exclusions; unexplained loss is always blocking.

## Data tests

Every mapper or schema slice must include:

- schema/contract validation;
- golden-input snapshot;
- canonical-to-generated round trip;
- idempotent replay;
- malformed and missing-field cases;
- creator/tenant separation;
- output with no secrets or unsanitized PII;
- compatibility test against the previous manifest/schema version.

Run existing Patreon, tier, media, export, clone, and Escape Hatch suites before accepting a contract change. Exact commands are maintained in [`09-TESTING-AND-RELEASE-GATES.md`](09-TESTING-AND-RELEASE-GATES.md).
