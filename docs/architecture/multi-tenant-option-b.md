# Multi-tenant identity — Option B

Relay treats **one person** as a global **`Account`**. Access to each creator’s world is scoped with **`Tenant`** + membership rows. This avoids duplicating login identities per creator while keeping patron data isolated per creator.

## Model (summary)

| Concept | Prisma | Role |
|--------|--------|------|
| Global person | `Account` | Email/password or Patreon link at account level; optional `patronPatreonUserId`. |
| Creator’s workspace | `Tenant` | One tenant per creator (`relayCreatorId` when bound). |
| Creator/staff login | `User` | Belongs to `Tenant`; `UserKind` creator/staff; holds creator-side `ProviderAccount` + `OAuthCredential` (e.g. Patreon ingest). |
| Patron in a creator’s audience | `TenantMembership` | Links `Account` → `Tenant` with `TenantRole` (e.g. patron); `tierIds`; `Session` rows attach here for patron sessions. |
| Patreon campaign ownership | `CreatorProfile` | One per creator `User`; **`patreonCampaignId`** is the canonical “this creator owns Patreon campaign Z” key for webhooks, ingest, and patron matching. |
| Artist studio (claim) | `Account.primaryRelayCreatorId` | Optional FK to `Tenant.relayCreatorId` — at most one creator workspace per account (MT-031); null for patron-only accounts until onboarding provisions a studio. |

**Sessions:** Patron sessions use `Session` → `TenantMembership` (not a global user row for patrons). Creator sessions use `User`-level patterns per existing server wiring.

**Account-first email/password (MT-007):** `POST /api/v1/auth/signup` and `POST /api/v1/auth/login` create or resolve a global `Account` and a patron `TenantMembership` on a reserved **platform** tenant (`Tenant.relay_creator_id` = `RELAY_PLATFORM_CREATOR_ID`, default `__relay_platform`) so signup does not require a fan `creator_id`. Legacy `POST /api/v1/identity/register` / `login` remain; prefer `/api/v1/auth/*` for new clients.

**Patron allowlist (MT-009):** `loadPatronAuthContext` / `GET /api/v1/me/patron-auth` derive every `relay_creator_id` the account may access (all patron `TenantMembership` rows), not only the session’s primary `creator_id`.

**Creator mutations (MT-010):** Optional shared secret `RELAY_CREATOR_ROUTE_SECRET` (`X-Relay-Creator-Secret`) plus optional `RELAY_ENFORCE_CREATOR_TENANT` to require a `Tenant` row — see `src/identity/creator-route-guard.ts` and `.env.example`.

**Creator workspace (MT-032):** `POST /api/v1/creator/workspace` (Bearer — same opaque session as patron APIs) idempotently allocates `Tenant` + creator `User` + `CreatorProfile` and sets `Account.primaryRelayCreatorId` (`cr_*`). Safe to call before Patreon OAuth.

**Creator Patreon OAuth (MT-011 / MT-034):** `POST /api/v1/auth/patreon/creator/prepare` (Bearer) returns signed `state` bound to `Account.id` + `creator_id`. **MT-034:** `creator_id` must equal `Account.primaryRelayCreatorId` (not arbitrary strings). When `RELAY_ENFORCE_CREATOR_OAUTH_BIND=1`, `POST /api/v1/auth/patreon/exchange` requires the same Bearer + `state` (or `X-Relay-Creator-Secret` when `RELAY_CREATOR_ROUTE_SECRET` is set) and re-checks ownership. After exchange, the server best-effort sets `CreatorProfile.patreonCampaignId` when Patreon returns a single campaign (`src/patreon/creator-oauth-campaign-sync.ts`).

**Legacy:** `legacyFileId` fields support migration from file-backed identity (see integration roadmap).

## Cloud runtime (Supabase Auth, R2, paywall)

Hosting, Supabase Auth UUID linkage, ingestion, and fan entitlement checks are specified in **[`multi-tenant-cloud-runtime.md`](multi-tenant-cloud-runtime.md)**. That doc is the **runtime architecture** companion to this identity model.

**Supabase ↔ `Account` linkage (baseline):** Option B stands; Auth maps to `Account` via **`supabaseUserId`** (Pattern A), as decided in **[`adr/001-option-b-and-supabase-auth-linkage.md`](adr/001-option-b-and-supabase-auth-linkage.md)**.

**Supabase → Relay session (MT-033):** `POST /api/v1/auth/supabase/relay-session` validates the Supabase JWT, upserts `Account`, then issues an **opaque** patron `Session` (same shape as `POST /api/v1/auth/login`) for `requirePatronBearerSession` routes.

## Related

- [`../database/relational-model.md`](../database/relational-model.md) — principles, ERD, provider abstraction.
- [`multi-tenant-runs/README.md`](multi-tenant-runs/README.md) — implementation batches (Airtable **Multi Tenant Changes**).
