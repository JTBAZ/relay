/**
 * Local storage helpers for post-link confirmation watches.
 *
 * Watches are keyed by `attempt_id` (not destination) so concurrent cross-posts to the same
 * platform in different tabs each get their own watch instead of clobbering one another.
 * `tab_id` remains a queryable field on each record for tab-scoped lookups.
 */

import browser from "./browser";
import type { CrossPostDestination } from "./cross-post-types";
import { PENDING_CROSS_POST_STORAGE_KEY } from "./cross-post-types";
import {
  DISMISS_COOLDOWN_MS,
  isPostLinkWatchStorageKey,
  legacyPostLinkWatchStorageKeys,
  STALE_PURGE_MS,
  WATCH_DURATION_MS,
  type PostLinkWatch,
  postLinkWatchStorageKey
} from "./post-link-patterns";

export class PostLinkWatchStorageError extends Error {
  public override readonly name = "PostLinkWatchStorageError";

  public constructor(message: string) {
    super(message);
  }
}

const DESTINATIONS = new Set<CrossPostDestination>(["patreon", "x", "deviantart"]);

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isDestination(v: unknown): v is CrossPostDestination {
  return typeof v === "string" && DESTINATIONS.has(v as CrossPostDestination);
}

function parseNullableString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") throw new PostLinkWatchStorageError("invalid string field");
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function parseTimestamp(v: unknown, field: string): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
    throw new PostLinkWatchStorageError(`${field}: invalid timestamp`);
  }
  return v;
}

function parsePostLinkWatch(raw: unknown): PostLinkWatch {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new PostLinkWatchStorageError("watch: not an object");
  }
  const o = raw as Record<string, unknown>;
  if (!isNonEmptyString(o.attempt_id)) {
    throw new PostLinkWatchStorageError("watch: missing attempt_id");
  }
  if (!isDestination(o.destination)) {
    throw new PostLinkWatchStorageError("watch: invalid destination");
  }
  if (!isNonEmptyString(o.relay_post_title)) {
    throw new PostLinkWatchStorageError("watch: missing relay_post_title");
  }
  if (typeof o.tab_id !== "number" || !Number.isInteger(o.tab_id) || o.tab_id < 0) {
    throw new PostLinkWatchStorageError("watch: invalid tab_id");
  }

  return {
    attempt_id: o.attempt_id.trim(),
    destination: o.destination,
    relay_post_title: o.relay_post_title.trim(),
    tab_id: o.tab_id,
    candidate_url: parseNullableString(o.candidate_url),
    canonical_url: parseNullableString(o.canonical_url),
    external_id: parseNullableString(o.external_id),
    created_at: parseTimestamp(o.created_at, "created_at"),
    expires_at: parseTimestamp(o.expires_at, "expires_at"),
    dismiss_cooldown_until:
      o.dismiss_cooldown_until === null || o.dismiss_cooldown_until === undefined
        ? null
        : parseTimestamp(o.dismiss_cooldown_until, "dismiss_cooldown_until")
  };
}

function isStale(watch: PostLinkWatch, now: number): boolean {
  return now - watch.created_at > STALE_PURGE_MS;
}

async function removeWatchKey(attemptId: string): Promise<void> {
  await browser.storage.local.remove(postLinkWatchStorageKey(attemptId));
}

export async function setPostLinkWatch(watch: PostLinkWatch): Promise<void> {
  const parsed = parsePostLinkWatch(watch);
  await browser.storage.local.set({
    [postLinkWatchStorageKey(parsed.attempt_id)]: parsed
  });
}

export async function getPostLinkWatch(
  attemptId: string,
  now = Date.now()
): Promise<PostLinkWatch | null> {
  const key = postLinkWatchStorageKey(attemptId);
  const raw = await browser.storage.local.get(key);
  const value = raw[key];
  if (value === undefined || value === null) return null;
  try {
    const watch = parsePostLinkWatch(value);
    if (isStale(watch, now)) {
      await removeWatchKey(attemptId);
      return null;
    }
    return watch;
  } catch {
    await removeWatchKey(attemptId);
    return null;
  }
}

export async function clearPostLinkWatch(attemptId: string): Promise<void> {
  await removeWatchKey(attemptId);
}

export async function setDismissCooldown(
  attemptId: string,
  now = Date.now()
): Promise<void> {
  const watch = await getPostLinkWatch(attemptId, now);
  if (!watch) return;
  await setPostLinkWatch({
    ...watch,
    dismiss_cooldown_until: now + DISMISS_COOLDOWN_MS
  });
}

export function isPostLinkWatchActive(watch: PostLinkWatch, now = Date.now()): boolean {
  return now < watch.expires_at;
}

export function isPostLinkWatchExpired(watch: PostLinkWatch, now = Date.now()): boolean {
  return now >= watch.expires_at;
}

export function isPostLinkWatchInCooldown(watch: PostLinkWatch, now = Date.now()): boolean {
  return watch.dismiss_cooldown_until !== null && now < watch.dismiss_cooldown_until;
}

/** Lists all non-stale watches across every destination/tab, purging stale ones as it goes. */
export async function listPostLinkWatches(now = Date.now()): Promise<PostLinkWatch[]> {
  const all = await browser.storage.local.get();
  const watches: PostLinkWatch[] = [];
  const staleKeys: string[] = [];

  for (const [key, value] of Object.entries(all)) {
    if (!isPostLinkWatchStorageKey(key)) continue;
    try {
      const watch = parsePostLinkWatch(value);
      if (isStale(watch, now)) {
        staleKeys.push(key);
        continue;
      }
      watches.push(watch);
    } catch {
      staleKeys.push(key);
    }
  }

  if (staleKeys.length > 0) {
    await browser.storage.local.remove(staleKeys);
  }

  return watches;
}

/** Active (non-expired) watches whose `tab_id` matches the given tab. */
export async function getPostLinkWatchesForTab(
  tabId: number,
  now = Date.now()
): Promise<PostLinkWatch[]> {
  const watches = await listPostLinkWatches(now);
  return watches.filter((w) => w.tab_id === tabId && isPostLinkWatchActive(w, now));
}

/** Most recently created active watch for a tab — used to resolve "which watch is this toast for". */
export async function getMostRecentActiveWatchForTab(
  tabId: number,
  now = Date.now()
): Promise<PostLinkWatch | null> {
  const watches = await getPostLinkWatchesForTab(tabId, now);
  if (watches.length === 0) return null;
  return watches.reduce((latest, w) => (w.created_at > latest.created_at ? w : latest));
}

/** One-time cleanup of the pre-refactor destination-keyed storage shape. Safe to call repeatedly. */
export async function purgeLegacyPostLinkWatchKeys(): Promise<void> {
  await browser.storage.local.remove(legacyPostLinkWatchStorageKeys());
}

export function buildPostLinkWatch(
  input: {
    attempt_id: string;
    destination: CrossPostDestination;
    relay_post_title: string;
    tab_id: number;
  },
  now = Date.now()
): PostLinkWatch {
  return {
    attempt_id: input.attempt_id.trim(),
    destination: input.destination,
    relay_post_title: input.relay_post_title.trim() || "this post",
    tab_id: input.tab_id,
    candidate_url: null,
    canonical_url: null,
    external_id: null,
    created_at: now,
    expires_at: now + WATCH_DURATION_MS,
    dismiss_cooldown_until: null
  };
}

export async function resolvePendingCrossPostWatchContext(): Promise<{
  destination: CrossPostDestination;
  relay_post_title: string;
} | null> {
  const raw = await browser.storage.local.get(PENDING_CROSS_POST_STORAGE_KEY);
  const pkg = raw[PENDING_CROSS_POST_STORAGE_KEY];
  if (pkg === null || typeof pkg !== "object" || Array.isArray(pkg)) return null;

  const o = pkg as Record<string, unknown>;
  const title =
    typeof o.title === "string" && o.title.trim() ? o.title.trim() : "this post";

  if ("post_text" in o && typeof o.post_text === "string") {
    return { destination: "x", relay_post_title: title };
  }
  if ("tags" in o && Array.isArray(o.tags)) {
    return { destination: "deviantart", relay_post_title: title };
  }
  return { destination: "patreon", relay_post_title: title };
}
