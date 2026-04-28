import { resolvePostAuthPath } from "./post-login-redirect";
import { getCreatorProfile, type CreatorWorkspaceData } from "./relay-api";

const CREATOR_STEP_PATREON = "/onboarding?path=creator&step=2";
const CREATOR_STEP_PROFILE = "/onboarding?path=creator&step=3";
const CREATOR_STEP_GALLERY = "/onboarding?path=creator&step=4";

/**
 * After studio bootstrap, route creators by setup state.
 *
 * `boot.created` only means the workspace row was newly created. A creator can return after a
 * partial setup with an existing workspace but still missing Patreon/profile/URL setup, so we also
 * inspect the creator profile.
 */
export async function resolveCreatorPostAuthDestination(
  boot: Pick<CreatorWorkspaceData, "created">,
  returnToFromQuery: string | null
): Promise<string> {
  if (boot.created) {
    return CREATOR_STEP_PATREON;
  }

  const profile = await getCreatorProfile();
  if (!profile.patreon_campaign_id) {
    return CREATOR_STEP_PATREON;
  }
  if (profile.needs_setup) {
    return CREATOR_STEP_PROFILE;
  }
  if (profile.slug_source === "allocated") {
    return CREATOR_STEP_GALLERY;
  }

  return resolvePostAuthPath(returnToFromQuery?.trim() || "/");
}
