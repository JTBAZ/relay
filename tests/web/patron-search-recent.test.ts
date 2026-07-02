import { describe, expect, it } from "vitest";
import {
  PATRON_SEARCH_RECENT_ENABLED_KEY,
  PATRON_SEARCH_RECENT_STORAGE_KEY,
  addPatronSearchRecent,
  clearPatronSearchRecent,
  isPatronSearchRecentEnabled,
  readPatronSearchRecent,
  setPatronSearchRecentEnabled,
} from "../../web/lib/patron-search-recent";

function mockStorage(initial: string | null = null, enabled: string | null = null) {
  let value = initial;
  let enabledValue = enabled;
  return {
    getItem: (key: string) => {
      if (key === PATRON_SEARCH_RECENT_STORAGE_KEY) return value;
      if (key === PATRON_SEARCH_RECENT_ENABLED_KEY) return enabledValue;
      return null;
    },
    setItem: (key: string, next: string) => {
      if (key === PATRON_SEARCH_RECENT_STORAGE_KEY) value = next;
      if (key === PATRON_SEARCH_RECENT_ENABLED_KEY) enabledValue = next;
    },
    removeItem: (key: string) => {
      if (key === PATRON_SEARCH_RECENT_STORAGE_KEY) value = null;
      if (key === PATRON_SEARCH_RECENT_ENABLED_KEY) enabledValue = null;
    },
  };
}

describe("patron-search-recent", () => {
  it("ignores queries shorter than the server minimum", () => {
    const storage = mockStorage();
    expect(addPatronSearchRecent(storage, "a")).toEqual([]);
    expect(storage.getItem(PATRON_SEARCH_RECENT_STORAGE_KEY)).toBeNull();
  });

  it("dedupes case-insensitively and promotes the latest query", () => {
    const storage = mockStorage(JSON.stringify(["alpha", "Beta"]));
    const next = addPatronSearchRecent(storage, "  beta  ");
    expect(next).toEqual(["beta", "alpha"]);
  });

  it("caps the list at eight entries", () => {
    const storage = mockStorage(
      JSON.stringify(["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"])
    );
    const next = addPatronSearchRecent(storage, "q9");
    expect(next).toHaveLength(8);
    expect(next[0]).toBe("q9");
    expect(next).not.toContain("q8");
  });

  it("clears stored recents", () => {
    const storage = mockStorage(JSON.stringify(["hello"]));
    clearPatronSearchRecent(storage);
    expect(readPatronSearchRecent(storage)).toEqual([]);
  });

  it("tolerates corrupt storage payloads", () => {
    const storage = mockStorage("not-json");
    expect(readPatronSearchRecent(storage)).toEqual([]);
  });

  it("defaults recent searches to enabled and persists the toggle", () => {
    const storage = mockStorage();
    expect(isPatronSearchRecentEnabled(storage)).toBe(true);

    setPatronSearchRecentEnabled(storage, false);
    expect(isPatronSearchRecentEnabled(storage)).toBe(false);

    setPatronSearchRecentEnabled(storage, true);
    expect(isPatronSearchRecentEnabled(storage)).toBe(true);
  });
});
