import { describe, expect, it } from "vitest";
import { formatFeedPublishedDate } from "../../web/lib/format-feed-published-date";

describe("formatFeedPublishedDate", () => {
  it("formats ISO timestamps as MM/DD/YYYY (UTC calendar date)", () => {
    expect(formatFeedPublishedDate("2026-05-20T12:00:00.000Z")).toBe("05/20/2026");
  });

  it("passes through non-ISO human labels unchanged", () => {
    expect(formatFeedPublishedDate("1 hour ago")).toBe("1 hour ago");
  });
});
