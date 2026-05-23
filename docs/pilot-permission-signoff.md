# PILOT-004 — Permission model sign-off

**Status:** Signed off (engineering)  
**Depends on:** PILOT-003 (normalized tier catalog), PUX-arch-002 / [ADR 004](architecture/adr/004-pilot-three-layer-permissions.md)  
**Unlocks:** PILOT-005 (patron shell / feed UX), PILOT-012 (guardrail copy + UX acceptance doc)

## Product checklist

| # | Question | Expected answer |
| --- | --- | --- |
| 1 | Can a creator hide a post without changing who is Patreon-entitled? | Yes — Layer C (`PostOverride.visibility`) only; tier ids on `PostVersion` unchanged. |
| 2 | Can hiding widen paywall access? | No — hidden is checked before tier allow in `evaluatePostPermission` and patron feed assembly. |
| 3 | Where do creators edit tier gates? | Layer A — audience access / ingest; **not** overrides store. |
| 4 | Where do patrons get tier truth? | Layer B — `PatronEntitlementSnapshot` (OAuth refresh / pilot seed), not membership alone at render. |
| 5 | Is UI copy clear that visibility ≠ Patreon access? | Yes — headline **Relay visibility ≠ Patreon access** on inspect sidebar, bulk visibility, post batch details, action bar chips. |

## Three layers (summary)

| Layer | Controls | Does not |
| --- | --- | --- |
| **A — Post tier gate** | Who can unlock (tier ids on post version) | Read overrides for tiers |
| **B — Patron entitlement** | Which tiers the patron holds | Replace snapshot at feed time with stale session only |
| **C — Relay presentation** | Hide / review / tags / discovery | Store or mutate tier ids |

Full decision record: [ADR 004 — Pilot permissions: three-layer model](architecture/adr/004-pilot-three-layer-permissions.md).

## Engineering verification

```bash
npm run build
npx vitest run tests/pilot-permission-architecture.test.ts
npx vitest run tests/post-permission.test.ts
npx vitest run tests/pilot-ux-permission-parity.test.ts
npx vitest run tests/pilot-permission-signoff.test.ts
```

| Evidence | Location |
| --- | --- |
| Permission evaluation order | `src/gallery/post-permission.ts` |
| Hidden set for feed | `src/gallery/hidden-post-ids.ts`, `src/patron/assemble-patron-feed.ts` |
| Override schema (no tiers) | `prisma/schema.prisma` `PostOverride`, `tests/pilot-permission-architecture.test.ts` |
| PUX gates B–F | `tests/pilot-ux-permission-parity.test.ts` |
| Creator UI copy | `web/lib/pilot-permission-copy.ts`, `tests/pilot-permission-signoff.test.ts` |

## Pilot UX dev harness

Seeded accounts and gates: [`pilot-ux-dev-login.md`](pilot-ux-dev-login.md). Gate F proves entitled patron loses feed + permission when creator sets **Hidden**.

## Sign-off notes

- **PostOverride** must not gain `tier_ids` / `tierIds` without a new ADR.
- **SubscribeStar** and non-Patreon lanes stay out of pilot scope (`RELAY_PILOT_PATREON_ONLY`).
