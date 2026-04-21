import { describe, expect, it } from "vitest";
import {
  generateAutoPatronHandle,
  isReservedPatronHandle,
  normalizePatronHandle,
  validatePatronHandleFormat
} from "../../src/patron/patron-handle-policy.js";

describe("patron-handle-policy", () => {
  it("normalizePatronHandle lowercases and trims", () => {
    expect(normalizePatronHandle("  Foo_Bar  ")).toBe("foo_bar");
  });

  it("validatePatronHandleFormat accepts 2–30 [a-z0-9_-]", () => {
    expect(validatePatronHandleFormat("ab").ok).toBe(true);
    expect(validatePatronHandleFormat("a").ok).toBe(false);
    expect(validatePatronHandleFormat("a".repeat(31)).ok).toBe(false);
    expect(validatePatronHandleFormat("bad space").ok).toBe(false);
  });

  it("isReservedPatronHandle matches reserved set", () => {
    expect(isReservedPatronHandle("admin")).toBe(true);
    expect(isReservedPatronHandle("alice")).toBe(false);
  });

  it("generateAutoPatronHandle matches user_<hex> shape", () => {
    const h = generateAutoPatronHandle();
    expect(h).toMatch(/^user_[a-f0-9]{6}$/);
    expect(validatePatronHandleFormat(h).ok).toBe(true);
  });
});
