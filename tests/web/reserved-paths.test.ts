import { describe, expect, it } from "vitest";
import { isReservedPathSegment, RESERVED_PATH_SEGMENTS } from "../../web/lib/reserved-paths";

describe("reserved-paths", () => {
  it("blocks first-party route segments", () => {
    for (const segment of ["feed", "studio", "settings", "connect", "api"]) {
      expect(RESERVED_PATH_SEGMENTS.has(segment)).toBe(true);
      expect(isReservedPathSegment(segment)).toBe(true);
    }
  });

  it("allows normal creator handles", () => {
    expect(isReservedPathSegment("anya")).toBe(false);
    expect(isReservedPathSegment("my-art-studio")).toBe(false);
  });

  it("treats empty segments as reserved", () => {
    expect(isReservedPathSegment("")).toBe(true);
    expect(isReservedPathSegment("   ")).toBe(true);
  });
});
