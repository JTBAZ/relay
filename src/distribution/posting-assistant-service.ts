/**
 * @fileoverview Posting Assistant — tier-gated variant enhancement (deterministic v1 stub).
 */

import type { PrismaClient } from "@prisma/client";
import type { FormattedPlatformVariant } from "./platform-formatters.js";
import type { DistributionDestination } from "./platform-destinations.js";

/**
 * Structured assistant goals — each maps to a distinct prompt instruction set.
 * These are the only goals the assistant will act on in v1+.
 */
export type AssistantGoal =
  | "engagement_optimization"  // Rewrite copy for platform-native engagement patterns
  | "new_audience_testing"     // Broaden framing to attract new followers, not just existing fans
  | "language_outreach"        // Translate / localise for a target language/locale
  | "trend_riding"             // Align post angle with a user-specified trend or moment
  | "format_optimization";     // Restructure the post for the platform format (thread, short-form, etc.)

export type PostingAssistantContext = {
  /** Structured goal chips — each becomes a distinct LLM instruction block. */
  goals?: AssistantGoal[];
  /** Free-text context shown to the LLM only when goals are active. */
  user_notes?: string | null;
  /**
   * Target locale for language_outreach (BCP-47 tag, e.g. "es", "pt-BR").
   * Only surfaced when language_outreach goal is selected.
   */
  locale?: string | null;
  /**
   * Trend or moment description for trend_riding goal.
   * Only surfaced when trend_riding is selected.
   */
  trend_note?: string | null;
  /** @deprecated use goals array instead — kept for backward compat with stored plans */
  target_audience?: string | null;
  /** @deprecated kept for backward compat */
  timezone?: string | null;
};

export type PostingAssistantFacts = {
  monthly_post_target?: number;
  posts_this_month?: number;
  user_notes?: string | null;
};

/** v1: assistant membership always allowed in dev; gate via env in prod later. */
export function isPostingAssistantAllowed(_creatorId: string): boolean {
  return process.env.RELAY_POSTING_ASSISTANT_DISABLED !== "true";
}

export async function loadPostingAssistantFacts(
  prisma: PrismaClient,
  creatorId: string
): Promise<PostingAssistantFacts> {
  const goal = await prisma.creatorPostingGoal.findUnique({
    where: { creatorId },
    select: { monthlyPostTarget: true }
  });
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const postsThisMonth = await prisma.post.count({
    where: {
      creatorId,
      source: "RELAY",
      upstreamStatus: "active",
      createdAt: { gte: monthStart }
    }
  });
  return {
    monthly_post_target: goal?.monthlyPostTarget ?? 1,
    posts_this_month: postsThisMonth
  };
}

/**
 * v1 assistant: adds deterministic advice without LLM when AI unavailable.
 * Future: call src/ai with facts only.
 */
export async function applyPostingAssistantToVariants(
  prisma: PrismaClient,
  creatorId: string,
  variants: FormattedPlatformVariant[],
  context: PostingAssistantContext,
  enabledDestinations: Set<DistributionDestination>
): Promise<{ assistantMode: string; assistantPlan: Record<string, unknown>; variants: FormattedPlatformVariant[] }> {
  if (!isPostingAssistantAllowed(creatorId)) {
    return {
      assistantMode: "skipped",
      assistantPlan: { reason: "tier_not_allowed" },
      variants
    };
  }

  const facts = await loadPostingAssistantFacts(prisma, creatorId);
  const goals = context.goals ?? [];
  const assistantPlan: Record<string, unknown> = {
    goals,
    strategy_summary: goals.length > 0
      ? `Goals: ${goals.join(", ")}. Optimize using posting rhythm and platform-specific formatting.`
      : "Optimize reach using your monthly posting rhythm and platform-specific formatting.",
    facts,
    user_notes: context.user_notes ?? null,
    locale: context.locale ?? null,
    trend_note: context.trend_note ?? null
  };

  const enhanced = variants.map((variant) => {
    if (!enabledDestinations.has(variant.destination)) {
      return variant;
    }
    const advice = { ...variant.advice };
    advice.rationale =
      variant.destination === "x"
        ? "Single post text with hashtags appended for discoverability."
        : variant.destination === "deviantart"
          ? "Title, description, and tags formatted for DeviantArt submit."
          : "Copy aligned to platform norms.";
    advice.suggested_post_time = "Evening in your local timezone (review before scheduling).";
    if (context.locale) {
      advice.rationale = `${advice.rationale} Locale hint: ${context.locale}.`;
    }
    return { ...variant, advice };
  });

  return {
    assistantMode: "completed",
    assistantPlan,
    variants: enhanced
  };
}
