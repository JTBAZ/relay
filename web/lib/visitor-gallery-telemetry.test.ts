import { describe, expect, it } from "vitest";
import {
  VISITOR_SESSION_STORAGE_KEY,
  createVisitorSessionKey,
  readVisitorSessionKey
} from "./visitor-gallery-telemetry";

describe("visitor gallery telemetry (PMD-042)", () => {
  it("creates and persists an opaque visitor session key", () => {
    const storage = new Map<string, string>();
    const mock = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      }
    };

    const first = readVisitorSessionKey(mock);
    const second = readVisitorSessionKey(mock);
    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(8);
    expect(storage.get(VISITOR_SESSION_STORAGE_KEY)).toBe(first);
  });

  it("creates stable-length session keys", () => {
    const key = createVisitorSessionKey();
    expect(key.length).toBeGreaterThan(8);
  });
});
