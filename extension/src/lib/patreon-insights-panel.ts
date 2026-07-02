/**
 * Creator-only Patreon "Post performance" panel helpers.
 * Reach metrics (Impressions / Seen) are not on the public post body — they live behind the bar-chart icon.
 */

import { findPostPerformancePanelRoot } from "./patreon-metrics-parser.js";

const PANEL_WAIT_MS = 4_000;
const PANEL_POLL_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buttonLabel(el: Element): string {
  return [
    el.getAttribute("aria-label"),
    el.getAttribute("title"),
    el.textContent?.replace(/\s+/g, " ").trim()
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function looksLikeInsightsButton(el: Element): boolean {
  const label = buttonLabel(el);
  return (
    label.includes("insight") ||
    label.includes("performance") ||
    label.includes("analytics") ||
    label.includes("view stats") ||
    label.includes("post stats")
  );
}

export async function waitForPostPerformancePanel(timeoutMs = PANEL_WAIT_MS): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (findPostPerformancePanelRoot(document)) return true;
    await sleep(PANEL_POLL_MS);
  }
  return Boolean(findPostPerformancePanelRoot(document));
}

export async function tryOpenPatreonPostPerformancePanel(): Promise<boolean> {
  if (findPostPerformancePanelRoot(document)) return true;

  const buttons = Array.from(document.querySelectorAll("button"));
  for (const button of buttons) {
    if (!looksLikeInsightsButton(button)) continue;
    button.click();
    return waitForPostPerformancePanel();
  }

  return false;
}
