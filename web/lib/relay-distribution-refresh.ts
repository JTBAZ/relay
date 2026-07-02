/** Custom event dispatched on Relay web tabs when extension confirms an external post link. */
export const RELAY_DISTRIBUTION_UPDATED_EVENT = "relay:distribution-updated";

/**
 * Subscribe to distribution refresh signals from the extension (injected event)
 * and from tab focus / visibility (fallback when Relay was open during confirm).
 */
export function subscribeRelayDistributionRefresh(onRefresh: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const onExtensionSignal = () => onRefresh();
  const onFocus = () => onRefresh();
  const onVisibility = () => {
    if (document.visibilityState === "visible") onRefresh();
  };

  window.addEventListener(RELAY_DISTRIBUTION_UPDATED_EVENT, onExtensionSignal);
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    window.removeEventListener(RELAY_DISTRIBUTION_UPDATED_EVENT, onExtensionSignal);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
