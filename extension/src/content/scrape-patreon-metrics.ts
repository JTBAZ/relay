/**
 * Injected on a saved Patreon external_url to scrape visible post metrics.
 */
import browser from "../lib/browser";
import { MSG_EXTERNAL_METRICS_RESULT } from "../lib/messages";
import { tryOpenPatreonPostPerformancePanel } from "../lib/patreon-insights-panel";
import {
  mergePatreonMetricsParseResults,
  parsePatreonPostMetricsFromDocument,
  parsePatreonPostPerformanceMetrics,
  patreonMetricsHaveNumericCounters,
  patreonMetricsHaveReachCounters,
  type PatreonMetricsParseResult
} from "../lib/patreon-metrics-parser";
import {
  clearPendingExternalMetricsScrape,
  getPendingExternalMetricsScrape,
  type PendingExternalMetricsScrape
} from "../lib/storage";

const SCRAPE_RETRY_DELAYS_MS = [900, 1400, 2000];
const PANEL_SETTLE_MS = 700;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scrapePostPerformancePanelIfNeeded(
  base: PatreonMetricsParseResult
): Promise<PatreonMetricsParseResult> {
  if (patreonMetricsHaveReachCounters(base.metrics)) return base;

  const opened = await tryOpenPatreonPostPerformancePanel();
  if (!opened) {
    return {
      ...base,
      diagnostics: {
        ...base.diagnostics,
        post_performance_panel_open_miss: true
      }
    };
  }

  await sleep(PANEL_SETTLE_MS);
  const panelResult = parsePatreonPostPerformanceMetrics(document);
  return mergePatreonMetricsParseResults(base, panelResult);
}

async function scrapeWithRetries(): Promise<PatreonMetricsParseResult> {
  let lastResult = await scrapePostPerformancePanelIfNeeded(
    parsePatreonPostMetricsFromDocument(document)
  );
  if (patreonMetricsHaveNumericCounters(lastResult.metrics)) {
    return lastResult;
  }

  for (const delayMs of SCRAPE_RETRY_DELAYS_MS) {
    await sleep(delayMs);
    lastResult = await scrapePostPerformancePanelIfNeeded(
      parsePatreonPostMetricsFromDocument(document)
    );
    if (patreonMetricsHaveNumericCounters(lastResult.metrics)) {
      return lastResult;
    }
  }

  return lastResult;
}

async function runScrape(context: PendingExternalMetricsScrape): Promise<void> {
  const parsed = await scrapeWithRetries();
  try {
    await browser.runtime.sendMessage({
      type: MSG_EXTERNAL_METRICS_RESULT,
      attempt_id: context.attempt_id,
      post_id: context.post_id,
      destination: context.destination,
      external_url: context.external_url,
      ok: parsed.metrics.length > 0,
      source: "extension_dom",
      metrics: parsed.metrics,
      diagnostics: parsed.diagnostics,
      error: null
    });
  } catch (error) {
    try {
      await browser.runtime.sendMessage({
        type: MSG_EXTERNAL_METRICS_RESULT,
        attempt_id: context.attempt_id,
        post_id: context.post_id,
        destination: context.destination,
        external_url: context.external_url,
        ok: false,
        metrics: parsed.metrics,
        diagnostics: parsed.diagnostics,
        error: error instanceof Error ? error.message : String(error)
      });
    } catch {
      /* background unavailable */
    }
  } finally {
    await clearPendingExternalMetricsScrape();
  }
}

void (async () => {
  const context = await getPendingExternalMetricsScrape();
  if (!context || context.destination !== "patreon") return;
  await runScrape(context);
})();
