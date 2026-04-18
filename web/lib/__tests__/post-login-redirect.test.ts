import { describe, expect, it } from "vitest";
import { resolvePostAuthPath } from "../post-login-redirect";

describe("resolvePostAuthPath", () => {
  it("returns / for null/undefined/empty/whitespace", () => {
    expect(resolvePostAuthPath(null)).toBe("/");
    expect(resolvePostAuthPath(undefined)).toBe("/");
    expect(resolvePostAuthPath("")).toBe("/");
    expect(resolvePostAuthPath("   ")).toBe("/");
  });

  it("rejects protocol-relative URLs (//evil.com)", () => {
    expect(resolvePostAuthPath("//evil.com/x")).toBe("/");
    expect(resolvePostAuthPath("//evil.com")).toBe("/");
  });

  it("rejects absolute URLs", () => {
    expect(resolvePostAuthPath("http://evil.com/x")).toBe("/");
    expect(resolvePostAuthPath("https://evil.com/x")).toBe("/");
  });

  it("accepts same-origin paths starting with single /", () => {
    expect(resolvePostAuthPath("/designer")).toBe("/designer");
    expect(resolvePostAuthPath("/patron/feed")).toBe("/patron/feed");
    expect(resolvePostAuthPath("/")).toBe("/");
  });

  it("preserves query strings on accepted paths", () => {
    expect(resolvePostAuthPath("/designer?tab=layouts")).toBe("/designer?tab=layouts");
  });

  it("passes through /foo/../bar (normalization is route-layer)", () => {
    expect(resolvePostAuthPath("/foo/../bar")).toBe("/foo/../bar");
  });
});
