# ADR: Multi-studio Account ownership (follow-up)

**Status:** Accepted for design; **not activated** in the initial Unified Relay Identity release.  
**Date:** 2026-07-27  
**Related:** [`multi-tenant-option-b.md`](multi-tenant-option-b.md), [`TRUTH_MATRIX_DISCOVERY.md`](TRUTH_MATRIX_DISCOVERY.md), [`coin-model-audit.md`](coin-model-audit.md)

## Context

Product intent allows one Relay login to manage **multiple Patreon campaigns / studios** over time, while each Patreon campaign powers at most one Relay studio. Today studio ownership is `Account.primaryRelayCreatorId` (singular). Session projection already returns `studios: []` so clients can grow without a breaking rename.

## Decision

1. **Near term (shipped with Unified Relay Identity):** Keep a single primary studio via `Account.primaryRelayCreatorId`. Session exposes `studios[]` with zero or one entry and `surfaces.studio`.
2. **Follow-up schema:** Introduce an explicit Account↔Tenant ownership/staff relation (e.g. `AccountStudioMembership` with roles `owner` | `staff`) rather than overloading `User.accountId` before authorization rules are designed.
3. **Provider identity:** Model Patreon person identity at Account level (`patronPatreonUserId` / future `ExternalProviderIdentity`) with **studio/campaign-scoped grants** (`OAuthCredential` purpose + campaign id). Do **not** move a single `ProviderAccount` between creator `User` rows to represent multi-campaign ownership.
4. **Active studio:** Optional `relay_active_studio` cookie is a UI preference only; every mutation validates the requested `relay_creator_id` against server-owned studios.
5. **Activation gate:** Inventory and migrate every `primaryRelayCreatorId` consumer (billing, payouts, Goal Cycle, automations, extensions, notifications, RLS creator-write policies, export, deletion) before allowing a second studio.

## Consequences

- Initial unified onboarding stays one-studio-safe.
- Multi-studio remains an explicit migration program, not an accidental side effect of Patreon’s unified profile.
- Adding `User.accountId` alone is deferred — it is insufficient and risky without the ownership relation and RLS review.

## Non-goals (this ADR)

- Activating multi-studio in production.
- Consolidating patron and creator OAuth credentials.
- Re-anchoring `Session` from `TenantMembership` to `Account`.
