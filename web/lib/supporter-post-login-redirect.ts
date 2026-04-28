import { resolvePostAuthPath } from "./post-login-redirect";
import { fetchPatronSessionIfPresent } from "./relay-api";

const DEFAULT_SUPPORTER_CONNECT = "/patreon/patron/connect";

/**
 * After `bootstrapSupporterAfterSupabase`, choose where to send the user.
 *
 * - If Patreon is not linked yet, the connect step wins; do not let stale returnTo bypass setup.
 * - If Patreon is linked and `returnTo` is set to something other than the default connect step,
 *   that path wins (e.g. `?returnTo=/patron/settings`).
 * - Otherwise linked supporters go to `/patron/feed`.
 */
export async function resolveSupporterPostAuthDestination(
  returnToFromQuery: string | null
): Promise<string> {
  const r = returnToFromQuery?.trim() || null;
  const me = await fetchPatronSessionIfPresent();
  if (!me?.patreon_user_id) {
    return resolvePostAuthPath(DEFAULT_SUPPORTER_CONNECT);
  }
  if (r && r !== DEFAULT_SUPPORTER_CONNECT) {
    return resolvePostAuthPath(r);
  }
  return "/patron/feed";
}
