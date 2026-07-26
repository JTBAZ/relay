/**
 * @fileoverview Production-safe defaults for security env flags.
 * @description [R-SEC-01 / R-SEC-10 — security-review 2026-06, Tier B] Several hardening switches default
 *   OFF in development so local flows stay frictionless, but default ON in production so a deploy cannot
 *   accidentally ship with paywall/operator protections disabled. Explicit env values always win.
 * @see docs/security-review-2026-06.md
 */

function isProductionRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production";
}

/**
 * @description Parse an optional tri-state env flag. Returns `undefined` when unset/blank.
 */
export function parseOptionalEnvBool(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  const v = raw.trim().toLowerCase();
  if (!v) return undefined;
  if (v === "0" || v === "false" || v === "no") return false;
  if (v === "1" || v === "true" || v === "yes") return true;
  return undefined;
}

function resolveEnvBoolWithProductionDefault(args: {
  raw: string | undefined;
  env?: NodeJS.ProcessEnv;
  defaultInProduction: boolean;
  defaultInDevelopment: boolean;
}): boolean {
  const explicit = parseOptionalEnvBool(args.raw);
  if (explicit !== undefined) return explicit;
  return isProductionRuntime(args.env) ? args.defaultInProduction : args.defaultInDevelopment;
}

/**
 * @description Whether export byte routes require tier entitlement.
 *   Dev default: off (Library thumbnails without OAuth). Prod default: on. Override with
 *   `RELAY_EXPORT_REQUIRE_TIER_ACCESS=0|1`.
 */
export function exportRequireTierAccessFromEnv(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return resolveEnvBoolWithProductionDefault({
    raw: env.RELAY_EXPORT_REQUIRE_TIER_ACCESS,
    env,
    defaultInProduction: true,
    defaultInDevelopment: false
  });
}

/**
 * @description Whether platform-operator metrics routes require an allowlisted session.
 *   Dev default: off. Prod default: on (fail closed until allowlist populated). Override with
 *   `RELAY_PLATFORM_OPERATOR_ACCESS_ENFORCE=0|1`.
 */
export function platformOperatorAccessEnforceFromEnv(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return resolveEnvBoolWithProductionDefault({
    raw: env.RELAY_PLATFORM_OPERATOR_ACCESS_ENFORCE,
    env,
    defaultInProduction: true,
    defaultInDevelopment: false
  });
}
