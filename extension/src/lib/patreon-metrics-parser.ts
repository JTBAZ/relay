/**
 * Patreon published-post DOM metrics parser (Slice 2).
 * Best-effort only — missing counters are omitted, never invented.
 */

import type { ExternalMetricsScrapeMetric } from "./external-metrics-types.js";

export type PatreonMetricsParseResult = {
  metrics: ExternalMetricsScrapeMetric[];
  diagnostics: Record<string, unknown>;
};

const NUMERIC_COUNTER_TYPES = new Set([
  "likes",
  "comments",
  "impressions",
  "seen",
  "views"
]);

export function patreonMetricsHaveNumericCounters(
  metrics: ExternalMetricsScrapeMetric[]
): boolean {
  return metrics.some(
    (metric) =>
      NUMERIC_COUNTER_TYPES.has(metric.metric_type) &&
      typeof metric.value === "number" &&
      Number.isFinite(metric.value)
  );
}

export function patreonMetricsHaveReachCounters(
  metrics: ExternalMetricsScrapeMetric[]
): boolean {
  return metrics.some(
    (metric) =>
      (metric.metric_type === "impressions" || metric.metric_type === "seen") &&
      typeof metric.value === "number" &&
      Number.isFinite(metric.value)
  );
}

function textContent(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function parseInteger(raw: string): number | null {
  const normalized = raw.replace(/,/g, "").trim();
  if (!normalized) return null;
  const match = normalized.match(/\d+/);
  if (!match) return null;
  const value = Number.parseInt(match[0]!, 10);
  return Number.isFinite(value) ? value : null;
}

function firstMatch(root: ParentNode, selectors: string[]): { selector: string; el: Element } | null {
  for (const selector of selectors) {
    const el = root.querySelector(selector);
    if (el) return { selector, el };
  }
  return null;
}

function findCounterByKeyword(root: ParentNode, keyword: string): { value: number | null; raw: Record<string, unknown> } {
  const lowerKeyword = keyword.toLowerCase();
  const candidates = Array.from(root.querySelectorAll("button, a, span, div"));
  for (const el of candidates) {
    const aria = (el.getAttribute("aria-label") ?? "").toLowerCase();
    const label = textContent(el).toLowerCase();
    if (!aria.includes(lowerKeyword) && !label.includes(lowerKeyword)) continue;
    const value = parseInteger(textContent(el));
    if (value !== null) {
      return {
        value,
        raw: {
          selector: el.tagName.toLowerCase(),
          aria_label: el.getAttribute("aria-label"),
          text: textContent(el)
        }
      };
    }
  }
  return { value: null, raw: { keyword, matched: false } };
}

function findMetricValueByExactLabel(
  root: ParentNode,
  label: string
): { value: number | null; raw: Record<string, unknown> } {
  const target = label.trim().toLowerCase();
  const candidates = Array.from(root.querySelectorAll("span, div, dt, dd, p, strong, button"));
  for (const el of candidates) {
    if (textContent(el).toLowerCase() !== target) continue;

    const sibling = el.nextElementSibling;
    if (sibling) {
      const siblingValue = parseInteger(textContent(sibling));
      if (siblingValue !== null) {
        return {
          value: siblingValue,
          raw: { label, selector: el.tagName.toLowerCase(), sibling: sibling.tagName.toLowerCase() }
        };
      }
    }

    const parent = el.parentElement;
    if (parent) {
      for (const child of Array.from(parent.children)) {
        if (child === el) continue;
        const childValue = parseInteger(textContent(child));
        if (childValue !== null) {
          return {
            value: childValue,
            raw: { label, selector: el.tagName.toLowerCase(), container: parent.tagName.toLowerCase() }
          };
        }
      }
    }
  }

  return { value: null, raw: { label, matched: false } };
}

export function findPostPerformancePanelRoot(doc: Document): Element | null {
  const candidates = Array.from(doc.querySelectorAll("h1, h2, h3, h4, div, span"));
  for (const el of candidates) {
    if (textContent(el) !== "Post performance") continue;
    return (
      el.closest('[role="dialog"]') ??
      el.closest("[data-tag='post-insights-panel']") ??
      el.parentElement?.parentElement ??
      el.parentElement
    );
  }
  return null;
}

export function parsePatreonPostPerformanceMetrics(doc: Document): PatreonMetricsParseResult {
  const diagnostics: Record<string, unknown> = {
    source: "post_performance_panel",
    url: doc.location?.href ?? null
  };
  const metrics: ExternalMetricsScrapeMetric[] = [];
  const panelRoot = findPostPerformancePanelRoot(doc);
  if (!panelRoot) {
    diagnostics.panel_miss = true;
    return { metrics, diagnostics };
  }

  const labeledMetrics: Array<[string, string]> = [
    ["impressions", "Impressions"],
    ["seen", "Seen"],
    ["likes", "Likes"],
    ["comments", "Comments"]
  ];

  for (const [metricType, label] of labeledMetrics) {
    const parsed = findMetricValueByExactLabel(panelRoot, label);
    if (parsed.value !== null) {
      metrics.push({
        metric_type: metricType,
        value: parsed.value,
        raw: { label, source: "post_performance_panel", ...parsed.raw }
      });
      diagnostics[metricType] = parsed.value;
    } else {
      diagnostics[`${metricType}_miss`] = parsed.raw;
    }
  }

  return { metrics, diagnostics };
}

export function mergePatreonMetricsParseResults(
  base: PatreonMetricsParseResult,
  extra: PatreonMetricsParseResult
): PatreonMetricsParseResult {
  const preferPanel = new Set(["impressions", "seen", "likes", "comments"]);
  const byType = new Map(base.metrics.map((metric) => [metric.metric_type, metric]));

  for (const metric of extra.metrics) {
    const existing = byType.get(metric.metric_type);
    if (!existing) {
      byType.set(metric.metric_type, metric);
      continue;
    }
    if (preferPanel.has(metric.metric_type) && typeof metric.value === "number") {
      byType.set(metric.metric_type, {
        ...existing,
        ...metric,
        raw: { ...(existing.raw ?? {}), ...(metric.raw ?? {}) }
      });
    }
  }

  return {
    metrics: [...byType.values()],
    diagnostics: { ...base.diagnostics, ...extra.diagnostics }
  };
}

export function parsePatreonPostMetricsFromDocument(doc: Document): PatreonMetricsParseResult {
  const diagnostics: Record<string, unknown> = {
    url: doc.location?.href ?? null
  };
  const metrics: ExternalMetricsScrapeMetric[] = [];

  const titleMatch = firstMatch(doc, [
    "h1[data-tag='post-title']",
    "h1",
    "meta[property='og:title']"
  ]);
  const title =
    titleMatch?.el.tagName.toLowerCase() === "meta"
      ? titleMatch.el.getAttribute("content")?.trim() ?? ""
      : textContent(titleMatch?.el);
  if (title) {
    metrics.push({
      metric_type: "title",
      value: null,
      raw: {
        label: "Title",
        text: title,
        selector: titleMatch?.selector ?? null
      }
    });
    diagnostics.title = title;
  } else {
    diagnostics.title_miss = true;
  }

  const timeMatch = firstMatch(doc, ["time[datetime]", "time", "meta[property='article:published_time']"]);
  const publishedAt =
    timeMatch?.el.tagName.toLowerCase() === "meta"
      ? timeMatch.el.getAttribute("content")?.trim() ?? ""
      : timeMatch?.el.getAttribute("datetime")?.trim() || textContent(timeMatch?.el);
  if (publishedAt) {
    metrics.push({
      metric_type: "published_at_text",
      value: null,
      raw: {
        label: "Published",
        text: publishedAt,
        selector: timeMatch?.selector ?? null
      }
    });
    diagnostics.published_at_text = publishedAt;
  } else {
    diagnostics.published_at_miss = true;
  }

  const likes = findCounterByKeyword(doc, "like");
  if (likes.value !== null) {
    metrics.push({
      metric_type: "likes",
      value: likes.value,
      raw: { label: "Likes", ...likes.raw }
    });
    diagnostics.likes = likes.value;
  } else {
    diagnostics.likes_miss = likes.raw;
  }

  const comments = findCounterByKeyword(doc, "comment");
  if (comments.value !== null) {
    metrics.push({
      metric_type: "comments",
      value: comments.value,
      raw: { label: "Comments", ...comments.raw }
    });
    diagnostics.comments = comments.value;
  } else {
    diagnostics.comments_miss = comments.raw;
  }

  const impressions = findCounterByKeyword(doc, "impression");
  if (impressions.value !== null) {
    metrics.push({
      metric_type: "impressions",
      value: impressions.value,
      raw: { label: "Impressions", ...impressions.raw }
    });
    diagnostics.impressions = impressions.value;
  } else {
    diagnostics.impressions_miss = impressions.raw;
  }

  const seen = findCounterByKeyword(doc, "seen");
  if (seen.value !== null) {
    metrics.push({
      metric_type: "seen",
      value: seen.value,
      raw: { label: "Seen", ...seen.raw }
    });
    diagnostics.seen = seen.value;
  } else {
    diagnostics.seen_miss = seen.raw;
  }

  return { metrics, diagnostics };
}

export function parsePatreonPostMetricsFromHtml(html: string, url = "https://www.patreon.com/posts/test-1"): PatreonMetricsParseResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  Object.defineProperty(doc, "location", {
    value: { href: url },
    configurable: true
  });
  return parsePatreonPostMetricsFromDocument(doc);
}
