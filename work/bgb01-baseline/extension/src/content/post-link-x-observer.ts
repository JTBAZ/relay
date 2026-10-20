/**
 * X post-publish observer — watches for "View post" status links when X does not redirect.
 *
 * X's DOM gives no reliable, stable signal for "this link is the post I just made" versus
 * "this link is some other post visible on the page" (e.g. the timeline behind a closed
 * compose modal). To avoid silently mislinking a Relay post to the wrong external_id, matches
 * are confidence-gated:
 *
 *  - Tier A (high, any time): link found inside a recognized "post sent" notification
 *    container (role="alert" / toast-like testid). This is the actual confirmation UI X shows
 *    right after publishing, so it's trustworthy whenever it appears.
 *  - Tier B (medium, time-boxed): ANY `/status/` link found within a short window of the fill
 *    succeeding — before the user could plausibly have navigated to other content.
 *  - Tier C (after the window, no container): rejected. We stop guessing rather than risk
 *    attaching the wrong post; the popup paste fallback remains available.
 */
import browser from "../lib/browser";
import { MSG_POST_LINK_CANDIDATE_URL } from "../lib/messages";
import {
  detectPublishedPostMatch,
  WATCH_DURATION_MS,
  X_OBSERVER_CONFIDENT_WINDOW_MS
} from "../lib/post-link-patterns";

const STATUS_LINK_SELECTOR = 'a[href*="/status/"]';
const NOTIFICATION_CONTAINER_SELECTOR = '[role="alert"], [data-testid*="toast" i]';

function isXHost(): boolean {
  const host = window.location.hostname.toLowerCase();
  return host === "x.com" || host === "twitter.com" || host.endsWith(".x.com");
}

function isInsideNotificationContainer(el: Element): boolean {
  return el.closest(NOTIFICATION_CONTAINER_SELECTOR) !== null;
}

/** Tier A: scoped to a recognized "post sent" notification container, trustworthy any time. */
function extractHighConfidenceStatusUrl(): string | null {
  const containers = document.querySelectorAll<HTMLElement>(NOTIFICATION_CONTAINER_SELECTOR);
  for (const container of Array.from(containers)) {
    const anchors = container.querySelectorAll<HTMLAnchorElement>(STATUS_LINK_SELECTOR);
    for (const anchor of Array.from(anchors)) {
      const match = detectPublishedPostMatch(anchor.href?.trim());
      if (match?.destination === "x") return match.canonical_url;
    }
  }
  return null;
}

/** Tier B: any status link on the page — only acceptable within the confidence window. */
function extractAnyStatusUrl(): string | null {
  const anchors = document.querySelectorAll<HTMLAnchorElement>(STATUS_LINK_SELECTOR);
  for (const anchor of Array.from(anchors)) {
    if (isInsideNotificationContainer(anchor)) continue; // already covered by Tier A
    const match = detectPublishedPostMatch(anchor.href?.trim());
    if (match?.destination === "x") return match.canonical_url;
  }
  return null;
}

function main(): void {
  if (!isXHost()) return;

  const startedAt = Date.now();
  let settled = false;
  let observer: MutationObserver | null = null;

  const finish = () => {
    observer?.disconnect();
    observer = null;
  };

  const notify = (url: string) => {
    if (settled) return;
    settled = true;
    finish();
    void browser.runtime
      .sendMessage({
        type: MSG_POST_LINK_CANDIDATE_URL,
        url
      })
      .catch(() => {
        /* background may be unavailable */
      });
  };

  const check = () => {
    const highConfidence = extractHighConfidenceStatusUrl();
    if (highConfidence) {
      notify(highConfidence);
      return;
    }

    const withinConfidentWindow = Date.now() - startedAt <= X_OBSERVER_CONFIDENT_WINDOW_MS;
    if (!withinConfidentWindow) return;

    const anyMatch = extractAnyStatusUrl();
    if (anyMatch) notify(anyMatch);
  };

  check();

  observer = new MutationObserver(() => {
    check();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.setTimeout(finish, WATCH_DURATION_MS);
}

void main();
