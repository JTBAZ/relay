import type { ExternalMetricsRefreshFailure } from "./external-metrics-types.js";

export function describeExternalMetricsRefreshFailure(
  failure: ExternalMetricsRefreshFailure
): string {
  if (failure.detail?.trim()) return failure.detail.trim();

  switch (failure.reason) {
    case "not_connected":
      return "Connect the Relay extension first (popup or Settings → Connected extensions).";
    case "invalid_message":
      return "Refresh request was invalid.";
    case "unsupported_destination":
      return "External stats refresh is not supported for this platform yet.";
    case "tab_open_failed":
      return "Relay could not open the linked Patreon post tab.";
    case "tab_load_timeout":
      return "The Patreon post took too long to load. Try again when the page is reachable.";
    case "inject_failed":
      return "Relay opened Patreon but could not inject the stats scraper. Reload the extension and try again.";
    case "scrape_failed":
      return "Relay could not read stats from the Patreon page. Make sure you are logged in and the post is visible.";
    case "metrics_post_failed":
      return "Relay read stats but could not save them. Check that the Relay API is running and the extension is connected.";
    default:
      return "The Relay extension could not refresh external stats.";
  }
}
