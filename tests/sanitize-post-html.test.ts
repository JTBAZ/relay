import { describe, expect, it } from "vitest";
import { sanitizeOptionalPostDescriptionHtml, sanitizePostDescriptionHtml } from "../src/security/sanitize-post-html.js";

describe("sanitizePostDescriptionHtml (R-SEC-02)", () => {
  it("strips script tags and event handlers", () => {
    const dirty =
      '<p>Hello</p><script>alert("xss")</script><img src=x onerror=alert(1) /><a href="javascript:alert(1)">x</a>';
    const clean = sanitizePostDescriptionHtml(dirty);
    expect(clean).not.toMatch(/script/i);
    expect(clean).not.toMatch(/onerror/i);
    expect(clean).not.toMatch(/javascript:/i);
    expect(clean).toContain("Hello");
  });

  it("preserves safe formatting and https links", () => {
    const input = '<p>Hello <strong>world</strong></p><a href="https://example.com" target="_blank">link</a>';
    const clean = sanitizePostDescriptionHtml(input);
    expect(clean).toContain("<strong>world</strong>");
    expect(clean).toContain('href="https://example.com"');
  });

  it("returns empty string for blank input", () => {
    expect(sanitizePostDescriptionHtml("")).toBe("");
    expect(sanitizeOptionalPostDescriptionHtml("   ")).toBeUndefined();
    expect(sanitizeOptionalPostDescriptionHtml(null)).toBeUndefined();
  });
});
