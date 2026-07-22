/** Lab-only Goals chat frame — mock spine. See docs/studio/GOALS_LAB_FRAME_BEAT_MAP.md */

export type GoalsBeat =
  | "activate"
  | "goal"
  | "break_mode"
  | "context"
  | "scan"
  | "strategy"
  | "plan"
  | "revise"
  | "done";

export type GoalsGoalId = "engagement" | "views" | "paid" | "break";
export type GoalsBreakMode = "silence" | "upkeep" | "active_rest";
export type GoalsVibe = "sketches" | "wips" | "finished" | "mixed";

export type ChatRole = "coach" | "user" | "system";

export type ChatBubble = {
  id: string;
  role: ChatRole;
  /** Display face for coach takeaway titles */
  display?: boolean;
  body: string;
  kind?: "text" | "metric" | "takeaway" | "strategy" | "plan";
};

export type PlanRow = {
  id: string;
  title: string;
  when: string;
  destinations: string[];
  kind: "post" | "upkeep";
};

export const GOALS_POSITIVE_NOTE =
  "Last month: +18% engagement on sketch drops";

export const GOALS_STRATEGY_BODY =
  "Two sketch teasers on X mid-week keep discovery light; one longer Patreon process post Friday gives supporters something worth the pledge - still room to actually draw.";

export const INITIAL_PLAN_ROWS: PlanRow[] = [
  {
    id: "r1",
    title: "X teaser",
    when: "Wed 11:00",
    destinations: ["X"],
    kind: "post"
  },
  {
    id: "r2",
    title: "X WIP reply thread cue",
    when: "Wed evening",
    destinations: ["X"],
    kind: "upkeep"
  },
  {
    id: "r3",
    title: "Patreon process post",
    when: "Fri 17:00",
    destinations: ["Patreon"],
    kind: "post"
  },
  {
    id: "r4",
    title: "X weekend sketch",
    when: "Sat 12:00",
    destinations: ["X"],
    kind: "post"
  }
];

export const REVISED_PLAN_ROWS: PlanRow[] = [
  {
    id: "r1",
    title: "X morning sketch drop",
    when: "Thu 10:30",
    destinations: ["X"],
    kind: "post"
  },
  {
    id: "r2",
    title: "X WIP reply thread cue",
    when: "Thu evening",
    destinations: ["X"],
    kind: "upkeep"
  },
  {
    id: "r3",
    title: "Patreon process post",
    when: "Fri 17:00",
    destinations: ["Patreon"],
    kind: "post"
  },
  {
    id: "r4",
    title: "X weekend sketch",
    when: "Sat 14:00",
    destinations: ["X"],
    kind: "post"
  }
];

export const GOAL_OPTIONS: Array<{ id: GoalsGoalId; label: string; help: string }> = [
  {
    id: "engagement",
    label: "Grow engagement",
    help: "Relay tracks replies, saves, and conversation on your drops."
  },
  {
    id: "views",
    label: "Grow views / impressions",
    help: "Relay tracks reach on teasers and discovery posts."
  },
  {
    id: "paid",
    label: "Paid support (Patreon)",
    help: "Relay tracks pledges and supporter-facing posts."
  },
  {
    id: "break",
    label: "Take a break",
    help: "Rest is a plan, not a failure - pick how quiet you want the month."
  }
];

export const BREAK_OPTIONS: Array<{ id: GoalsBreakMode; label: string; help: string }> = [
  {
    id: "silence",
    label: "Complete silence",
    help: "No research, no new posts, reminders paused."
  },
  {
    id: "upkeep",
    label: "Social upkeep",
    help: "Light maintenance from your history only."
  },
  {
    id: "active_rest",
    label: "Active rest",
    help: "Soft creative cadence without growth pressure."
  }
];

export const VIBE_OPTIONS: Array<{ id: GoalsVibe; label: string }> = [
  { id: "sketches", label: "Sketches" },
  { id: "wips", label: "WIPs + process" },
  { id: "finished", label: "Finished pieces" },
  { id: "mixed", label: "Mixed" }
];

export const STRATEGY_ADJUST_CHIPS = [
  "Lighter cadence",
  "Heavier cadence",
  "More Patreon",
  "More X teasers"
] as const;

let bubbleSeq = 0;
export function nextBubbleId(prefix = "b"): string {
  bubbleSeq += 1;
  return `${prefix}-${bubbleSeq}`;
}

export function resetBubbleSeq(): void {
  bubbleSeq = 0;
}
