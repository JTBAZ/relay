/**
 * @fileoverview Default active role for UI shell (`creator` vs `supporter`).
 * @description Derived from studio ownership and presence of memberships; pairs with `relay_active_role` cookie.
 * @see ./active-role-available.js
 */

export type ActiveRole = "creator" | "supporter";

/**
 * @description Default UI lens for a new session. Never used for authz — cookie is a hint for shell selection only.
 * @param {{ primaryRelayCreatorId: string | null; hasSupporterMemberships: boolean }} account
 * @returns {ActiveRole}
 */
export function defaultActiveRoleForAccount(account: {
  primaryRelayCreatorId: string | null;
  hasSupporterMemberships: boolean;
}): ActiveRole {
  if (account.primaryRelayCreatorId) return "creator";
  if (account.hasSupporterMemberships) return "supporter";
  return "supporter";
}
