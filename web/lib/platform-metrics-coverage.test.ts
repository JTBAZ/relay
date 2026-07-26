import { describe, expect, it } from "vitest";

function pct(part: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((part / total) * 1000) / 10}%`;
}

describe("data coverage percentages (PMD-012)", () => {
  it("computes live and missing percentages", () => {
    expect(pct(10, 69)).toBe("14.5%");
    expect(pct(51, 69)).toBe("73.9%");
    expect(pct(0, 0)).toBe("0%");
  });
});
