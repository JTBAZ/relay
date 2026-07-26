import { PATRON_SEARCH_MIN_QUERY_LENGTH } from "@/lib/patron-search-api";

export const PATRON_SEARCH_RECENT_STORAGE_KEY = "relay.patron_search_recent_v1";
export const PATRON_SEARCH_RECENT_ENABLED_KEY = "relay.patron_search_recent_enabled_v1";

export const PATRON_SEARCH_RECENT_MAX = 8;

export function isPatronSearchRecentEnabled(
  storage: Pick<Storage, "getItem">
): boolean {
  return storage.getItem(PATRON_SEARCH_RECENT_ENABLED_KEY) !== "0";
}

export function setPatronSearchRecentEnabled(
  storage: Pick<Storage, "setItem">,
  enabled: boolean
): void {
  storage.setItem(PATRON_SEARCH_RECENT_ENABLED_KEY, enabled ? "1" : "0");
}

export function normalizePatronSearchRecentQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

function parseRecentPayload(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: string[] = [];
    for (const item of parsed) {
      if (typeof item !== "string") continue;
      const normalized = normalizePatronSearchRecentQuery(item);
      if (normalized.length < PATRON_SEARCH_MIN_QUERY_LENGTH) continue;
      if (out.some((existing) => existing.toLowerCase() === normalized.toLowerCase())) continue;
      out.push(normalized);
      if (out.length >= PATRON_SEARCH_RECENT_MAX) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Read recent patron search queries from a Storage-like backend (testable). */
export function readPatronSearchRecent(
  storage: Pick<Storage, "getItem">
): string[] {
  return parseRecentPayload(storage.getItem(PATRON_SEARCH_RECENT_STORAGE_KEY));
}

/**
 * Promote a completed search query to the front of recents (deduped, capped).
 * Returns the updated list.
 */
export function addPatronSearchRecent(
  storage: Pick<Storage, "getItem" | "setItem">,
  query: string
): string[] {
  const normalized = normalizePatronSearchRecentQuery(query);
  if (normalized.length < PATRON_SEARCH_MIN_QUERY_LENGTH) {
    return readPatronSearchRecent(storage);
  }

  const lower = normalized.toLowerCase();
  const next = [
    normalized,
    ...readPatronSearchRecent(storage).filter((item) => item.toLowerCase() !== lower),
  ].slice(0, PATRON_SEARCH_RECENT_MAX);

  storage.setItem(PATRON_SEARCH_RECENT_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function clearPatronSearchRecent(
  storage: Pick<Storage, "removeItem">
): void {
  storage.removeItem(PATRON_SEARCH_RECENT_STORAGE_KEY);
}

export function loadPatronSearchRecentFromBrowser(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return readPatronSearchRecent(window.localStorage);
  } catch {
    return [];
  }
}

export function rememberPatronSearchInBrowser(query: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    if (!isPatronSearchRecentEnabled(window.localStorage)) {
      return readPatronSearchRecent(window.localStorage);
    }
    return addPatronSearchRecent(window.localStorage, query);
  } catch {
    return loadPatronSearchRecentFromBrowser();
  }
}

export function loadPatronSearchRecentEnabledFromBrowser(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return isPatronSearchRecentEnabled(window.localStorage);
  } catch {
    return true;
  }
}

export function setPatronSearchRecentEnabledInBrowser(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    setPatronSearchRecentEnabled(window.localStorage, enabled);
  } catch {
    // Ignore quota / privacy mode failures.
  }
}

export function clearPatronSearchRecentInBrowser(): void {
  if (typeof window === "undefined") return;
  try {
    clearPatronSearchRecent(window.localStorage);
  } catch {
    // Ignore quota / privacy mode failures.
  }
}
