# ADR 003 — Pilot tier data: normalized catalog truth (PUX-arch-001)

**Status:** Accepted  
**Date:** 2026-05-20  
**Work item:** Batting Order **Pilot Build Plan** → `PUX-arch-001`  
**Unlocks:** `PUX-arch-002`, `PILOT-003`, `PILOT-004`

## Context

Pilot UX gates (PUX-000 … PUX-006) exercise paywall and feed behavior against faux accounts seeded into Postgres. Tier labels, post gates, and patron entitlements must share one **normalized** shape so server-side gating, UI chips, and tests agree without re-parsing Patreon JSON at read time.

Historical file-backed ingest stored nested tier maps inside `canonical.json`. The pilot path requires relational **`Tier`**, **`PostVersion.tierIds`**, and **`PatronEntitlementSnapshot.entitledTierIds`** as the only sources used for entitlement **decisions**.

## Decision

For the pilot window, tier truth uses **normalized relational structures only**:

| Layer | Table / field | Role |
| --- | --- | --- |
| Creator catalog | `Tier` (`relayTierId`, `title`, `amountCents`, …) | Display names + ordering; populated on Patreon/SS ingest |
| Post paywall gate | `PostVersion.tierIds` (`String[]`) | Ingest truth — which tiers unlock the post |
| Patron entitlement | `PatronEntitlementSnapshot.entitledTierIds` (`String[]`) | What the patron currently holds for a creator |

**Tier id shape:** stable Relay keys such as `patreon_tier_{numericId}` or seeded pilot ids (`patreon_tier_ava_supporter`). These ids appear consistently in all three layers.

**Explicitly out of scope for pilot entitlement decisions:**

- Storing or consulting a **Patreon JSON snapshot table** (or opaque provider JSON blob) when deciding whether a patron may access a post.
- Using `TenantMembership.tierIds` alone for gate decisions at render time (schema comments mark it as non-authoritative; snapshots are canonical).

Patreon JSON:API payloads are parsed **once** at ingest or OAuth refresh, then discarded in favor of normalized ids.

## Write paths (must stay aligned)

| Event | Writer | Normalized output |
| --- | --- | --- |
| Patreon post/tier sync | `IngestService` → `DbCanonicalStore.saveSnapshot` | `Tier` upsert, `PostVersion.tierIds`, `PostTier` links |
| Patreon patron OAuth / refresh | `extractPatronSyncFromIdentity` → `upsertPatronEntitlementSnapshot` | `PatronEntitlementSnapshot.entitledTierIds` |
| SubscribeStar patron sync | `syncSubscribeStarPatronEntitlements` | Same snapshot table |
| Pilot UX seed (no OAuth) | `seedPilotUxDevAccounts` | All three layers from `tests/fixtures/pilot-ux-seed.json` |

## Read paths (must use normalized ids)

| Surface | Resolver |
| --- | --- |
| Patron feed gating | `assemblePatronFeed` — snapshot `entitledTierIds` vs latest `PostVersion.tierIds` via `tier-rules` |
| Gallery / detail permission | `evaluatePostPermission` / `evaluateTierRules` on canonical snapshot (DB-backed store mirrors `PostVersion.tierIds`) |
| UI tier chips / labels | `Tier` table via `web/lib/tier-access.ts` (read-only for Patreon-sourced posts) |

## Verification checklist

Run before marking **PUX-arch-001** Done:

```bash
npm run build
npx vitest run tests/pilot-tier-architecture.test.ts
npx vitest run tests/patreon-tier-mapping.test.ts tests/patron-entitlement-snapshot.test.ts
npx vitest run tests/pilot-ux-permission-parity.test.ts
```

| Exit criterion | Evidence |
| --- | --- |
| Architecture decision recorded | This ADR |
| Ingest writes `Tier` + `PostVersion.tierIds` | `src/ingest/canonical-store-db.ts` (tier upsert loop); `tests/patreon-tier-mapping.test.ts` |
| Patron snapshot uses tier id arrays | `src/identity/patron-entitlement-snapshot.ts`; `tests/patron-entitlement-snapshot.test.ts` |
| No Patreon JSON snapshot table for pilot gates | `prisma/schema.prisma` — no entitlement JSON table; `tests/pilot-tier-architecture.test.ts` |
| End-to-end parity | `tests/pilot-ux-permission-parity.test.ts` (seeded normalized structures) |

## Consequences

- **PILOT-003** can treat the Tier table as catalog truth without a parallel JSON catalog.
- **PUX-arch-002** builds on this: presentation overrides (`PostOverride`) must not replace ingest tier gates — see [ADR 004](./004-pilot-three-layer-permissions.md).
- Future provider JSON debug storage (if added) must remain **non-authoritative** for paywall decisions unless a new ADR supersedes this one.

## Related

- [`../../pilot-ux-dev-login.md`](../../pilot-ux-dev-login.md) — PUX gate harness
- [`../patreon-origin-relay-bedrock.mdc`](../../../.cursor/rules/patreon-origin-relay-bedrock.mdc) — ingest vs overlay (orthogonal to tier id normalization)
- `prisma/schema.prisma` — `Tier`, `PostVersion`, `PatronEntitlementSnapshot`
- `src/patreon/map-patreon-to-ingest.ts` — Patreon → `patreon_tier_*` mapping
- `src/patreon/patreon-user-identity.ts` — OAuth → `entitledTierIds`
