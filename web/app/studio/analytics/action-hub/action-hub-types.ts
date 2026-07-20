/**
 * Types + shell mock for Insights Action Hub (v0 port).
 * Live wiring replaces MOCK_* in later todos.
 */

export type GoalId =
  | "engagement_optimization"
  | "new_audience_testing"
  | "format_optimization"
  | "language_outreach"
  | "trend_riding";

export type FindingSource =
  | "history"
  | "post"
  | "goals"
  | "moment"
  | "locale"
  | "performance"
  | "coverage";

export type PaceStatus = "on_track" | "behind" | "complete" | "bonus_available";

export type IconType = "trend" | "people" | "clock" | "tag";

export type FindingChip = {
  id: string;
  label: string;
  source: FindingSource;
  icon: IconType;
  highlight?: { text: string; value: string };
};

export type PostingAssistantContext = {
  goals: GoalId[];
  user_notes: string;
  locale: string | null;
  trend_note: string | null;
};

export type RecentPost = {
  id: string;
  rank: number;
  title: string;
  date: string;
  reach: string;
  thumb: string;
  alt: string;
};

export type Cadence = {
  posts_this_month: number;
  monthly_post_target: number;
  pace_status: PaceStatus;
  historical_hour_of_day: string;
  timing_confidence: "high" | "low";
};

export type LatestReport = {
  generated_at: string;
  focused_post_id: string;
  findings: { chips: FindingChip[] };
  fact_pack: {
    coverage: {
      stale: boolean;
      with_metrics: string[];
      without_metrics: string[];
    };
    cadence: Cadence;
    destination_mix: { dest: string; share: number }[];
    tags: string[];
    insight_codes: string[];
    reason_codes: string[];
  };
  coach_review: { hasOpenReview: boolean };
};

export type AutopostDraftFrame = {
  id: string;
  status: "nudged";
  intent: string;
  media_ids: string[];
  performance_goal_id?: string;
};

export const GOAL_LABELS: Record<GoalId, string> = {
  engagement_optimization: "Engagement",
  new_audience_testing: "New Audience",
  format_optimization: "Format",
  language_outreach: "Language",
  trend_riding: "Trending"
};

export const MOCK_BRIEF: PostingAssistantContext = {
  goals: ["engagement_optimization", "new_audience_testing"],
  user_notes:
    "Focus on productivity and systems thinking. Keep tone grounded, data-backed where possible.",
  locale: "en-US",
  trend_note: "AI productivity tools and second-brain workflows are trending this week."
};

export const MOCK_POSTS: RecentPost[] = [
  {
    id: "post-01",
    rank: 1,
    title: "The compounding advantage",
    date: "May 24",
    reach: "12.4K",
    thumb: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=120&h=120&fit=crop",
    alt: "Mountain peak at dawn"
  },
  {
    id: "post-02",
    rank: 2,
    title: "3 systems that saved me 10+ hrs",
    date: "May 21",
    reach: "9.8K",
    thumb: "https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=120&h=120&fit=crop",
    alt: "Notebook and pen on desk"
  },
  {
    id: "post-03",
    rank: 3,
    title: "Why most goals fail (and how to fix it)",
    date: "May 18",
    reach: "7.6K",
    thumb: "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=120&h=120&fit=crop",
    alt: "City skyline at sunset"
  },
  {
    id: "post-04",
    rank: 4,
    title: "How consistency creates freedom",
    date: "May 15",
    reach: "6.1K",
    thumb: "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=120&h=120&fit=crop",
    alt: "Runner on forest path"
  },
  {
    id: "post-05",
    rank: 5,
    title: "Weekly review: What moved the needle",
    date: "May 12",
    reach: "4.3K",
    thumb: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=120&h=120&fit=crop",
    alt: "Open journal with coffee"
  }
];

export const MOCK_REPORT: LatestReport = {
  generated_at: "Just now",
  focused_post_id: "post-01",
  findings: {
    chips: [
      {
        id: "find-01",
        label: "Short, specific hooks get {32%} more reach.",
        source: "performance",
        icon: "trend",
        highlight: { text: "{32%}", value: "32%" }
      },
      {
        id: "find-02",
        label: "Thought leadership posts drive the most engagement.",
        source: "history",
        icon: "people"
      },
      {
        id: "find-03",
        label: "Fridays between 9–11am perform best.",
        source: "moment",
        icon: "clock"
      },
      {
        id: "find-04",
        label: "Posts with 1–2 visuals get {28%} more reach.",
        source: "coverage",
        icon: "tag",
        highlight: { text: "{28%}", value: "28%" }
      }
    ]
  },
  fact_pack: {
    coverage: {
      stale: false,
      with_metrics: ["patreon", "x", "relay"],
      without_metrics: ["bluesky", "deviantart"]
    },
    cadence: {
      posts_this_month: 2,
      monthly_post_target: 4,
      pace_status: "on_track",
      historical_hour_of_day: "9–11am Friday",
      timing_confidence: "high"
    },
    destination_mix: [
      { dest: "patreon", share: 48 },
      { dest: "x", share: 31 },
      { dest: "relay", share: 21 }
    ],
    tags: ["productivity", "systems", "mindset", "growth", "consistency"],
    insight_codes: ["engagement_rate_high_vs_reach", "timing_window", "tag_above_median_reach"],
    reason_codes: ["PERF_HISTORY", "AUDIENCE_SIGNAL", "MOMENT_ANALYSIS"]
  },
  coach_review: { hasOpenReview: true }
};

export function generateDraftFrames(_findings: FindingChip[]): AutopostDraftFrame[] {
  return [
    {
      id: "draft-nudge-01",
      status: "nudged",
      intent: "Lead with a sharp, specific hook (data-backed)",
      media_ids: [],
      performance_goal_id: "engagement_optimization"
    },
    {
      id: "draft-nudge-02",
      status: "nudged",
      intent: "Thought leadership angle — challenge a common assumption",
      media_ids: [],
      performance_goal_id: "new_audience_testing"
    },
    {
      id: "draft-nudge-03",
      status: "nudged",
      intent: "Visual-first format — include 1–2 supporting images",
      media_ids: []
    }
  ];
}
