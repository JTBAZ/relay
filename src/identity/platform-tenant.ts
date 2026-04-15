/**
 * Reserved `Tenant.relay_creator_id` for the **platform** workspace: account-first email/password
 * signup before the user joins a specific creator’s audience (MT-007 / Option B).
 * Override with `RELAY_PLATFORM_CREATOR_ID` only if this collides with a real Relay creator id (unlikely).
 */
export function getPlatformRelayCreatorId(): string {
  const raw = process.env.RELAY_PLATFORM_CREATOR_ID?.trim();
  return raw && raw.length > 0 ? raw : "__relay_platform";
}
