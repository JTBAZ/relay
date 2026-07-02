import { describe, expect, it } from "vitest";
import {
  postingGoalProgressLabel,
  postingGoalShowDismissActions,
  postingGoalShowStartAutopost,
  postingGoalShowUploadMedia,
  postingGoalStatusMessage,
  shouldShowPostingGoalStatusCard,
  type PostingGoalStatusSnapshot,
} from "../../web/lib/posting-goal-status-copy";

function snapshot(
  overrides: Partial<PostingGoalStatusSnapshot> = {}
): PostingGoalStatusSnapshot {
  return {
    goal: { monthly_post_target: 1, enabled: true },
    posts_this_month: 0,
    staged_media_count: 0,
    pace_status: "behind",
    active_nudge: null,
    ...overrides,
  };
}

describe("posting-goal status copy", () => {
  it("hides the card when goal is disabled or nudge is snoozed/skipped", () => {
    expect(shouldShowPostingGoalStatusCard(snapshot({ goal: { monthly_post_target: 1, enabled: false } }))).toBe(false);
    expect(
      shouldShowPostingGoalStatusCard(
        snapshot({ active_nudge: { status: "snoozed" } })
      )
    ).toBe(false);
    expect(
      shouldShowPostingGoalStatusCard(
        snapshot({ active_nudge: { status: "skipped" } })
      )
    ).toBe(false);
    expect(shouldShowPostingGoalStatusCard(snapshot())).toBe(true);
  });

  it("formats complete and on-track copy with progress", () => {
    const base = snapshot({ posts_this_month: 1, pace_status: "complete" });
    expect(postingGoalStatusMessage(base)).toContain("You're on pace: 1 / 1");
    expect(postingGoalProgressLabel(base)).toBe("1 / 1");
    expect(postingGoalStatusMessage(snapshot({ posts_this_month: 0, pace_status: "on_track" }))).toContain(
      "You're on pace:"
    );
  });

  it("formats behind states with and without staged media", () => {
    expect(postingGoalStatusMessage(snapshot({ pace_status: "behind" }))).toContain("bin is empty");
    expect(
      postingGoalStatusMessage(
        snapshot({ pace_status: "behind", staged_media_count: 2, goal: { monthly_post_target: 1, enabled: true } })
      )
    ).toContain("turn something from your bin");
  });

  it("formats bonus-available copy", () => {
    expect(
      postingGoalStatusMessage(
        snapshot({ pace_status: "bonus_available", posts_this_month: 1, staged_media_count: 3 })
      )
    ).toContain("unused media in your bin");
  });

  it("controls action visibility by pace state", () => {
    expect(postingGoalShowDismissActions(snapshot({ pace_status: "complete" }))).toBe(false);
    expect(postingGoalShowDismissActions(snapshot({ pace_status: "behind" }))).toBe(true);
    expect(
      postingGoalShowStartAutopost(snapshot({ pace_status: "behind", staged_media_count: 1 }))
    ).toBe(true);
    expect(postingGoalShowStartAutopost(snapshot({ pace_status: "behind" }))).toBe(false);
    expect(postingGoalShowUploadMedia(snapshot({ pace_status: "behind" }))).toBe(true);
    expect(
      postingGoalShowUploadMedia(snapshot({ pace_status: "behind", staged_media_count: 2 }))
    ).toBe(false);
  });
});
