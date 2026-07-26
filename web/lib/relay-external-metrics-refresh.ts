/**
 * External post metrics refresh signals from the extension.
 */
export const RELAY_EXTERNAL_METRICS_UPDATED_EVENT = "relay:external-metrics-updated";

export function subscribeRelayExternalMetricsRefresh(onRefresh: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const onExtensionSignal = () => onRefresh();
  const onFocus = () => onRefresh();
  const onVisibility = () => {
    if (document.visibilityState === "visible") onRefresh();
  };

  window.addEventListener(RELAY_EXTERNAL_METRICS_UPDATED_EVENT, onExtensionSignal);
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    window.removeEventListener(RELAY_EXTERNAL_METRICS_UPDATED_EVENT, onExtensionSignal);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
