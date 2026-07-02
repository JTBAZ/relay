/**
 * Performance intelligence Phase 9 — platform identity parsing and adapter capability matrix.
 * Identity/linking precedes aggressive metric scraping.
 * @see docs/analytics/PLATFORM_ADAPTERS.md
 */

export type PlatformIdentityDestination = "patreon" | "x" | "deviantart" | "instagram";

export type PlatformIdentityMatch = {
  destination: PlatformIdentityDestination;
  canonical_url: string;
  external_id: string | null;
  confidence: "high" | "medium";
};

export type PlatformMetricsRefreshMethod =
  | "extension_dom"
  | "platform_api"
  | "csv_rollup_overlay"
  | "relay_rollup"
  | "none";

export type PlatformLinkingStatus = "available" | "research_only" | "unsupported";

export type PlatformAdapterCapabilityWire = {
  destination: PlatformIdentityDestination;
  label: string;
  linking: PlatformLinkingStatus;
  metrics_refresh: PlatformMetricsRefreshMethod;
  identity_from_url: boolean;
  notes: string;
};

const PATREON_POST_PATH =
  /^\/(?:[^/]+\/)?posts\/(?:[a-z0-9-]+-(\d+)|(\d+))\/?$/i;
const X_STATUS_PATH = /^\/([^/]+)\/status\/(\d+)\/?$/i;
const DEVIANTART_ART_PATH = /^\/([^/]+)\/art\/([^/?#]+)\/?$/i;
const COMPOSE_OR_DRAFT_PATH =
  /\/(?:posts\/new|posts\/draft|compose\/post|submit)(?:\/|$|\?)/i;

const LINKING_DESTINATIONS = new Set<PlatformIdentityDestination>([
  "patreon",
  "x",
  "deviantart"
]);

function parseHttpUrl(raw: string | undefined | null): URL | null {
  if (!raw?.trim()) return null;
  try {
    return new URL(raw.trim());
  } catch {
    return null;
  }
}

function stripTrackingParams(url: URL): URL {
  const next = new URL(url.href);
  next.hash = "";
  next.search = "";
  return next;
}

function isPatreonHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "www.patreon.com" || host === "patreon.com" || host.endsWith(".patreon.com");
}

function isXHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "x.com" || host === "twitter.com" || host.endsWith(".x.com");
}

function isDeviantArtHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "www.deviantart.com" || host.endsWith(".deviantart.com");
}

function matchPatreonPublishedUrl(url: URL): PlatformIdentityMatch | null {
  if (!isPatreonHost(url.hostname)) return null;
  if (COMPOSE_OR_DRAFT_PATH.test(url.pathname)) return null;

  const m = url.pathname.match(PATREON_POST_PATH);
  if (!m) return null;

  const externalId = (m[1] ?? m[2] ?? "").trim() || null;
  const canonical = stripTrackingParams(url);
  canonical.hostname = "www.patreon.com";
  canonical.protocol = "https:";

  return {
    destination: "patreon",
    canonical_url: canonical.href.replace(/\/$/, ""),
    external_id: externalId,
    confidence: "high"
  };
}

function matchXPublishedUrl(url: URL): PlatformIdentityMatch | null {
  if (!isXHost(url.hostname)) return null;

  const m = url.pathname.match(X_STATUS_PATH);
  if (!m) return null;

  const handle = m[1]?.trim();
  const statusId = m[2]?.trim();
  if (!handle || !statusId) return null;

  return {
    destination: "x",
    canonical_url: `https://x.com/${handle}/status/${statusId}`,
    external_id: statusId,
    confidence: "high"
  };
}

function matchDeviantArtPublishedUrl(url: URL): PlatformIdentityMatch | null {
  if (!isDeviantArtHost(url.hostname)) return null;
  if (url.pathname.toLowerCase().includes("/submit")) return null;

  const m = url.pathname.match(DEVIANTART_ART_PATH);
  if (!m) return null;

  const username = m[1]?.trim();
  const artSlug = m[2]?.trim();
  if (!username || !artSlug) return null;

  const trailingId = artSlug.match(/-(\d{5,})$/);
  const externalId = trailingId?.[1] ?? artSlug;

  const canonical = stripTrackingParams(url);
  canonical.hostname = "www.deviantart.com";
  canonical.protocol = "https:";

  return {
    destination: "deviantart",
    canonical_url: canonical.href.replace(/\/$/, ""),
    external_id: externalId,
    confidence: "high"
  };
}

const MATCHERS: Record<
  Exclude<PlatformIdentityDestination, "instagram">,
  (url: URL) => PlatformIdentityMatch | null
> = {
  patreon: matchPatreonPublishedUrl,
  x: matchXPublishedUrl,
  deviantart: matchDeviantArtPublishedUrl
};

export function isPlatformIdentityDestination(value: string): value is PlatformIdentityDestination {
  return (
    value === "patreon" ||
    value === "x" ||
    value === "deviantart" ||
    value === "instagram"
  );
}

export function parsePlatformPublishedUrl(
  destination: PlatformIdentityDestination,
  rawUrl: string | undefined | null
): PlatformIdentityMatch | null {
  if (destination === "instagram") return null;
  const url = parseHttpUrl(rawUrl);
  if (!url) return null;
  const match = MATCHERS[destination](url);
  if (!match) return null;
  return match;
}

export function detectPlatformPublishedUrl(
  rawUrl: string | undefined | null
): PlatformIdentityMatch | null {
  const url = parseHttpUrl(rawUrl);
  if (!url) return null;

  for (const destination of ["patreon", "x", "deviantart"] as const) {
    const match = MATCHERS[destination](url);
    if (match) return match;
  }
  return null;
}

export function normalizeDistributionDestination(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (v === "twitter") return "x";
  return v;
}

export function platformAdapterCatalog(): PlatformAdapterCapabilityWire[] {
  return [
    {
      destination: "patreon",
      label: "Patreon",
      linking: "available",
      metrics_refresh: "extension_dom",
      identity_from_url: true,
      notes: "Official API metrics attempted in extension when session allows; CSV rollup overlay available."
    },
    {
      destination: "x",
      label: "X / Twitter",
      linking: "available",
      metrics_refresh: "extension_dom",
      identity_from_url: true,
      notes: "Published URL identity from /status/ links; extension DOM refresh after manual handoff."
    },
    {
      destination: "deviantart",
      label: "DeviantArt",
      linking: "available",
      metrics_refresh: "extension_dom",
      identity_from_url: true,
      notes: "Published art URL identity; extension DOM refresh after manual handoff."
    },
    {
      destination: "instagram",
      label: "Instagram",
      linking: "research_only",
      metrics_refresh: "none",
      identity_from_url: false,
      notes: "Graph API / Business login research only — no linking or refresh in v1."
    }
  ];
}

export function adapterCapabilityForDestination(
  destination: string
): PlatformAdapterCapabilityWire | null {
  const normalized = normalizeDistributionDestination(destination);
  if (normalized === "instagram") {
    return platformAdapterCatalog().find((row) => row.destination === "instagram") ?? null;
  }
  if (!isPlatformIdentityDestination(normalized)) return null;
  return platformAdapterCatalog().find((row) => row.destination === normalized) ?? null;
}

export function supportsPlatformIdentityLinking(destination: string): boolean {
  const capability = adapterCapabilityForDestination(destination);
  return capability?.linking === "available" && LINKING_DESTINATIONS.has(capability.destination);
}
