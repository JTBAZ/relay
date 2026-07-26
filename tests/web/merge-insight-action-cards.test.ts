import { describe, expect, it } from "vitest";
import { mergeInsightActionCards } from "../../web/lib/merge-insight-action-cards";

describe("mergeInsightActionCards", () => {
  it("prefers performance cards and suppresses overlapping legacy promo cards", () => {
    const merged = mergeInsightActionCards(
      [
        {
          id: "winning-format",
          title: "Winning format",
          trigger: "legacy",
          body: "legacy body",
          tone: "active"
        },
        {
          id: "cadence",
          title: "Posting cadence",
          trigger: "legacy cadence",
          body: "legacy cadence body",
          tone: "watching"
        }
      ],
      {
        creator_id: "creator_a",
        as_of: "2026-06-30T12:00:00.000Z",
        range: "30d",
        actions: [
          {
            id: "perf-double-down-work",
            title: "Double down on top work",
            trigger: "Alpha leads",
            body: "Repeat the format.",
            action_label: "Open work drilldown",
            href: "/studio/analytics/works/work_alpha",
            tone: "active",
            confidence: "high"
          }
        ]
      }
    );

    expect(merged[0]?.id).toBe("perf-double-down-work");
    expect(merged.some((card) => card.id === "winning-format")).toBe(false);
    expect(merged.some((card) => card.id === "cadence")).toBe(true);
  });
});
