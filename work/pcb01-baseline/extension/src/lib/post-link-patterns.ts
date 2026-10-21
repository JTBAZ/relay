/**
 * Published-post URL detection for post-link confirmation watches.
 * Used after cross-post form fill to capture canonical external URLs + IDs.
 */

import type { CrossPostDestination } from "./cross-post-types.js";

/** Active watch window after a successful form fill. */
export const WATCH_DURATION_MS = 10 * 60 * 1000;

/** After dismiss, suppress re-toast on the same tab for this long. */
export const DISMISS_COOLDOWN_MS = 60 * 1000;

/** Wait for navigation redirects to settle before evaluating URL. */
export const DEBOUNCE_MS = 2500;

/** Stale watches older than this (since creation) are purged on next read, even if unconfirmed. */
export const STALE_PURGE_MS = 24 * 60 * 60 * 1000;

/**
 * X DOM-fallback confidence window — any `/status/` link found this soon after the fill is
 * treated as high-confidence (user hasn't had time to navigate away). After this window,
 * only links found inside a recognized "post sent" notification container are trusted.
 */
export const X_OBSERVER_CONFIDENT_WINDOW_MS = 15_000;

export type PostLinkWatch = {
  attempt_id: string;
  destination: CrossPostDestination;
  relay_post_title: string;
  tab_id: number;
  candidate_url: string | null;
  canonical_url: string | null;
  external_id: string | null;
  created_at: number;
  expires_at: number;
  dismiss_cooldown_until: number | null;
};

export type PublishedPostMatch = {
  destination: CrossPostDestination;
  canonical_url: string;
  external_id: string | null;
};

// Patreon serves published posts at both `/posts/<slug>-<id>` and, when viewed from a
// creator's page, `/<creator-vanity>/posts/<slug>-<id>`. Allow an optional leading segment.
const PATREON_POST_PATH =
  /^\/(?:[^/]+\/)?posts\/(?:[a-z0-9-]+-(\d+)|(\d+))\/?$/i;

const X_STATUS_PATH = /^\/([^/]+)\/status\/(\d+)\/?$/i;

const DEVIANTART_ART_PATH = /^\/([^/]+)\/art\/([^/?#]+)\/?$/i;

const COMPOSE_OR_DRAFT_PATH =
  /\/(?:posts\/new|posts\/draft|compose\/post|submit)(?:\/|$|\?)/i;

/** Storage keys are per-attempt (not per-destination) so concurrent cross-posts to the
 * same platform in different tabs don't clobber each other's watch. */
const POST_LINK_WATCH_KEY_PREFIX = "post_link_watch:";

export function postLinkWatchStorageKey(attemptId: string): string {
  return `${POST_LINK_WATCH_KEY_PREFIX}${attemptId}`;
}

export function isPostLinkWatchStorageKey(key: string): boolean {
  return key.startsWith(POST_LINK_WATCH_KEY_PREFIX);
}

/** Pre-refactor storage keys (destination-keyed, single watch per platform). Purged on startup. */
export function legacyPostLinkWatchStorageKeys(): string[] {
  return (["patreon", "x", "deviantart"] as const).map(
    (destination) => `post_link_watch_${destination}`
  );
}

function parseHttpUrl(raw: string | undefined | null): URL | null {
  if (!raw?.trim()) return null;
  try {
    return new URL(raw.trim());
  } catch {
    return null;
  }
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

function stripTrackingParams(url: URL): URL {
  const next = new URL(url.href);
  next.hash = "";
  next.search = "";
  return next;
}

function matchPatreonPublishedUrl(url: URL): PublishedPostMatch | null {
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
    external_id: externalId
  };
}

function matchXPublishedUrl(url: URL): PublishedPostMatch | null {
  if (!isXHost(url.hostname)) return null;

  const m = url.pathname.match(X_STATUS_PATH);
  if (!m) return null;

  const handle = m[1]?.trim();
  const statusId = m[2]?.trim();
  if (!handle || !statusId) return null;

  const canonical = new URL(`https://x.com/${handle}/status/${statusId}`);

  return {
    destination: "x",
    canonical_url: canonical.href,
    external_id: statusId
  };
}

function matchDeviantArtPublishedUrl(url: URL): PublishedPostMatch | null {
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
    external_id: externalId
  };
}

const MATCHERS: Record<
  CrossPostDestination,
  (url: URL) => PublishedPostMatch | null
> = {
  patreon: matchPatreonPublishedUrl,
  x: matchXPublishedUrl,
  deviantart: matchDeviantArtPublishedUrl
};

/** Match a URL against a specific destination's published-post pattern. */
export function matchPublishedPostUrl(
  destination: CrossPostDestination,
  rawUrl: string | undefined | null
): PublishedPostMatch | null {
  const url = parseHttpUrl(rawUrl);
  if (!url) return null;
  return MATCHERS[destination](url);
}

/** Return canonical published-post URL for a destination, or null if not a match. */
export function normalizePublishedPostUrl(
  destination: CrossPostDestination,
  rawUrl: string | undefined | null
): string | null {
  return matchPublishedPostUrl(destination, rawUrl)?.canonical_url ?? null;
}

/** Detect destination from URL alone (useful for pasted popup fallback URLs). */
export function detectPublishedPostMatch(
  rawUrl: string | undefined | null
): PublishedPostMatch | null {
  const url = parseHttpUrl(rawUrl);
  if (!url) return null;

  for (const destination of ["patreon", "x", "deviantart"] as const) {
    const match = MATCHERS[destination](url);
    if (match) return match;
  }
  return null;
}
