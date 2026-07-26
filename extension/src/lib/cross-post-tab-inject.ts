import browser from "./browser";
import { DEVIANTART_SUBMIT_URL, PATREON_NEW_POST_URL, X_COMPOSE_URL } from "./constants";
import { getCrossPostPlatform } from "./cross-post-registry";
import type { CrossPostDestination } from "./cross-post-types";

export { DEVIANTART_SUBMIT_URL, PATREON_NEW_POST_URL, X_COMPOSE_URL };

const TAB_LOAD_TIMEOUT_MS = 20_000;

/** Waits until the tab finishes loading on the destination URL, or rejects on timeout / navigation away. */
export function waitForCrossPostTabReady(
  tabId: number,
  destination: CrossPostDestination
): Promise<void> {
  const { isTabUrl } = getCrossPostPlatform(destination);

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const cleanup = () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      browser.tabs.onUpdated.removeListener(onUpdated);
    };

    const onUpdated = (
      updatedTabId: number,
      changeInfo: { status?: string },
      tab: { url?: string }
    ) => {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
      if (!isTabUrl(tab.url)) {
        finish(() => reject(new Error("tab_navigated_away")));
        return;
      }
      finish(() => resolve());
    };

    browser.tabs.onUpdated.addListener(onUpdated);
    timeoutId = setTimeout(() => {
      finish(() => reject(new Error("timeout")));
    }, TAB_LOAD_TIMEOUT_MS);

    void browser.tabs
      .get(tabId)
      .then((tab) => {
        if (tab.status === "complete" && isTabUrl(tab.url)) {
          finish(() => resolve());
        }
      })
      .catch(() => {
        finish(() => reject(new Error("tab_gone")));
      });
  });
}

export async function openCrossPostTab(
  destination: CrossPostDestination
): Promise<number | undefined> {
  const { composeUrl } = getCrossPostPlatform(destination);
  const tab = await browser.tabs.create({ url: composeUrl });
  return tab.id;
}

export async function injectCrossPostFillScript(
  tabId: number,
  destination: CrossPostDestination
): Promise<boolean> {
  const { fillScript } = getCrossPostPlatform(destination);
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      files: [fillScript]
    });
    return true;
  } catch {
    return false;
  }
}

/** @deprecated Use {@link waitForCrossPostTabReady} with `"patreon"`. */
export function waitForPatreonTabReady(tabId: number): Promise<void> {
  return waitForCrossPostTabReady(tabId, "patreon");
}

/** @deprecated Use {@link openCrossPostTab} with `"patreon"`. */
export async function openPatreonEditorTab(): Promise<number | undefined> {
  return openCrossPostTab("patreon");
}

/** @deprecated Use {@link injectCrossPostFillScript} with `"patreon"`. */
export async function injectFillPatreonEditorScript(tabId: number): Promise<boolean> {
  return injectCrossPostFillScript(tabId, "patreon");
}

/** @deprecated Use {@link waitForCrossPostTabReady} with `"x"`. */
export function waitForXTabReady(tabId: number): Promise<void> {
  return waitForCrossPostTabReady(tabId, "x");
}

/** @deprecated Use {@link openCrossPostTab} with `"x"`. */
export async function openXComposeTab(): Promise<number | undefined> {
  return openCrossPostTab("x");
}

/** @deprecated Use {@link injectCrossPostFillScript} with `"x"`. */
export async function injectFillXComposeScript(tabId: number): Promise<boolean> {
  return injectCrossPostFillScript(tabId, "x");
}
