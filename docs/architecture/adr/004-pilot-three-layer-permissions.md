# ADR 004 — Pilot permissions: three-layer model (PUX-arch-002)

**Status:** Accepted  
**Date:** 2026-05-20  
**Work item:** Batting Order **Pilot Build Plan** → `PUX-arch-002`  
**Depends on:** [ADR 003 — normalized tier catalog truth](./003-pilot-tier-normalized-catalog-truth.md) (`PUX-arch-001`)  
**Unlocks:** `PILOT-004`, `PILOT-012`

## Context

Pilot UX gates exercise paywall, feed, and Library behavior against seeded faux accounts. Tier **decisions** must never be conflated with Relay **presentation** edits. Creators need to hide posts, retag assets, and opt into discovery without accidentally widening or narrowing Patreon/SubscribeStar paywall truth.

Historical confusion: treating Gallery visibility toggles as if they changed who is entitled, or storing tier ids on `PostOverride` rows. That would let a presentation layer bypass ingest gates.

## Decision

Patron access uses **three independent layers**. Each layer has one job; lower layers are never widened by higher layers.

| Layer | Source of truth | What it controls | What it must **not** do |
| --- | --- | --- | --- |
| **A — Post tier gate** | `PostVersion.tierIds` (ingest + creator `PATCH …/audience-access`) | Which tiers unlock full post/media export | Read `PostOverride` for tier ids |
| **B — Patron entitlement** | `PatronEntitlementSnapshot.entitledTierIds` (OAuth refresh, stale worker, pilot seed) | Which tiers the patron currently holds for a creator | Gate from `TenantMembership.tierIds` alone at render time |
| **C — PostOverride presentation** | `PostOverride` / gallery overrides store | Visibility (`visible` / `hidden` / `review`), tag deltas, discovery opt-in | Store or mutate `tier_ids`; widen paywall access |

### Evaluation order (patron surfaces)

When deciding whether a patron may see a post:

1. **Content owner bypass** — verified creator always sees their Library unblurred (`isContentOwner`).
2. **Layer C — hidden** — `PostOverride.visibility === hidden` → **deny** (even if Layer B would allow).
3. **Layer A × Layer B — tier gate** — `PostVersion.tierIds` vs snapshot `entitledTierIds` via `tier-rules` → **allow**, **locked_preview**, or **deny**.

Layer C can **narrow** discovery (hide from feed, visitor catalog, permission endpoint) but **never widen** Layer A. A tier-entitled patron who hits a hidden post gets `deny`, not full content.

### Write paths

| Action | Layer | Writer |
| --- | --- | --- |
| Patreon / SS ingest | A | `IngestService` → `PostVersion.tierIds`, `PostTier` |
| Creator audience edit | A | `PATCH /api/v1/gallery/posts/:post_id/audience-access` → `updatePostAudienceTierGate` |
| OAuth / refresh / pilot seed | B | `upsertPatronEntitlementSnapshot`, `seedPilotUxDevAccounts` |
| Hide / tags / discovery | C | `GalleryOverridesStore.setVisibility`, tag merges, `setDiscoveryEligible` |

### Read paths

| Surface | Layers consulted |
| --- | --- |
| Patron feed | C (hidden filter) → A × B (`assemblePatronFeed`) |
| Post permission API | C → A × B (`evaluatePostPermission` + overrides load in `server.ts`) |
| Gallery list (creator) | A for tier chips; C merged for visibility/tags |
| Gallery list (visitor/patron) | C excludes hidden; A × B for URL redaction |

## Invariants (enforced in tests)

- `PostOverride` schema and TS types expose **no** `tier_ids` / `tierIds` field.
- `GalleryOverridesStore` contract has **no** tier mutation methods.
- `evaluatePostPermission` checks **hidden before** tier allow would succeed.
- `assemblePatronFeed` skips hidden post ids **before** tier entitlement check.
- `updatePostAudienceTierGate` writes **only** `Post` / `PostVersion` / `PostTier` — not overrides.

## Verification checklist

Run before marking **PUX-arch-002** Done:

```bash
npm run build
npx vitest run tests/pilot-permission-architecture.test.ts
npx vitest run tests/post-permission.test.ts
npx vitest run tests/pilot-ux-permission-parity.test.ts
```

| Exit criterion | Evidence |
| --- | --- |
| Three-layer model documented | This ADR |
| Override store has no tier field | `tests/pilot-permission-architecture.test.ts`; `prisma/schema.prisma` `PostOverride` |
| Permission evaluation order | `src/gallery/post-permission.ts`; architecture + `tests/post-permission.test.ts` |
| Hidden excludes patron feed | `src/patron/assemble-patron-feed.ts`; PUX-006 in `tests/pilot-ux-permission-parity.test.ts` |
| End-to-end parity | `tests/pilot-ux-permission-parity.test.ts` gates B–F |

## Consequences

- **PILOT-004** can sign off the permission model knowing presentation and paywall are separated.
- **PILOT-012** guardrail UX copy can cite this ADR: visibility toggles ≠ audience tier access.
- Any future “tip to unlock” or Relay-native tier lane must still respect Layer A as ingest/canonical gate unless a new ADR explicitly supersedes this split.

## Related

- [`../../pilot-permission-signoff.md`](../../pilot-permission-signoff.md) — PILOT-004 product sign-off checklist
- [`../../pilot-ux-dev-login.md`](../../pilot-ux-dev-login.md) — PUX gate harness (Gate E/F hidden vs tier)
- [ADR 003](./003-pilot-tier-normalized-catalog-truth.md) — normalized tier ids for Layers A and B
- `src/gallery/post-permission.ts` — patron permission triage
- `src/gallery/types.ts` — `PostOverride` shape
- `src/gallery/hidden-post-ids.ts` — Layer C hidden set for feed
- `src/relay/update-post-audience-tier-gate.ts` — Layer A creator PATCH
- `src/identity/patron-entitlement-snapshot.ts` — Layer B snapshot writes
