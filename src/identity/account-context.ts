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

export function canActAsCreator(ctx: AccountContext): boolean {
  return Boolean(ctx.primaryRelayCreatorId);
}

/**
 * Fast-fail for handlers that need any patron-side membership.
 * Fine-grained tenant entitlements are enforced in RLS (Tier 1.2+).
 */
export function canActAsSupporterFor(ctx: AccountContext, _tenantId: string): boolean {
  return ctx.hasSupporterMemberships;
}
