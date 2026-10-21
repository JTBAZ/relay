/**
 * @fileoverview Posting Assistant / Relay Coach — tier-gated variant enhancement.
 * Premium creators (see `../creator/creator-feature-flags-service.js`) get an LLM-drafted
 * rationale + optional copy rewrite + a recommended post time from their own Relay posting
 * history (never live external "trend" data). Standard creators never reach the LLM path;
 * `createPostDistributionPlan` only calls this when a destination's assistant flag is on.
 */

import type { PrismaClient } from "@prisma/client";
import { PostSource, PostUpstreamStatus } from "@prisma/client";
import { generateText } from "../ai/ai-service.js";
import { isPostingAssistantAllowedForCreator } from "../creator/creator-feature-flags-service.js";
import { zonedMidnightUtc } from "../autopost/posting-goal-service.js";
import type { FormattedPlatformVariant } from "./platform-formatters.js";
import type { DistributionDestination } from "./platform-destinations.js";

/**
 * Structured assistant goals — each maps to a distinct prompt instruction set.
 * These are the only goals the assistant will act on in v1+.
 */
export type AssistantGoal =
  | "engagement_optimization" // Rewrite copy for platform-native engagement patterns
  | "new_audience_testing" // Broaden framing to attract new followers, not just existing fans
  | "language_outreach" // Translate / localise for a target language/locale
  | "trend_riding" // Align post angle with a user-specified trend or moment
  | "format_optimization"; // Restructure the post for the platform format (thread, short-form, etc.)

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
  /**
   * Creator-accepted copy from Coach Attack Review.
   * When present for a destination, that text is locked in and the rewrite LLM is skipped.
   */
  accepted_copy_by_destination?: Partial<
    Record<
      DistributionDestination,
      {
        title?: string | null;
        body_text: string;
        formula_id?: string;
        variant_id?: string;
      }
    >
  >;
  /** @deprecated use goals array instead — kept for backward compat with stored plans */
  target_audience?: string | null;
  /** @deprecated kept for backward compat */
  timezone?: string | null;
};

export type PostingAssistantFacts = {
  monthly_post_target?: number;
  posts_this_month?: number;
  user_notes?: string | null;
  /** Local hour-of-day (0-23) this creator's own posts most often go out, per destination. */
  historical_hour_of_day: number | null;
  /** How many past posted variants informed `historical_hour_of_day` (0 = no history, using default). */
  sample_size: number;
  timezone: string;
};

/** Per-destination copy rewrite from Coach. */
export type AssistantVariantRewrite = {
  title?: string | null;
  body_text?: string | null;
};

/**
 * Shared JSON contract for `metadata.feature = "posting_assistant"`.
 * Mock + Anthropic must return this shape. `variants` is required when goals request rewrite.
 */
export type AssistantAiOutput = {
  rationale: Record<string, string>;
  timing_note: string | null;
  variants?: Partial<Record<DistributionDestination, AssistantVariantRewrite>>;
};

/** @deprecated use `isPostingAssistantAllowedForCreator` (async, DB-backed) instead. */
export function isPostingAssistantAllowed(_creatorId: string): boolean {
  return process.env.RELAY_POSTING_ASSISTANT_DISABLED !== "true";
}

const DEFAULT_SUGGESTED_HOUR = 19; // 7pm local — generic "evening" best-practice fallback.

/** All current Coach goals imply copy changes when selected. */
export function goalsRequestRewrite(goals: AssistantGoal[]): boolean {
  return goals.length > 0;
}

/**
 * Heuristic (no external trend feed exists): looks at when this creator's own posted
 * distribution attempts + native Relay publishes actually went out, and picks the most
 * common local hour-of-day. Falls back to a generic evening slot with zero sample size.
 */
export async function computeSuggestedPostHour(
  prisma: PrismaClient,
  creatorId: string,
  timeZone: string
): Promise<{ hour: number; sampleSize: number }> {
  const [attempts, posts] = await Promise.all([
    prisma.postDistributionAttempt.findMany({
      where: { creatorId, status: "posted" },
      select: { completedAt: true, startedAt: true },
      orderBy: { completedAt: "desc" },
      take: 50
    }),
    prisma.post.findMany({
      where: { creatorId, source: PostSource.RELAY, upstreamStatus: PostUpstreamStatus.active },
      include: { versions: { orderBy: { versionSeq: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
      take: 50
    })
  ]);

  const fmt = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: false });
  const hourCounts = new Map<number, number>();
  const tally = (date: Date | null | undefined) => {
    if (!date) return;
    const parts = fmt.formatToParts(date);
    const raw = Number(parts.find((p) => p.type === "hour")?.value ?? "NaN");
    if (!Number.isFinite(raw)) return;
    const hour = raw % 24;
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
  };

  for (const attempt of attempts) {
    tally(attempt.completedAt ?? attempt.startedAt);
  }
  for (const post of posts) {
    const publishedAt = post.versions[0]?.publishedAt;
    if (publishedAt && publishedAt.getTime() > 0) tally(publishedAt);
  }

  const sampleSize = [...hourCounts.values()].reduce((sum, n) => sum + n, 0);
  if (sampleSize === 0) {
    return { hour: DEFAULT_SUGGESTED_HOUR, sampleSize: 0 };
  }

  let bestHour = DEFAULT_SUGGESTED_HOUR;
  let bestCount = -1;
  for (const [hour, count] of hourCounts) {
    if (count > bestCount) {
      bestCount = count;
      bestHour = hour;
    }
  }
  return { hour: bestHour, sampleSize };
}

/** Next occurrence (today or tomorrow) of `hour:00` local time in `timeZone`, as an ISO instant. */
export function nextLocalHourAsIso(hour: number, timeZone: string, now = new Date()): string {
  const localDateParts = (date: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);
    return {
      year: Number(parts.find((p) => p.type === "year")?.value ?? "1970"),
      month: Number(parts.find((p) => p.type === "month")?.value ?? "1"),
      day: Number(parts.find((p) => p.type === "day")?.value ?? "1")
    };
  };

  const candidateForDate = (dateParts: { year: number; month: number; day: number }) =>
    new Date(
      zonedMidnightUtc(dateParts.year, dateParts.month, dateParts.day, timeZone).getTime() +
        hour * 3600_000
    );

  const today = candidateForDate(localDateParts(now));
  if (today.getTime() > now.getTime()) return today.toISOString();

  const tomorrow = candidateForDate(localDateParts(new Date(now.getTime() + 24 * 3600_000)));
  return tomorrow.toISOString();
}

export async function loadPostingAssistantFacts(
  prisma: PrismaClient,
  creatorId: string,
  timeZone = "UTC"
): Promise<PostingAssistantFacts> {
  const goal = await prisma.creatorPostingGoal.findUnique({
    where: { creatorId },
    select: { monthlyPostTarget: true, timezone: true }
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
  const resolvedTimeZone = goal?.timezone?.trim() || timeZone || "UTC";
  const { hour, sampleSize } = await computeSuggestedPostHour(prisma, creatorId, resolvedTimeZone);
  return {
    monthly_post_target: goal?.monthlyPostTarget ?? 1,
    posts_this_month: postsThisMonth,
    historical_hour_of_day: sampleSize > 0 ? hour : null,
    sample_size: sampleSize,
    timezone: resolvedTimeZone
  };
}

function goalInstruction(goal: AssistantGoal): string {
  switch (goal) {
    case "engagement_optimization":
      return "Optimize phrasing for platform-native engagement (hooks, clear CTA) without changing the facts.";
    case "new_audience_testing":
      return "Broaden the framing so it reads clearly to someone who has never seen this creator's work before.";
    case "language_outreach":
      return "Translate/localize the copy for the target locale, keeping meaning exact.";
    case "trend_riding":
      return "Frame the post around the trend/moment the creator described, without inventing details.";
    case "format_optimization":
      return "Restructure for the platform's native format conventions (thread-friendly, short-form, etc.).";
    default:
      return "";
  }
}

function variantSourceBody(variant: FormattedPlatformVariant): string {
  return (variant.postText ?? variant.bodyText ?? "").trim();
}

/** Apply a Coach rewrite onto a formatted variant (pure — used by AI path + tests). */
export function applyCoachRewriteToVariant(
  variant: FormattedPlatformVariant,
  rewrite: AssistantVariantRewrite | undefined,
  opts: { rationale: string; suggestedTimeIso: string; timingNote: string | null }
): FormattedPlatformVariant {
  const advice = { ...variant.advice };
  advice.rationale = opts.timingNote
    ? `${opts.rationale} ${opts.timingNote}`.trim()
    : opts.rationale;
  advice.suggested_post_time = opts.suggestedTimeIso;

  if (!rewrite) {
    return { ...variant, advice };
  }

  const nextTitle =
    rewrite.title !== undefined
      ? typeof rewrite.title === "string"
        ? rewrite.title.trim() || null
        : null
      : variant.title;
  const nextBodyRaw =
    rewrite.body_text !== undefined
      ? typeof rewrite.body_text === "string"
        ? rewrite.body_text.trim()
        : ""
      : null;

  advice.coach_edited = nextBodyRaw !== null || rewrite.title !== undefined;

  if (variant.destination === "x" || variant.destination === "bluesky") {
    const postText = nextBodyRaw !== null ? nextBodyRaw || null : variant.postText;
    return {
      ...variant,
      title: variant.destination === "bluesky" ? null : nextTitle,
      bodyText: variant.destination === "x" ? variant.bodyText : null,
      postText,
      advice
    };
  }

  return {
    ...variant,
    title: nextTitle,
    bodyText: nextBodyRaw !== null ? nextBodyRaw || null : variant.bodyText,
    postText: null,
    advice
  };
}

/** Parse + validate Coach JSON; returns null on any structural failure. */
export function parseAssistantAiOutput(
  text: string,
  destinations: DistributionDestination[]
): AssistantAiOutput | null {
  try {
    const parsed = JSON.parse(text) as Partial<AssistantAiOutput>;
    if (!parsed.rationale || typeof parsed.rationale !== "object") return null;
    const rationale: Record<string, string> = {};
    for (const dest of destinations) {
      const raw = (parsed.rationale as Record<string, unknown>)[dest];
      if (typeof raw === "string" && raw.trim()) rationale[dest] = raw.trim();
    }
    if (Object.keys(rationale).length === 0) return null;

    let variants: AssistantAiOutput["variants"];
    if (parsed.variants && typeof parsed.variants === "object") {
      variants = {};
      for (const dest of destinations) {
        const row = (parsed.variants as Record<string, unknown>)[dest];
        if (!row || typeof row !== "object" || Array.isArray(row)) continue;
        const rec = row as Record<string, unknown>;
        const entry: AssistantVariantRewrite = {};
        if ("title" in rec) {
          entry.title = typeof rec.title === "string" ? rec.title : null;
        }
        if ("body_text" in rec && typeof rec.body_text === "string") {
          entry.body_text = rec.body_text;
        }
        if (entry.title !== undefined || entry.body_text !== undefined) {
          variants[dest] = entry;
        }
      }
    }

    return {
      rationale,
      timing_note: typeof parsed.timing_note === "string" ? parsed.timing_note : null,
      variants
    };
  } catch {
    return null;
  }
}

async function generateAssistantOutput(args: {
  destinations: DistributionDestination[];
  goals: AssistantGoal[];
  facts: PostingAssistantFacts;
  context: PostingAssistantContext;
  suggestedTimeIso: string;
  variants: FormattedPlatformVariant[];
  wantRewrite: boolean;
  creatorId?: string;
}): Promise<AssistantAiOutput | null> {
  const { destinations, goals, facts, context, suggestedTimeIso, variants, wantRewrite, creatorId } =
    args;
  const goalInstructions = goals.map((g) => `- ${g}: ${goalInstruction(g)}`).join("\n");

  const variantPayload = destinations.map((destination) => {
    const v = variants.find((row) => row.destination === destination);
    return {
      destination,
      title: v?.title ?? null,
      body_text: v ? variantSourceBody(v) : ""
    };
  });

  const rewriteClause = wantRewrite
    ? [
        'Also return "variants": { "<destination>": { "title": string|null, "body_text": string } }.',
        "variants must include every destination. Rewrite body_text (and title when the platform uses one) toward the goals.",
        "Do not invent facts, links, or metrics. Keep X/Bluesky body_text within platform length norms when possible.",
        "title may be null for destinations that are text-only (x, bluesky)."
      ].join(" ")
    : 'Omit "variants" (or leave it empty) — only rationale and timing_note are required.';

  const result = await generateText({
    tier: "cheap",
    system: [
      "You are Relay Coach, advising an independent artist on cross-posting a single piece of content.",
      "Use ONLY the facts and current copy in the user message. Never invent metrics, trend data, follower counts, or dates.",
      "Relay has no live external trend feed — 'trend' facts come only from the creator's own note, if present.",
      'Return strict JSON: { "rationale": { "<destination>": "one or two sentence rationale" }, "timing_note": "short sentence or null", "variants"?: { ... } }.',
      "rationale must have exactly one key per destination listed in destinations.",
      "Keep each rationale under 220 characters. Be concrete and specific to that platform, not generic.",
      rewriteClause
    ].join(" "),
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          destinations,
          goals,
          goal_instructions: goalInstructions || null,
          want_rewrite: wantRewrite,
          user_notes: context.user_notes ?? null,
          trend_note: context.trend_note ?? null,
          locale: context.locale ?? null,
          facts: {
            monthly_post_target: facts.monthly_post_target,
            posts_this_month: facts.posts_this_month,
            historical_hour_of_day: facts.historical_hour_of_day,
            sample_size: facts.sample_size,
            timezone: facts.timezone
          },
          suggested_post_time_iso: suggestedTimeIso,
          current_variants: variantPayload
        })
      }
    ],
    maxOutputTokens: wantRewrite ? 1400 : 700,
    temperature: 0.5,
    metadata: {
      feature: "posting_assistant",
      ...(creatorId ? { creatorId } : {})
    }
  });

  if (!result.ok) return null;
  return parseAssistantAiOutput(result.text, destinations);
}

function deterministicRationale(
  destination: DistributionDestination,
  context: PostingAssistantContext
): string {
  const base =
    destination === "x"
      ? "Single post text with hashtags appended for discoverability."
      : destination === "deviantart"
        ? "Title, description, and tags formatted for DeviantArt submit."
        : "Copy aligned to platform norms.";
  return context.locale ? `${base} Locale hint: ${context.locale}.` : base;
}

/**
 * Premium Relay Coach: suggested post time from posting history, LLM rationale,
 * and optional per-destination copy rewrite when goals are set.
 * Falls back to deterministic advice (original copy kept) when AI is skipped/fails.
 * When `accepted_copy_by_destination` is set, locks that copy and skips the rewrite LLM.
 */
export async function applyPostingAssistantToVariants(
  prisma: PrismaClient,
  creatorId: string,
  variants: FormattedPlatformVariant[],
  context: PostingAssistantContext,
  enabledDestinations: Set<DistributionDestination>
): Promise<{ assistantMode: string; assistantPlan: Record<string, unknown>; variants: FormattedPlatformVariant[] }> {
  if (!(await isPostingAssistantAllowedForCreator(prisma, creatorId))) {
    return {
      assistantMode: "skipped",
      assistantPlan: { reason: "tier_not_allowed" },
      variants
    };
  }

  const goals = context.goals ?? [];
  const facts = await loadPostingAssistantFacts(prisma, creatorId, context.timezone ?? "UTC");
  const suggestedHour = facts.historical_hour_of_day ?? DEFAULT_SUGGESTED_HOUR;
  const suggestedTimeIso = nextLocalHourAsIso(suggestedHour, facts.timezone);
  const accepted = context.accepted_copy_by_destination ?? {};
  const acceptedKeys = Object.keys(accepted).filter((d) =>
    enabledDestinations.has(d as DistributionDestination)
  );

  if (acceptedKeys.length > 0) {
    const enhanced = variants.map((variant) => {
      if (!enabledDestinations.has(variant.destination)) {
        return variant;
      }
      const lock = accepted[variant.destination];
      if (!lock?.body_text?.trim()) {
        return applyCoachRewriteToVariant(variant, undefined, {
          rationale: deterministicRationale(variant.destination, context),
          suggestedTimeIso,
          timingNote: null
        });
      }
      const formulaNote = lock.formula_id ? `Formula: ${lock.formula_id}.` : "";
      return applyCoachRewriteToVariant(
        variant,
        {
          title: lock.title ?? null,
          body_text: lock.body_text.trim()
        },
        {
          rationale: `Creator-accepted Coach plan. ${formulaNote}`.trim(),
          suggestedTimeIso,
          timingNote: null
        }
      );
    });

    return {
      assistantMode: "completed_accepted",
      assistantPlan: {
        goals,
        strategy_summary: `Creator-accepted Coach copy for ${acceptedKeys.length} platform(s). Timing from posting history (sample=${facts.sample_size}).`,
        facts,
        user_notes: context.user_notes ?? null,
        locale: context.locale ?? null,
        trend_note: context.trend_note ?? null,
        accepted_copy_by_destination: accepted,
        suggested_post_time: suggestedTimeIso,
        ai_used: false,
        rewrite_requested: false,
        rewrite_applied: true,
        accepted_lock: true
      },
      variants: enhanced
    };
  }

  const wantRewrite = goalsRequestRewrite(goals);
  const targetDestinations = variants
    .map((v) => v.destination)
    .filter((d) => enabledDestinations.has(d));

  const aiOutput = await generateAssistantOutput({
    destinations: targetDestinations,
    goals,
    facts,
    context,
    suggestedTimeIso,
    variants,
    wantRewrite,
    creatorId
  });

  const rewroteAny =
    wantRewrite &&
    aiOutput?.variants != null &&
    Object.keys(aiOutput.variants).length > 0;

  const assistantPlan: Record<string, unknown> = {
    goals,
    strategy_summary: goals.length > 0
      ? `Goals: ${goals.join(", ")}. Recommended time based on your own posting history (sample=${facts.sample_size}).`
      : `Recommended time based on your own posting history (sample=${facts.sample_size}).`,
    facts,
    user_notes: context.user_notes ?? null,
    locale: context.locale ?? null,
    trend_note: context.trend_note ?? null,
    suggested_post_time: suggestedTimeIso,
    ai_used: aiOutput !== null,
    rewrite_requested: wantRewrite,
    rewrite_applied: Boolean(rewroteAny)
  };

  const enhanced = variants.map((variant) => {
    if (!enabledDestinations.has(variant.destination)) {
      return variant;
    }
    const rationale =
      aiOutput?.rationale?.[variant.destination] ??
      deterministicRationale(variant.destination, context);
    const rewrite =
      wantRewrite && aiOutput?.variants
        ? aiOutput.variants[variant.destination]
        : undefined;
    return applyCoachRewriteToVariant(variant, rewrite, {
      rationale,
      suggestedTimeIso,
      timingNote: aiOutput?.timing_note ?? null
    });
  });

  return {
    assistantMode: aiOutput ? "completed_ai" : "completed_deterministic",
    assistantPlan,
    variants: enhanced
  };
}
