/**
 * Watches cross-post tabs for published-post URLs and injects the confirmation toast.
 */

import browser from "./browser";
import { POST_LINK_TOAST_SCRIPT, POST_LINK_X_OBSERVER_SCRIPT } from "./post-link-inject";
import {
  DEBOUNCE_MS,
  matchPublishedPostUrl,
  type PostLinkWatch
} from "./post-link-patterns";
import {
  getPostLinkWatchesForTab,
  isPostLinkWatchInCooldown,
  setPostLinkWatch
} from "./post-link-watch";

const debounceTimers = new Map<number, ReturnType<typeof setTimeout>>();
const pendingOverrideUrls = new Map<number, string>();
const shownToastAttemptIds = new Set<string>();

let watcherStarted = false;

async function injectPostLinkToast(tabId: number): Promise<boolean> {
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      files: [POST_LINK_TOAST_SCRIPT]
    });
    console.log("[relay:post-link] toast injected", { tabId });
    return true;
  } catch (e) {
    console.log("[relay:post-link] toast injection failed", { tabId, error: String(e) });
    return false;
  }
}

export async function injectPostLinkXObserver(tabId: number): Promise<boolean> {
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      files: [POST_LINK_X_OBSERVER_SCRIPT]
    });
    return true;
  } catch {
    return false;
  }
}

async function processWatchUrlMatch(
  tabId: number,
  watch: PostLinkWatch,
  rawUrl: string
): Promise<void> {
  const match = matchPublishedPostUrl(watch.destination, rawUrl);
  if (!match) {
    console.log("[relay:post-link] url did not match pattern", {
      tabId,
      attemptId: watch.attempt_id,
      destination: watch.destination,
      url: rawUrl
    });
    return;
  }

  console.log("[relay:post-link] url matched published-post pattern", {
    tabId,
    attemptId: watch.attempt_id,
    destination: watch.destination,
    url: rawUrl,
    match
  });

  const updated: PostLinkWatch = {
    ...watch,
    candidate_url: rawUrl,
    canonical_url: match.canonical_url,
    external_id: match.external_id
  };
  await setPostLinkWatch(updated);

  if (isPostLinkWatchInCooldown(updated)) {
    console.log("[relay:post-link] skip toast — watch in dismiss cooldown", {
      attemptId: updated.attempt_id
    });
    return;
  }
  if (shownToastAttemptIds.has(updated.attempt_id)) {
    console.log("[relay:post-link] skip toast — already shown for this attempt", {
      attemptId: updated.attempt_id
    });
    return;
  }

  const injected = await injectPostLinkToast(tabId);
  if (injected) {
    shownToastAttemptIds.add(updated.attempt_id);
  }
}

async function evaluatePostLinkWatchForTab(
  tabId: number,
  overrideUrl?: string
): Promise<void> {
  let url = overrideUrl?.trim();
  if (!url) {
    let tab: browser.Tabs.Tab;
    try {
      tab = await browser.tabs.get(tabId);
    } catch {
      return;
    }
    url = tab.url?.trim();
  }
  if (!url) return;

  const watches = await getPostLinkWatchesForTab(tabId);
  console.log("[relay:post-link] evaluating tab", {
    tabId,
    url,
    activeWatchCount: watches.length,
    watchAttemptIds: watches.map((w) => w.attempt_id)
  });
  if (watches.length === 0) return;

  for (const watch of watches) {
    await processWatchUrlMatch(tabId, watch, url);
  }
}

function schedulePostLinkEvaluation(tabId: number, overrideUrl?: string): void {
  if (overrideUrl?.trim()) {
    pendingOverrideUrls.set(tabId, overrideUrl.trim());
  }

  const existing = debounceTimers.get(tabId);
  if (existing !== undefined) {
    clearTimeout(existing);
  }

  debounceTimers.set(
    tabId,
    setTimeout(() => {
      debounceTimers.delete(tabId);
      const urlOverride = pendingOverrideUrls.get(tabId);
      pendingOverrideUrls.delete(tabId);
      void evaluatePostLinkWatchForTab(tabId, urlOverride);
    }, DEBOUNCE_MS)
  );
}

function onTabUpdated(
  tabId: number,
  changeInfo: { url?: string; status?: string }
): void {
  if (!changeInfo.url && changeInfo.status !== "complete") return;
  console.log("[relay:post-link] tabs.onUpdated fired", { tabId, changeInfo });
  schedulePostLinkEvaluation(tabId);
}

/** Idempotent — registers a single global tabs.onUpdated listener. */
export function startPostLinkWatcher(): void {
  if (watcherStarted) return;
  watcherStarted = true;
  browser.tabs.onUpdated.addListener(onTabUpdated);
}

/**
 * Report a candidate published URL for a tab (used by URL navigation and X DOM fallback).
 * Debounced before evaluating and injecting the toast.
 */
export function reportPostLinkCandidateUrl(tabId: number, candidateUrl?: string | null): void {
  schedulePostLinkEvaluation(tabId, candidateUrl ?? undefined);
}

/** Allow a future toast for the same attempt after dismiss cooldown expires. */
export function forgetPostLinkToastShown(attemptId: string): void {
  shownToastAttemptIds.delete(attemptId);
}

/** Clear debounce state when a watch is removed or confirmed. */
export function cancelPostLinkEvaluation(tabId: number): void {
  const existing = debounceTimers.get(tabId);
  if (existing !== undefined) {
    clearTimeout(existing);
    debounceTimers.delete(tabId);
  }
  pendingOverrideUrls.delete(tabId);
}
