/** Cross-surface signal: Import Bay / staging lists should reload. */

export const RELAY_LIBRARY_STAGING_REFRESH = "relay:library-staging-refresh";

/** Ask Library Import Bay / Lab staging docks to refetch unattached media. */
export function requestLibraryStagingRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(RELAY_LIBRARY_STAGING_REFRESH));
}
