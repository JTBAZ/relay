export type ActiveRole = "creator" | "supporter";

/**
 * Default UI lens for a new session. Never used for authz — cookie is a hint for shell selection only.
 */
export function defaultActiveRoleForAccount(account: {
  primaryRelayCreatorId: string | null;
  hasSupporterMemberships: boolean;
}): ActiveRole {
  if (account.primaryRelayCreatorId) return "creator";
  if (account.hasSupporterMemberships) return "supporter";
  return "supporter";
}
