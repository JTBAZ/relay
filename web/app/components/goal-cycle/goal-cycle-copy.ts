/**
 * Goal Cycle Dream-flow copy + bounds (VS6-T03).
 * Safe labels only — no provider/AI text.
 */

import type { GoalCycleBreakMode, GoalCycleGoalKind } from "@/lib/goal-cycle-types";

export const GOAL_CYCLE_CONTEXT_TOPIC_MAX = 120;
export const GOAL_CYCLE_CONTEXT_NOTES_MAX = 400;
export const GOAL_CYCLE_CONTEXT_NICHE_MAX = 80;

export const GOAL_KIND_OPTIONS: Array<{
  id: GoalCycleGoalKind;
  label: string;
  help: string;
}> = [
  {
    id: "engagement",
    label: "Engagement",
    help: "Measures likes, comments, and interaction on your own posts — not follower growth claims."
  },
  {
    id: "views",
    label: "Views",
    help: "Uses Relay Performance Intelligence (impressions / seen / views as labeled). Not a paid-support proxy."
  },
  {
    id: "paid_support",
    label: "Paid support",
    help: "Counts new paid memberships, upgrades, purchases, or tips with clear attribution. Reach alone is not success."
  },
  {
    id: "break",
    label: "Take a break",
    help: "Rest is a valid Plan. Choose how quiet this cycle should be — never framed as failure."
  }
];

export const BREAK_MODE_OPTIONS: Array<{
  id: GoalCycleBreakMode;
  label: string;
  help: string;
  usesCredit: boolean;
}> = [
  {
    id: "complete_silence",
    label: "Complete silence",
    help: "No research, no new posts, reminders paused for the interval. Free — no Coach Plan credit.",
    usesCredit: false
  },
  {
    id: "social_upkeep",
    label: "Social upkeep",
    help: "Light maintenance from your history only. Uses one Coach Plan credit when research runs.",
    usesCredit: true
  },
  {
    id: "active_rest",
    label: "Active rest",
    help: "A small recovery Plan (sketches, WIP, low-energy updates). Uses one credit; capped slots.",
    usesCredit: true
  }
];

export const CREDIT_EXPLANATION =
  "One Coach Plan credit covers research, your initial Plan, and up to two AI revisions. Complete silence is free.";

export const NO_CREDIT_BODY =
  "Your Goal context is saved. One credit covers research, one Plan, and up to two revisions. Complete silence is free.";
