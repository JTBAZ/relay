import { describe, expect, it } from "vitest";
import {
  extractMountedReportFromAssistantPlan,
  mergeAssistantContextWithStudioBrief
} from "../src/creator/studio-mounted-context.js";
import type { StudioBriefWire } from "../src/creator/studio-brief-service.js";

const brief = (over: Partial<StudioBriefWire> = {}): StudioBriefWire => ({
  creator_id: "cr1",
  goals: ["engagement_optimization"],
  user_notes: "Keep tone grounded",
  locale: "en-US",
  trend_note: "second brain",
  updated_at: "2026-07-11T12:00:00.000Z",
  ...over
});

describe("studio-mounted-context", () => {
  it("extracts finding labels and reason codes without inventing data", () => {
    const snippet = extractMountedReportFromAssistantPlan(
      "post-1",
      {
        proposal: {
          path_id: "engage",
          findings: {
            chips: [{ id: "c1", label: "Hooks convert better", source: "performance" }]
          },
          fact_pack: { reason_codes: ["PERF_HISTORY", "timing_insufficient"] }
        }
      },
      new Date("2026-07-11T12:00:00.000Z")
    );
    expect(snippet).toEqual({
      post_id: "post-1",
      path_id: "engage",
      finding_labels: ["Hooks convert better"],
      reason_codes: ["PERF_HISTORY", "timing_insufficient"],
      updated_at: "2026-07-11T12:00:00.000Z"
    });
  });

  it("returns null when proposal has no usable chips/codes", () => {
    expect(
      extractMountedReportFromAssistantPlan("post-1", { proposal: { findings: { chips: [] } } }, null)
    ).toBeNull();
  });

  it("merges studio brief under empty request context; request wins when set", () => {
    const mergedEmpty = mergeAssistantContextWithStudioBrief({}, brief());
    expect(mergedEmpty.goals).toEqual(["engagement_optimization"]);
    expect(mergedEmpty.user_notes).toBe("Keep tone grounded");

    const mergedWin = mergeAssistantContextWithStudioBrief(
      {
        goals: ["trend_riding"],
        user_notes: "Override notes",
        locale: "es",
        trend_note: null
      },
      brief()
    );
    expect(mergedWin.goals).toEqual(["trend_riding"]);
    expect(mergedWin.user_notes).toBe("Override notes");
    expect(mergedWin.locale).toBe("es");
    expect(mergedWin.trend_note).toBe("second brain");
  });
});
