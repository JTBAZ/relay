/**
 * @fileoverview Reserved platform tenant key for account-first signup (Option B / MT-007).
 * @description `Tenant.relay_creator_id` used before the user joins a specific creator audience. Override with `RELAY_PLATFORM_CREATOR_ID` only if this collides with a real Relay creator id (unlikely).
 * @see src/jsdoc-core-entities.ts
 */

/**
 * @description Returns effective platform id from `RELAY_PLATFORM_CREATOR_ID` or default `__relay_platform`.
 * @returns {string}
 */
export function getPlatformRelayCreatorId(): string {
  const raw = process.env.RELAY_PLATFORM_CREATOR_ID?.trim();
  return raw && raw.length > 0 ? raw : "__relay_platform";
}
