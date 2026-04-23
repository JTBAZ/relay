# URL and tenant identity contract (Tier 0.4)

Relay uses three layers of identifiers for a creator workspace. This document locks how they may be used and points to the canonical resolvers.

## Three identifiers

| Identifier | Source | Mutability | Audience |
|------------|--------|------------|----------|
| `Tenant.id` (CUID) | Prisma | **Immutable** | Internal — FKs, RLS policies, joins |
| `Tenant.relayCreatorId` (`cr_*`) | Application mint | **Immutable** | Cross-system correlation (Patreon ingest, logs, webhooks) |
| `CreatorProfile.publicSlug` | Patreon vanity (default) / user | **Mutable** | URLs (`/patron/c/<slug>`), display |
| `CreatorProfile.slugSource` (`PublicSlugSource`) | System | **Mutable** | Provenance: `allocated` (opaque placeholder), `patreon_default` (from campaign vanity in display snapshot), `user_chosen` (PATCH onboarding or Action Center). Automations **must not** overwrite `publicSlug` when `slugSource === user_chosen`. |

### Default slug lifecycle (2026-04)

1. **Workspace provision** — `public_slug` is an opaque unique value (`allocateUniquePublicSlug(..., null)`); `slug_source = allocated`.
2. **Patreon campaign snapshot** — On first snapshot with `patreon_name` (campaign vanity), `promoteSnapshotToProfile` may replace the slug with a normalized unique vanity **only if** `slug_source` is still `allocated`, then sets `patreon_default`.
3. **Explicit edit** — `PATCH /api/v1/creator/public-slug` sets `slug_source = user_chosen` (even if the slug string is unchanged).

`@username` on `CreatorProfile` is separate (underscores allowed); it is not required to match `public_slug`.

## Contract

1. **Slug → UUID (tenant id)** — All server-side slug resolution goes through **`resolveTenantBySlug`** in `src/identity/resolve-tenant.ts`. After resolution, handlers pass **`Tenant.id`** (and/or other stable ids) to downstream logic — not the raw slug string.
2. **`cr_*` → UUID** — Use **`resolveTenantByRelayCreatorId`** for the canonical `relayCreatorId` → `Tenant` lookup when starting from an external correlation id.
3. **Once per request** — Resolve at the route or API entry; avoid re-resolving the same slug deep in the call stack.

## Audit summary (2026-04-17)

Greps: `relay_creator_id|relayCreatorId` and `public_slug|publicSlug` across `*.ts`, `*.tsx`, `schema.prisma`.

| Category | Count (approx.) | Notes |
|----------|-------------------|--------|
| External correlation (`cr_*` in ingest, webhooks, patron scope, indexes) | Many | Expected — not join keys to `Tenant.id` in business rules; some tables store `relay_creator_id` as a scope column. |
| URL handling (routes, `Link`, localStorage keys for UI cache) | Several | Web uses slug in path and caches `relay_creator_id` / `relay_public_slug` client-side only. |
| One-time resolution | **1** primary API: `GET /api/v1/public/creators/:slug` | Now delegates to `resolveTenantBySlug`. Patron page uses `fetchPublicCreatorBySlug` → same API. |
| API surface (JSON fields `relay_creator_id`, `public_slug`) | Several | Acceptable — response shape for clients. |
| **FK on `public_slug`** | **0** | No foreign keys reference `CreatorProfile.publicSlug`. |
| **RLS on `public_slug` / `relay_creator_id`** | **0** | No `CREATE POLICY` in migrations references these columns (Tier 1.2 not landed). |

### Schema note — Option B linkage (not a “new” defect)

`Account.primaryRelayCreatorId` **references `tenants.relay_creator_id`**, not `tenants.id`. That is the intentional Option B pattern (see `docs/architecture/multi-tenant-option-b.md`): the studio pointer is the immutable `cr_*` string. **Do not add additional FKs** to `public_slug` or duplicate this pattern without review.

### Recommended follow-ups (non-blocking)

- Call sites that filter by `tenant: { relayCreatorId }` for patron/ingest flows are **scope correlation**, not slug resolution; migrating them to `Tenant.id` would be a larger performance/authz pass (out of scope for Tier 0.4).

## PR review checklist

- [ ] No new FK references `CreatorProfile.publicSlug`.
- [ ] No new RLS policy references `public_slug` or `relay_creator_id` without an explicit Tier 1 design.
- [ ] Any new route that takes a public slug calls **`resolveTenantBySlug`** once at the top (or uses an API that does).
- [ ] `cr_*` strings in new code appear only for external correlation, env defaults, or API payloads — not as a substitute for `Tenant.id` in new join tables.
- [ ] Client redirects built from user input use **`resolvePostAuthPath`** (see **Safe-redirect rule** above).

## Safe-redirect rule (Tier 1.6)

Any redirect destination that incorporates user-supplied input **must** pass through **`resolvePostAuthPath`** from `web/lib/post-login-redirect.ts`.

- **Hard-coded literal** destinations (e.g. `router.replace("/login")`) — safe; no wrapper needed.
- **API-derived** destinations (response body from your own server) — treated as trusted; document the trust boundary in a short comment when it is not obvious.
- **User-input** destinations (`searchParams.get`, ad hoc query parsing, URL fragments from untrusted sources) — **must** wrap with `resolvePostAuthPath` before `router.replace` / `router.push` / `window.location.assign`.

**Lint:** `web/.eslintrc.json` — `no-restricted-syntax` flags `router.replace`/`router.push`/`location.assign` whose **first argument is a direct `.get(...)` call** (same-line passthrough). Patterns that wrap with `resolvePostAuthPath` first are allowed. For edge cases, use `// eslint-disable-next-line no-restricted-syntax -- <reason>`.

## Related

- `src/identity/resolve-tenant.ts` — `resolveTenantBySlug`, `resolveTenantByRelayCreatorId`, `TenantRef`.
- `src/creator/public-slug.ts` — `normalizePublicSlugCandidate` (shared with slug validation).
- `web/lib/post-login-redirect.ts` — `resolvePostAuthPath` (post-login / returnTo safety).
