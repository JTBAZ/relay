import { describe, expect, it, vi } from "vitest";
import {
  getCreatorStudioBrief,
  normalizeStudioBriefGoals,
  patchCreatorStudioBrief,
  StudioBriefValidationError,
  studioBriefToAssistantContext,
  STUDIO_BRIEF_MAX_GOALS
} from "../src/creator/studio-brief-service.js";

function prismaStub(over: Record<string, unknown>) {
  return over as any;
}

describe("studio-brief-service", () => {
  it("normalizes unique goals and rejects unknown / over-cap", () => {
    expect(normalizeStudioBriefGoals(["engagement_optimization", "engagement_optimization"])).toEqual([
      "engagement_optimization"
    ]);
    expect(() => normalizeStudioBriefGoals(["not_a_goal"])).toThrow(StudioBriefValidationError);
    expect(() =>
      normalizeStudioBriefGoals([
        "engagement_optimization",
        "new_audience_testing",
        "format_optimization"
      ])
    ).toThrow(/At most 2/);
    expect(STUDIO_BRIEF_MAX_GOALS).toBe(2);
  });

  it("returns empty brief when no row", async () => {
    const prisma = prismaStub({
      creatorStudioBrief: {
        findUnique: vi.fn().mockResolvedValue(null)
      }
    });
    const brief = await getCreatorStudioBrief(prisma, "cr1");
    expect(brief).toEqual({
      creator_id: "cr1",
      goals: [],
      user_notes: null,
      locale: null,
      trend_note: null,
      updated_at: null
    });
  });

  it("upserts patch fields and maps to assistant context", async () => {
    const now = new Date("2026-07-11T12:00:00.000Z");
    const upsert = vi.fn().mockResolvedValue({
      creatorId: "cr1",
      goals: ["engagement_optimization", "trend_riding"],
      userNotes: "Keep tone grounded",
      locale: "en-US",
      trendNote: "second brain",
      updatedAt: now
    });
    const prisma = prismaStub({
      creatorStudioBrief: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert
      }
    });

    const brief = await patchCreatorStudioBrief(prisma, "cr1", {
      goals: ["engagement_optimization", "trend_riding"],
      user_notes: "  Keep tone grounded  ",
      locale: "en-US",
      trend_note: "second brain"
    });

    expect(upsert).toHaveBeenCalledOnce();
    expect(brief.goals).toEqual(["engagement_optimization", "trend_riding"]);
    expect(brief.user_notes).toBe("Keep tone grounded");
    expect(studioBriefToAssistantContext(brief)).toEqual({
      goals: ["engagement_optimization", "trend_riding"],
      user_notes: "Keep tone grounded",
      locale: "en-US",
      trend_note: "second brain"
    });
  });
});
