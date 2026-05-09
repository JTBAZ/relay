/**
 * @fileoverview Tier 1.1 account projection from an opaque session + RLS context wiring.
 * @description `AccountContext` capability hints; `requireAccount` sets `relay.account_id` for Postgres RLS.
 * @see ../lib/supabase-rls-context.js
 * @see src/jsdoc-core-entities.ts
 */

/**
 * Tier 1.1 — resolved Relay account for an authenticated opaque session.
 * Authz for data access remains RLS + handlers; this is identity + capability hints.
 */
export type AccountContext = {
  /** Internal stable id (CUID). Use as RLS `relay.account_id` key. */
  accountId: string;
  /** Supabase Auth user id when linked. */
  supabaseUserId: string | null;
  /** Creator workspace scope (`cr_*`) when this account owns a studio. */
  primaryRelayCreatorId: string | null;
  /** True when at least one `TenantMembership` exists (any role). */
  hasSupporterMemberships: boolean;
};

/**
 * @returns {boolean} True when `primaryRelayCreatorId` is set.
 */
export function canActAsCreator(ctx: AccountContext): boolean {
  return Boolean(ctx.primaryRelayCreatorId);
}

/**
 * @description Fast-fail for handlers needing any patron-side membership; fine-grained entitlements use RLS.
 * @param {AccountContext} ctx
 * @param {string} _tenantId Reserved for future tenant-scoped checks.
 * @returns {boolean}
 */
export function canActAsSupporterFor(ctx: AccountContext, _tenantId: string): boolean {
  return ctx.hasSupporterMemberships;
}
