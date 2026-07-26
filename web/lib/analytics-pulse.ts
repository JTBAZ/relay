import type { CreatorPostPerformanceData } from "@/lib/relay-api";

export type PulseHotPick = {
  patreon_post_id: string;
  title: string;
  seen: number | null;
  likes: number;
  comments: number;
  hours_since_publish: number;
  /** Primary ranking metric (Seen ÷ hours, or (likes+comments) ÷ hours when Seen missing or zero). */
  score_per_hour: number;
  score_label: "seen_per_hour" | "engagement_per_hour";
};

/**
 * Top post by Seen/hour when Patreon Insights "Seen" is present and positive; otherwise by (likes+comments)/hour.
 * Requires `relay.published_at` — no synthetic rates without a publish timestamp.
 */
export function pickHottestFromPostPerformance(
  report: CreatorPostPerformanceData | null,
  nowMs: number = Date.now()
): PulseHotPick | null {
  if (!report?.rows?.length) {
    return null;
  }

  let best: PulseHotPick | null = null;
  let bestScore = -1;

  for (const r of report.rows) {
    const ins = r.insights;
    const pub = r.relay?.published_at;
    if (!ins || !pub) {
      continue;
    }
    const pubMs = new Date(pub).getTime();
    if (!Number.isFinite(pubMs) || pubMs > nowMs) {
      continue;
    }

    const hours = Math.max(1, (nowMs - pubMs) / 3_600_000);
    const seen = ins.seen;
    const likes = ins.likes ?? 0;
    const comments = ins.comments ?? 0;
    const engagement = likes + comments;

    const useSeen = seen != null && seen > 0;
    const scorePerHour = useSeen ? seen / hours : engagement / hours;
    if (!useSeen && engagement <= 0) {
      continue;
    }

    const title = r.relay?.title?.trim() || r.patreon_post_id;

    if (scorePerHour > bestScore) {
      bestScore = scorePerHour;
      best = {
        patreon_post_id: r.patreon_post_id,
        title,
        seen: seen ?? null,
        likes,
        comments,
        hours_since_publish: hours,
        score_per_hour: scorePerHour,
        score_label: useSeen ? "seen_per_hour" : "engagement_per_hour"
      };
    }
  }

  return best;
}
