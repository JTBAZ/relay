/**
 * Notify open Relay web tabs that distribution data changed (e.g. post link confirmed).
 */
import browser from "./browser";

export const RELAY_DISTRIBUTION_UPDATED_EVENT = "relay:distribution-updated" as const;
export const RELAY_EXTERNAL_METRICS_UPDATED_EVENT = "relay:external-metrics-updated" as const;

function relayTabUrlPatterns(): string[] {
  if (__EXT_ENV__ === "dev") {
    return ["http://localhost/*", "http://127.0.0.1/*", "https://relayapp.me/*"];
  }
  return ["https://relayapp.me/*"];
}

export async function notifyRelayWebDistributionUpdated(): Promise<void> {
  await notifyRelayWebCustomEvent(RELAY_DISTRIBUTION_UPDATED_EVENT);
}

export async function notifyRelayWebExternalMetricsUpdated(): Promise<void> {
  await notifyRelayWebCustomEvent(RELAY_EXTERNAL_METRICS_UPDATED_EVENT);
}

async function notifyRelayWebCustomEvent(eventName: string): Promise<void> {
  let tabs: browser.Tabs.Tab[];
  try {
    tabs = await browser.tabs.query({ url: relayTabUrlPatterns() });
  } catch {
    return;
  }

  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    try {
      await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: (eventName: string) => {
          window.dispatchEvent(new CustomEvent(eventName));
        },
        args: [eventName]
      });
    } catch {
      /* tab may not allow scripting */
    }
  }
}
