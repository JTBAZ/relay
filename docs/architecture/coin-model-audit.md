# Coin model — schema audit (GR-T0-2)

**Parent:** [`AUTH_GUARDRAILS_TIER_1.md`](../AUTH_GUARDRAILS_TIER_1.md) §1.1–1.2 · [`multi-tenant-option-b.md`](multi-tenant-option-b.md)  
**Prompt:** [`docs/Airtable Drops/Guardrails/GR-T0-2-coin-model-active-role-prompt.md`](../Airtable%20Drops/Guardrails/GR-T0-2-coin-model-active-role-prompt.md)

## Schema confirmation

- **`Account.primaryRelayCreatorId`** — Present, **nullable**, unique FK to `Tenant.relayCreatorId` (`Account` in `prisma/schema.prisma`). ✓ Artist studio scope when set; null for patron-only accounts.

- **`TenantMembership`** — `@@unique([accountId, tenantId])` with `role` (`TenantRole`, default `patron`) and `tierIds[]`. One row per (account, tenant). ✓

- **Author-identified engagement tables** — `Comment` exists (`relay_comments`) with `patronUserId` (patron `User.id`), **not** `Account.id`. No `Like` / `Favorite` / `Follow` models in schema yet. **Note:** When those tables are added, align with Tier 0 invariant: author identity should key on **`Account.id`** where applicable; current `Comment` predates that convention and uses patron user id. Documented for follow-up, **no migration in GR-T0-2**.

- **Same Account, both sides** — No `role` enum on `Account` that would prevent one person from holding creator capability (`primaryRelayCreatorId`) and supporter `TenantMembership` rows concurrently. ✓ Coin model is expressible.

## Provisioning paths

- **Creator (heads):** First idempotent **`POST /api/v1/creator/workspace`** after Supabase sign-in (`bootstrapStudioAfterSupabase` in `web/lib/relay-auth-bootstrap.ts`) provisions `Tenant` + `User` + `CreatorProfile` and sets `Account.primaryRelayCreatorId`.

- **Supporter (tails):** `TenantMembership` rows (e.g. patron tier) via Patreon link, manual support, or signup against the platform tenant (`RELAY_PLATFORM_CREATOR_ID` / Option B flows in `multi-tenant-option-b.md`).

## Unified identity rule

All author-attributed rows (comments, likes, follows, favorites) must key on **`Account.id`**, not on `relay_active_role` or a “current side” discriminator. Active role is a **UI lens** only (`relay_active_role` cookie); authz remains **API + RLS + DB** (`Account`, `TenantMembership`).

## Capability matrix (Unified Relay Identity)

| Capability | Meaning | Source |
|------------|---------|--------|
| `can_enter_feed` / `surfaces.feed` | Every authenticated `Account` may enter Feed | Session present |
| `has_supporter_activity` / `activity.has_supporter_activity` | Meaningful non-platform patronage | Non-platform `TenantMembership` (patron), or `PatronFollow` / `PatronEntitlementSnapshot` targeting a non-platform creator. **Platform bootstrap membership alone is false.** |
| `has_studio` / `surfaces.studio` | Server-verified studio ownership | `Account.primaryRelayCreatorId` set |
| `patreon.identity_linked` | Patreon person linked to Account | `Account.patronPatreonUserId` (+ optional `PatronOAuthCredential` health) |
| `patreon.creator_sync_connected` | Creator ingest OAuth present for owned studio | `OAuthCredential` purpose `creator_ingest` on studio creator `User` |

`GET /api/v1/me/session` returns these additively (`primary_relay_creator_id`, `studios[]`, `surfaces`, `activity`, `patreon`, `suggested_home`). Never infer studio ownership from `Session.creator_id` (often `__relay_platform`). `available_roles` remains for RoleSwitcher compatibility but must not treat platform membership as supporter activity.

Implementation: [`src/identity/meaningful-supporter-signal.ts`](../../src/identity/meaningful-supporter-signal.ts), [`src/identity/account-session-projection.ts`](../../src/identity/account-session-projection.ts).
