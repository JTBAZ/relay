/**
 * Creator-session fetch for Patreon post metrics (Slice 2b).
 * Uses the same session_id cookie pattern as sync-now / cookie-scraper.
 */

import type { ExternalMetricsScrapeMetric } from "./external-metrics-types.js";

const SITE_URL = "https://www.patreon.com";
const POSTS_API_URL = `${SITE_URL}/api/posts`;

const POST_METRICS_INCLUDE = [
  "campaign",
  "native_video_insights",
  "post_insights",
  "post_insight"
].join(",");

const POST_METRICS_FIELDS = [
  "title",
  "published_at",
  "like_count",
  "comment_count",
  "commenter_count",
  "view_count",
  "insights_last_updated_at",
  "impressions",
  "seen",
  "post_type",
  "url"
].join(",");

const FETCH_HEADERS = {
  cookie: "",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  accept: "application/json"
};

export type PatreonPostMetricsFetchResult = {
  ok: boolean;
  metrics: ExternalMetricsScrapeMetric[];
  diagnostics: Record<string, unknown>;
  endpoint?: string;
  http_status?: number;
};

type JsonRecord = Record<string, unknown>;

function parseFiniteInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const normalized = value.replace(/,/g, "").trim();
    if (!normalized) return null;
    const parsed = Number.parseInt(normalized, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getPostResource(doc: JsonRecord): JsonRecord | null {
  const data = doc.data;
  if (Array.isArray(data)) {
    return (data.find((entry) => isRecord(entry) && entry.type === "post") as JsonRecord | undefined) ?? null;
  }
  if (isRecord(data) && data.type === "post") return data;
  return null;
}

function pushMetric(
  metrics: ExternalMetricsScrapeMetric[],
  seenTypes: Set<string>,
  metric: ExternalMetricsScrapeMetric
): void {
  if (seenTypes.has(metric.metric_type)) return;
  seenTypes.add(metric.metric_type);
  metrics.push(metric);
}

function pushNumericMetric(
  metrics: ExternalMetricsScrapeMetric[],
  seenTypes: Set<string>,
  metricType: string,
  value: unknown,
  raw: Record<string, unknown>
): void {
  const parsed = parseFiniteInt(value);
  if (parsed === null) return;
  pushMetric(metrics, seenTypes, {
    metric_type: metricType,
    value: parsed,
    raw
  });
}

export function buildPatreonPostMetricsUrl(postId: string): string {
  const url = new URL(`${POSTS_API_URL}/${encodeURIComponent(postId)}`);
  url.searchParams.set("include", POST_METRICS_INCLUDE);
  url.searchParams.set("fields[post]", POST_METRICS_FIELDS);
  url.searchParams.set("fields[native_video_insights]", "num_views,preview_views,last_updated_at");
  url.searchParams.set("fields[post_insights]", "impressions,seen,likes,comments,last_updated_at");
  url.searchParams.set("fields[post_insight]", "impressions,seen,likes,comments,last_updated_at");
  url.searchParams.set("json-api-version", "1.0");
  return url.toString();
}

export function buildPatreonPostInsightsCandidateUrls(
  postId: string,
  campaignId?: string | null
): string[] {
  const urls = [
    buildPatreonPostMetricsUrl(postId),
    `${SITE_URL}/api/post_insights/${encodeURIComponent(postId)}?json-api-version=1.0`,
    `${SITE_URL}/api/posts/${encodeURIComponent(postId)}/post_insights?json-api-version=1.0`
  ];
  if (campaignId) {
    const filtered = new URL(`${SITE_URL}/api/post_insights`);
    filtered.searchParams.set("filter[campaign_id]", campaignId);
    filtered.searchParams.set("filter[post_id]", postId);
    filtered.searchParams.set("json-api-version", "1.0");
    urls.push(filtered.toString());
  }
  return urls;
}

function campaignIdFromDocument(doc: JsonRecord): string | null {
  const post = getPostResource(doc);
  const rel = post?.relationships;
  if (!isRecord(rel)) return null;
  const campaign = rel.campaign;
  if (!isRecord(campaign)) return null;
  const data = campaign.data;
  if (Array.isArray(data)) {
    const first = data.find((entry) => isRecord(entry) && entry.type === "campaign");
    return typeof first?.id === "string" ? first.id : null;
  }
  if (isRecord(data) && data.type === "campaign" && typeof data.id === "string") {
    return data.id;
  }
  for (const included of doc.included ?? []) {
    if (isRecord(included) && included.type === "campaign" && typeof included.id === "string") {
      return included.id;
    }
  }
  return null;
}

const IMPRESSION_KEYS = new Set([
  "impressions",
  "impression_count",
  "total_impressions",
  "num_impressions"
]);

const SEEN_KEYS = new Set([
  "seen",
  "seen_count",
  "engaged_impressions",
  "num_seen",
  "total_seen"
]);

function resourceTypeLooksLikeInsights(type: unknown): boolean {
  return typeof type === "string" && /insight/i.test(type);
}

function parseMetricsFromJsonApiDocument(
  doc: JsonRecord,
  endpoint: string
): { metrics: ExternalMetricsScrapeMetric[]; diagnostics: Record<string, unknown> } {
  const metrics: ExternalMetricsScrapeMetric[] = [];
  const seenTypes = new Set<string>();
  const diagnostics: Record<string, unknown> = { endpoint };

  const post = getPostResource(doc);
  const attrs = isRecord(post?.attributes) ? post.attributes : {};

  if (typeof attrs.title === "string" && attrs.title.trim()) {
    pushMetric(metrics, seenTypes, {
      metric_type: "title",
      value: null,
      raw: { label: "Title", text: attrs.title.trim(), source: "platform_api" }
    });
  }

  if (typeof attrs.published_at === "string" && attrs.published_at.trim()) {
    pushMetric(metrics, seenTypes, {
      metric_type: "published_at_text",
      value: null,
      raw: {
        label: "Published",
        text: attrs.published_at.trim(),
        source: "platform_api"
      }
    });
  }

  pushNumericMetric(metrics, seenTypes, "likes", attrs.like_count, {
    label: "Likes",
    field: "like_count",
    source: "platform_api"
  });
  pushNumericMetric(metrics, seenTypes, "comments", attrs.comment_count, {
    label: "Comments",
    field: "comment_count",
    source: "platform_api"
  });
  pushNumericMetric(metrics, seenTypes, "impressions", attrs.impressions, {
    label: "Impressions",
    field: "impressions",
    source: "platform_api"
  });
  pushNumericMetric(metrics, seenTypes, "seen", attrs.seen, {
    label: "Seen",
    field: "seen",
    source: "platform_api"
  });
  pushNumericMetric(metrics, seenTypes, "views", attrs.view_count, {
    label: "Views",
    field: "view_count",
    source: "platform_api"
  });

  for (const included of doc.included ?? []) {
    if (!isRecord(included)) continue;
    const includedAttrs = isRecord(included.attributes) ? included.attributes : {};
    const type = included.type;
    const rawBase = {
      source: "platform_api",
      included_type: type,
      included_id: included.id
    };

    if (resourceTypeLooksLikeInsights(type)) {
      pushNumericMetric(metrics, seenTypes, "impressions", includedAttrs.impressions, {
        label: "Impressions",
        field: "impressions",
        ...rawBase
      });
      pushNumericMetric(metrics, seenTypes, "seen", includedAttrs.seen, {
        label: "Seen",
        field: "seen",
        ...rawBase
      });
      pushNumericMetric(metrics, seenTypes, "likes", includedAttrs.likes, {
        label: "Likes",
        field: "likes",
        ...rawBase
      });
      pushNumericMetric(metrics, seenTypes, "comments", includedAttrs.comments, {
        label: "Comments",
        field: "comments",
        ...rawBase
      });
    }

    if (type === "native_video_insights") {
      pushNumericMetric(metrics, seenTypes, "views", includedAttrs.num_views, {
        label: "Video plays",
        field: "num_views",
        ...rawBase
      });
    }
  }

  const loose = findLooseInsightMetrics(doc);
  if (loose.impressions !== null && !seenTypes.has("impressions")) {
    pushMetric(metrics, seenTypes, {
      metric_type: "impressions",
      value: loose.impressions,
      raw: { label: "Impressions", ...loose.impressions_raw, source: "platform_api" }
    });
  }
  if (loose.seen !== null && !seenTypes.has("seen")) {
    pushMetric(metrics, seenTypes, {
      metric_type: "seen",
      value: loose.seen,
      raw: { label: "Seen", ...loose.seen_raw, source: "platform_api" }
    });
  }

  diagnostics.attribute_keys = Object.keys(attrs).sort();
  diagnostics.metric_types = metrics.map((metric) => metric.metric_type);
  return { metrics, diagnostics };
}

function findLooseInsightMetrics(doc: JsonRecord): {
  impressions: number | null;
  seen: number | null;
  impressions_raw: Record<string, unknown>;
  seen_raw: Record<string, unknown>;
} {
  let impressions: number | null = null;
  let seen: number | null = null;
  let impressions_raw: Record<string, unknown> = {};
  let seen_raw: Record<string, unknown> = {};

  const visit = (value: unknown, path: string, typeHint?: string): void => {
    if (!isRecord(value)) return;
    const type = typeof value.type === "string" ? value.type : typeHint;
    const attrs = isRecord(value.attributes) ? value.attributes : value;
    for (const [key, rawValue] of Object.entries(attrs)) {
      const parsed = parseFiniteInt(rawValue);
      if (parsed === null) continue;
      const normalizedKey = key.toLowerCase();
      const trusted = !type || resourceTypeLooksLikeInsights(type) || path.includes("insight");
      if (IMPRESSION_KEYS.has(normalizedKey) && (trusted || impressions === null)) {
        impressions = parsed;
        impressions_raw = { field: key, path, type: type ?? null };
      }
      if (SEEN_KEYS.has(normalizedKey) && (trusted || seen === null)) {
        seen = parsed;
        seen_raw = { field: key, path, type: type ?? null };
      }
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === "attributes") continue;
      visit(child, path ? `${path}.${key}` : key, type);
    }
  };

  visit(doc, "root");
  return { impressions, seen, impressions_raw, seen_raw };
}

export function parsePatreonPostMetricsApiPayload(
  payload: unknown,
  endpoint = "fixture"
): PatreonPostMetricsFetchResult {
  if (!isRecord(payload)) {
    return {
      ok: false,
      metrics: [],
      diagnostics: { endpoint, reason: "invalid_payload" }
    };
  }
  const parsed = parseMetricsFromJsonApiDocument(payload, endpoint);
  const hasNumeric = parsed.metrics.some((metric) => typeof metric.value === "number");
  return {
    ok: parsed.metrics.length > 0 && hasNumeric,
    metrics: parsed.metrics,
    diagnostics: parsed.diagnostics,
    endpoint
  };
}

async function fetchJsonWithSession(
  url: string,
  sessionId: string,
  fetchImpl: typeof fetch
): Promise<{ ok: boolean; status: number; json: unknown | null; error?: string }> {
  try {
    const res = await fetchImpl(url, {
      headers: {
        ...FETCH_HEADERS,
        cookie: `session_id=${sessionId}`
      }
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, json: null, error: text.slice(0, 200) };
    }
    try {
      return { ok: true, status: res.status, json: JSON.parse(text) as unknown };
    } catch {
      return { ok: false, status: res.status, json: null, error: "invalid_json" };
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      json: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function fetchPatreonPostMetricsWithSession(opts: {
  sessionId: string;
  postId: string;
  fetchImpl?: typeof fetch;
}): Promise<PatreonPostMetricsFetchResult> {
  const sessionId = opts.sessionId.trim();
  const postId = opts.postId.trim();
  const fetchImpl = opts.fetchImpl ?? fetch;
  if (!sessionId || !postId) {
    return {
      ok: false,
      metrics: [],
      diagnostics: { reason: "missing_session_or_post_id" }
    };
  }

  const attempts: Array<{ endpoint: string; result: PatreonPostMetricsFetchResult }> = [];
  const primaryUrl = buildPatreonPostMetricsUrl(postId);
  const primary = await fetchJsonWithSession(primaryUrl, sessionId, fetchImpl);
  if (primary.ok && isRecord(primary.json)) {
    const parsed = parsePatreonPostMetricsApiPayload(primary.json, primaryUrl);
    parsed.http_status = primary.status;
    attempts.push({ endpoint: primaryUrl, result: parsed });
    if (
      parsed.metrics.some(
        (metric) =>
          metric.metric_type === "impressions" ||
          metric.metric_type === "seen" ||
          metric.metric_type === "likes" ||
          metric.metric_type === "comments"
      )
    ) {
      return {
        ...parsed,
        diagnostics: {
          ...parsed.diagnostics,
          attempts: attempts.map((entry) => ({
            endpoint: entry.endpoint,
            metric_types: entry.result.metrics.map((metric) => metric.metric_type)
          }))
        }
      };
    }

    const campaignId = campaignIdFromDocument(primary.json);
    for (const candidateUrl of buildPatreonPostInsightsCandidateUrls(postId, campaignId)) {
      if (candidateUrl === primaryUrl) continue;
      const candidate = await fetchJsonWithSession(candidateUrl, sessionId, fetchImpl);
      if (!candidate.ok || !isRecord(candidate.json)) continue;
      const candidateParsed = parsePatreonPostMetricsApiPayload(candidate.json, candidateUrl);
      candidateParsed.http_status = candidate.status;
      attempts.push({ endpoint: candidateUrl, result: candidateParsed });
      if (
        candidateParsed.metrics.some(
          (metric) => metric.metric_type === "impressions" || metric.metric_type === "seen"
        )
      ) {
        return {
          ...candidateParsed,
          diagnostics: {
            ...candidateParsed.diagnostics,
            attempts: attempts.map((entry) => ({
              endpoint: entry.endpoint,
              metric_types: entry.result.metrics.map((metric) => metric.metric_type)
            }))
          }
        };
      }
    }

    if (parsed.metrics.length > 0) {
      return {
        ...parsed,
        ok: parsed.metrics.some((metric) => typeof metric.value === "number"),
        diagnostics: {
          ...parsed.diagnostics,
          attempts: attempts.map((entry) => ({
            endpoint: entry.endpoint,
            metric_types: entry.result.metrics.map((metric) => metric.metric_type)
          }))
        }
      };
    }
  }

  return {
    ok: false,
    metrics: [],
    diagnostics: {
      reason: primary.error ?? "fetch_failed",
      http_status: primary.status,
      endpoint: primaryUrl,
      attempts: attempts.map((entry) => ({
        endpoint: entry.endpoint,
        metric_types: entry.result.metrics.map((metric) => metric.metric_type)
      }))
    },
    endpoint: primaryUrl,
    http_status: primary.status
  };
}
