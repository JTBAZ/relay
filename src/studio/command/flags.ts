/**
 * Relay Command Layer feature flags (P1 freeze).
 * All side effects default off. Apply is independently gated from preview.
 *
 * @see docs/studio/relay-command-mcp-build-plans/PRODUCT-CONTRACT.md
 */

export type RelayCommandFeatureFlags = {
  layer_enabled: boolean;
  apply_enabled: boolean;
  mcp_enabled: boolean;
  studio_ux_enabled: boolean;
  /** Lab 3 selection review overlay (P6). Committed default off. */
  selection_ux_enabled: boolean;
  /** Lab 3 plan shaping + calendar squash (P9). Committed default off. */
  schedule_plan_enabled: boolean;
  /** Lab 3 hosted semantic planner on interpret (P7). Committed default off. */
  planner_enabled: boolean;
  /** Live-model eval runner only (P7 T04). Committed default off. Not a product flag. */
  eval_model_enabled: boolean;
  /** Lab 2 corpus seed (P2). Reader lives here; seed apply is not implemented in P1. */
  lab2_seed_allowed: boolean;
};

function envFlagOn(env: NodeJS.ProcessEnv, key: string): boolean {
  const raw = env[key];
  if (raw === undefined) return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** Defaults are all off — production side effects require explicit enablement. */
export function getRelayCommandFeatureFlags(
  env: NodeJS.ProcessEnv = process.env
): RelayCommandFeatureFlags {
  return {
    layer_enabled: envFlagOn(env, "RELAY_COMMAND_LAYER_ENABLED"),
    apply_enabled: envFlagOn(env, "RELAY_COMMAND_APPLY_ENABLED"),
    mcp_enabled: envFlagOn(env, "RELAY_COMMAND_MCP_ENABLED"),
    studio_ux_enabled: envFlagOn(env, "RELAY_COMMAND_STUDIO_UX_ENABLED"),
    selection_ux_enabled: envFlagOn(env, "RELAY_COMMAND_SELECTION_UX_ENABLED"),
    schedule_plan_enabled: envFlagOn(env, "RELAY_COMMAND_SCHEDULE_PLAN_ENABLED"),
    planner_enabled: envFlagOn(env, "RELAY_COMMAND_PLANNER_ENABLED"),
    eval_model_enabled: envFlagOn(env, "RELAY_COMMAND_EVAL_MODEL"),
    lab2_seed_allowed: envFlagOn(env, "RELAY_ALLOW_STUDIO_LAB2_SEED")
  };
}

/** Public flag payload for Studio (omit seed allow — that is server-only). */
export function publicCommandFlags(
  env: NodeJS.ProcessEnv = process.env
): Pick<
  RelayCommandFeatureFlags,
  "layer_enabled" | "apply_enabled" | "mcp_enabled" | "studio_ux_enabled" | "selection_ux_enabled" | "schedule_plan_enabled"
> {
  const flags = getRelayCommandFeatureFlags(env);
  return {
    layer_enabled: flags.layer_enabled,
    apply_enabled: flags.apply_enabled,
    mcp_enabled: flags.mcp_enabled,
    studio_ux_enabled: flags.studio_ux_enabled,
    selection_ux_enabled: flags.selection_ux_enabled,
    schedule_plan_enabled: flags.schedule_plan_enabled
  };
}
