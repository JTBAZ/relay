export type PostingGoalPaceStatus = "on_track" | "behind" | "complete" | "bonus_available";

export type PostingGoalNudgeStatus = "active" | "snoozed" | "skipped" | "resolved";

export type PostingGoalStatusSnapshot = {
  goal: {
    monthly_post_target: number;
    enabled: boolean;
  };
  posts_this_month: number;
  staged_media_count: number;
  pace_status: PostingGoalPaceStatus;
  active_nudge: null | {
    status: PostingGoalNudgeStatus;
  };
};

export function shouldShowPostingGoalStatusCard(status: PostingGoalStatusSnapshot): boolean {
  if (!status.goal.enabled) return false;
  const nudgeStatus = status.active_nudge?.status;
  if (nudgeStatus === "snoozed" || nudgeStatus === "skipped") return false;
  return true;
}

export function postingGoalProgressLabel(status: PostingGoalStatusSnapshot): string {
  return `${status.posts_this_month} / ${status.goal.monthly_post_target}`;
}

function monthlyTargetPhrase(target: number): string {
  if (target === 1) return "1 time";
  return `${target} times`;
}

export function postingGoalStatusMessage(status: PostingGoalStatusSnapshot): string {
  const { posts_this_month, goal, staged_media_count, pace_status } = status;
  const progress = `${posts_this_month} / ${goal.monthly_post_target}`;

  switch (pace_status) {
    case "complete":
    case "on_track":
      return `You're on pace: ${progress} Relay posts this month.`;
    case "bonus_available":
      return "You've hit your monthly goal, and there's still unused media in your bin. Want to prep one extra post?";
    case "behind":
      if (staged_media_count > 0) {
        return `You asked Relay to help you post ${monthlyTargetPhrase(goal.monthly_post_target)} this month. Want to turn something from your bin into a quick post?`;
      }
      return "Your bin is empty. Drop a WIP here and Relay will help turn it into a post.";
    default:
      return `Relay posts this month: ${progress}.`;
  }
}

export function postingGoalShowDismissActions(status: PostingGoalStatusSnapshot): boolean {
  return status.pace_status === "behind" || status.pace_status === "bonus_available";
}

export function postingGoalShowStartAutopost(status: PostingGoalStatusSnapshot): boolean {
  return (
    (status.pace_status === "behind" && status.staged_media_count > 0) ||
    status.pace_status === "bonus_available"
  );
}

export function postingGoalShowUploadMedia(status: PostingGoalStatusSnapshot): boolean {
  return status.pace_status === "behind" && status.staged_media_count === 0;
}
