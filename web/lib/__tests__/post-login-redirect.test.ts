import { describe, expect, it } from "vitest";
import { resolvePostAuthPath } from "../post-login-redirect";

describe("resolvePostAuthPath", () => {
  it("returns /studio for null/undefined/empty/whitespace", () => {
    expect(resolvePostAuthPath(null)).toBe("/studio");
    expect(resolvePostAuthPath(undefined)).toBe("/studio");
    expect(resolvePostAuthPath("")).toBe("/studio");
    expect(resolvePostAuthPath("   ")).toBe("/studio");
  });

  it("rejects protocol-relative URLs (//evil.com)", () => {
    expect(resolvePostAuthPath("//evil.com/x")).toBe("/studio");
    expect(resolvePostAuthPath("//evil.com")).toBe("/studio");
  });

  it("rejects absolute URLs", () => {
    expect(resolvePostAuthPath("http://evil.com/x")).toBe("/studio");
    expect(resolvePostAuthPath("https://evil.com/x")).toBe("/studio");
  });

  it("accepts same-origin paths starting with single /", () => {
    expect(resolvePostAuthPath("/studio/designer")).toBe("/studio/designer");
    expect(resolvePostAuthPath("/feed")).toBe("/feed");
    expect(resolvePostAuthPath("/")).toBe("/");
  });

  it("preserves query strings on accepted paths", () => {
    expect(resolvePostAuthPath("/studio/designer?tab=layouts")).toBe("/studio/designer?tab=layouts");
  });

  it("passes through /foo/../bar (normalization is route-layer)", () => {
    expect(resolvePostAuthPath("/foo/../bar")).toBe("/foo/../bar");
  });
});
