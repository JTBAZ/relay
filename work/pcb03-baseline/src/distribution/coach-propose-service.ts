/**
 * @fileoverview Relay Coach propose — gather findings + formula-backed copy variants.
 * Persistence of mid-review state is handled by coach-checkpoint-service (coach_review stub).
 * One `generateText` call (or deterministic fallback).
 */

import type { PrismaClient } from "@prisma/client";
import { generateText } from "../ai/ai-service.js";
import { isPostingAssistantAllowedForCreator } from "../creator/creator-feature-flags-service.js";
import {
  defaultRecommendedFormulaId,
  formatFormulaeForPrompt,
  isAttackFormulaId,
  pickFormulaCandidates,
  tryGetAttackFormula,
  type AttackFormula,
  type AttackFormulaId,
  type CoachPathId
} from "./coach-attack-formulae.js";
import {
  buildCoachFactPack,
  cadenceToPostingAssistantFacts,
  type CoachFactPack
} from "./coach-fact-pack.js";
import { normalizeDistributionDestinations, type DistributionDestination } from "./platform-destinations.js";
import { formatVariantsForDestinations, type CanonicalPostCopy } from "./platform-formatters.js";
import { loadCanonicalCopy, PostDistributionNotFoundError, PostDistributionValidationError } from "./post-distribution-service.js";
import {
  type AssistantGoal,
  type PostingAssistantContext,
  type PostingAssistantFacts
} from "./posting-assistant-service.js";

export type CoachFindingSource =
  | "history"
  | "post"
  | "goals"
  | "moment"
  | "locale"
  | "performance"
  | "coverage";

export type CoachFindingChip = {
  id: string;
  label: string;
  source: CoachFindingSource;
};

export type CoachCopyVariant = {
  id: string;
  formula_id: AttackFormulaId;
  recommended: boolean;
  label: string;
  fit_reason: string;
  title: string | null;
  body_text: string;
};

export type CoachProposeResult = {
  path_id: CoachPathId;
  findings: { chips: CoachFindingChip[] };
  by_destination: Partial<
    Record<DistributionDestination, { variants: CoachCopyVariant[] }>
  >;
  ai_used: boolean;
  facts: PostingAssistantFacts;
  fact_pack: CoachFactPack;
};

const PATH_GOAL_SETS: { id: CoachPathId; goals: AssistantGoal[] }[] = [
  { id: "engage", goals: ["engagement_optimization", "format_optimization"] },
  { id: "reach", goals: ["new_audience_testing", "engagement_optimization"] },
  { id: "localize", goals: ["language_outreach"] },
  { id: "trend", goals: ["trend_riding", "engagement_optimization"] }
];

/** Resolve Coach path from structured goals (exact set, then soft fallback). */
export function resolveCoachPathId(goals: AssistantGoal[]): CoachPathId | null {
  if (goals.length === 0) return null;
  const key = [...goals].sort().join(",");
  for (const path of PATH_GOAL_SETS) {
    if ([...path.goals].sort().join(",") === key) return path.id;
  }
  if (goals.includes("language_outreach")) return "localize";
  if (goals.includes("trend_riding")) return "trend";
  if (goals.includes("new_audience_testing")) return "reach";
  if (goals.includes("engagement_optimization") || goals.includes("format_optimization")) {
    return "engage";
  }
  return null;
}

function variantSourceBody(canonical: CanonicalPostCopy, destination: DistributionDestination): {
  title: string | null;
  body_text: string;
} {
  const formatted = formatVariantsForDestinations([destination], canonical)[0];
  if (!formatted) {
    return { title: canonical.title || null, body_text: canonical.bodyText };
  }
  const textOnly = destination === "x" || destination === "bluesky";
  const body = (formatted.postText ?? formatted.bodyText ?? "").trim() || canonical.bodyText;
  return {
    title: textOnly ? null : formatted.title ?? canonical.title ?? null,
    body_text: body
  };
}

function formatHourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const suffix = h >= 12 ? "pm" : "am";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}${suffix}`;
}

function formatCompactCount(value: number): string {
  const n = Math.round(value);
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

function formatDestLabel(dest: string): string {
  if (dest === "patreon") return "Patreon";
  if (dest === "x") return "X";
  if (dest === "deviantart") return "DeviantArt";
  if (dest === "bluesky") return "Bluesky";
  if (dest === "relay") return "Relay";
  return dest;
}

/** Build findings chips from the deterministic fact pack (+ post/context notes). */
export function buildCoachFindings(args: {
  canonical: CanonicalPostCopy;
  context: PostingAssistantContext;
  factPack: CoachFactPack;
}): CoachFindingChip[] {
  const chips: CoachFindingChip[] = [];
  const { factPack: pack, canonical, context } = args;

  const title = canonical.title.trim();
  if (title) {
    chips.push({ id: "post_title", label: `Post: ${title.slice(0, 80)}`, source: "post" });
  }
  for (const tag of canonical.tagLabels.slice(0, 3)) {
    const label = tag.trim();
    if (!label) continue;
    chips.push({
      id: `tag_${label.toLowerCase().replace(/\s+/g, "_").slice(0, 40)}`,
      label: `Tag: ${label}`,
      source: "post"
    });
  }

  const { coverage } = pack;
  if (coverage.without_metrics.length > 0) {
    const withLabel =
      coverage.with_metrics.length > 0
        ? coverage.with_metrics.map(formatDestLabel).join(", ")
        : "none yet";
    const withoutLabel = coverage.without_metrics.map(formatDestLabel).join(", ");
    chips.push({
      id: "coverage_gap",
      label: `Metrics on ${withLabel} — no data yet for ${withoutLabel}`,
      source: "coverage"
    });
  } else if (coverage.with_metrics.length > 0) {
    chips.push({
      id: "coverage_ok",
      label: `Metrics available: ${coverage.with_metrics.map(formatDestLabel).join(", ")}`,
      source: "coverage"
    });
  }
  if (coverage.stale) {
    chips.push({
      id: "coverage_stale",
      label: "Performance rollups look stale — treat numbers cautiously",
      source: "coverage"
    });
  }

  if (pack.this_post) {
    const top = pack.this_post.by_destination[0];
    const destBit = top ? ` · top on ${formatDestLabel(top.dest)}` : "";
    chips.push({
      id: "perf_this_post",
      label: `This post: ${formatCompactCount(pack.this_post.reach)} reach${destBit}`,
      source: "performance"
    });
  }

  const mixTop = pack.destination_mix[0];
  if (mixTop && mixTop.reach_share > 0) {
    chips.push({
      id: "perf_dest_mix",
      label: `30d reach mix: ${Math.round(mixTop.reach_share * 100)}% ${formatDestLabel(mixTop.dest)}`,
      source: "performance"
    });
  }

  for (const tag of pack.tags.slice(0, 2)) {
    const vs =
      tag.vs_median === "above"
        ? "above median"
        : tag.vs_median === "below"
          ? "below median"
          : "in history";
    chips.push({
      id: `perf_tag_${tag.tag.toLowerCase().replace(/\s+/g, "_").slice(0, 40)}`,
      label: `Tag “${tag.tag}”: ${formatCompactCount(tag.reach)} reach (${vs})`,
      source: "performance"
    });
  }

  if (pack.contrast) {
    chips.push({
      id: "perf_contrast",
      label: `Top work in window: ${pack.contrast.label.slice(0, 48)} (${formatCompactCount(pack.contrast.reach)} reach)`,
      source: "performance"
    });
  }

  if (pack.structure?.gaps.length) {
    chips.push({
      id: "perf_gaps",
      label: `Not yet on ${pack.structure.gaps.map(formatDestLabel).join(", ")}`,
      source: "performance"
    });
  }

  if (
    pack.cadence.timing_confidence === "high" &&
    pack.cadence.historical_hour_of_day != null &&
    pack.cadence.sample_size >= 5
  ) {
    chips.push({
      id: "history_hour",
      label: `Usual send hour ~${formatHourLabel(pack.cadence.historical_hour_of_day)} (n=${pack.cadence.sample_size})`,
      source: "history"
    });
  }

  const target = pack.cadence.monthly_post_target;
  const posted = pack.cadence.posts_this_month;
  if (target > 0) {
    chips.push({
      id: "monthly_goal",
      label: `Monthly Relay posts ${posted}/${target}`,
      source: "goals"
    });
  }

  for (const [i, goal] of pack.goals.slice(0, 3).entries()) {
    const pct = Math.round(Math.min(1, Math.max(0, goal.progress_ratio)) * 100);
    chips.push({
      id: `studio_goal_${i}`,
      label: `Studio: ${goal.label} · ${pct}% (${goal.pace_status})`,
      source: "goals"
    });
  }

  const moment = context.trend_note?.trim();
  if (moment) {
    chips.push({
      id: "moment",
      label: `Moment: ${moment.slice(0, 100)}`,
      source: "moment"
    });
  }

  const locale = context.locale?.trim();
  if (locale) {
    chips.push({
      id: "locale",
      label: `Locale: ${locale}`,
      source: "locale"
    });
  }

  return chips;
}

function groundedFitReason(
  formula: AttackFormula,
  findings: CoachFindingChip[],
  recommended: boolean
): string {
  const performance = findings.find((c) => c.source === "performance");
  const coverage = findings.find((c) => c.source === "coverage");
  const history = findings.find((c) => c.source === "history");
  const moment = findings.find((c) => c.source === "moment");
  const parts = [`Uses ${formula.label}`];
  if (moment) parts.push(moment.label);
  else if (performance) parts.push(performance.label);
  else if (coverage) parts.push(coverage.label);
  else if (history) parts.push(history.label);
  if (recommended) parts.push("Recommended for this path");
  return parts.join(" · ");
}

function deterministicBodyForFormula(
  formula: AttackFormula,
  sourceBody: string,
  context: PostingAssistantContext
): string {
  const base = sourceBody.trim() || "New work.";
  const moment = context.trend_note?.trim();
  switch (formula.id) {
    case "question_hook":
      return `What stands out in this piece?\n\n${base}`;
    case "cold_scroll_explain":
      return `${base}\n\nNew work — open the full piece to see more.`;
    case "moment_frame":
      return moment ? `${moment} — ${base}` : base;
    case "moment_soft_nod":
      return moment ? `${base}\n\n(${moment})` : base;
    case "locale_bridge":
    case "locale_casual":
      return context.locale?.trim()
        ? `[${context.locale.trim()}] ${base}`
        : base;
    case "format_first_line": {
      const first = base.split(/\n/)[0]?.trim() || base;
      return `${first.slice(0, 120)}\n\n${base}`;
    }
    default:
      return base;
  }
}

export function buildDeterministicProposeVariants(args: {
  pathId: CoachPathId;
  destination: DistributionDestination;
  canonical: CanonicalPostCopy;
  context: PostingAssistantContext;
  findings: CoachFindingChip[];
  formulae?: AttackFormula[];
}): CoachCopyVariant[] {
  const formulae = args.formulae ?? pickFormulaCandidates(args.pathId);
  const source = variantSourceBody(args.canonical, args.destination);
  const recommendedId = defaultRecommendedFormulaId(args.pathId);

  return formulae.map((formula, index) => {
    const recommended = formula.id === recommendedId || (recommendedId == null && index === 0);
    return {
      id: `${args.destination}__${formula.id}`,
      formula_id: formula.id,
      recommended,
      label: formula.label,
      fit_reason: groundedFitReason(formula, args.findings, recommended),
      title: source.title,
      body_text: deterministicBodyForFormula(formula, source.body_text, args.context)
    };
  });
}

function ensureOneRecommended(variants: CoachCopyVariant[]): CoachCopyVariant[] {
  if (variants.length === 0) return variants;
  const recommendedCount = variants.filter((v) => v.recommended).length;
  if (recommendedCount === 1) return variants;
  const preferred =
    variants.find((v) => v.recommended)?.id ??
    variants[0]!.id;
  return variants.map((v) => ({ ...v, recommended: v.id === preferred }));
}

type RawProposeVariant = {
  formula_id?: unknown;
  recommended?: unknown;
  label?: unknown;
  fit_reason?: unknown;
  title?: unknown;
  body_text?: unknown;
};

/** Parse + validate propose JSON; returns null if unusable. */
export function parseCoachProposeAiOutput(
  text: string,
  args: {
    pathId: CoachPathId;
    destinations: DistributionDestination[];
    canonical: CanonicalPostCopy;
    context: PostingAssistantContext;
    findings: CoachFindingChip[];
  }
): CoachProposeResult["by_destination"] | null {
  try {
    const parsed = JSON.parse(text) as { by_destination?: unknown };
    if (!parsed.by_destination || typeof parsed.by_destination !== "object") return null;

    const candidates = pickFormulaCandidates(args.pathId);
    const candidateIds = new Set(candidates.map((c) => c.id));
    const byDest: CoachProposeResult["by_destination"] = {};
    let anyOk = false;

    for (const dest of args.destinations) {
      const row = (parsed.by_destination as Record<string, unknown>)[dest];
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const rawVariants = (row as { variants?: unknown }).variants;
      if (!Array.isArray(rawVariants)) continue;

      const source = variantSourceBody(args.canonical, dest);
      const variants: CoachCopyVariant[] = [];
      const seenFormula = new Set<string>();

      for (const raw of rawVariants) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
        const rec = raw as RawProposeVariant;
        if (typeof rec.formula_id !== "string" || !isAttackFormulaId(rec.formula_id)) continue;
        if (!candidateIds.has(rec.formula_id)) continue;
        if (seenFormula.has(rec.formula_id)) continue;
        seenFormula.add(rec.formula_id);

        const formula = tryGetAttackFormula(rec.formula_id);
        if (!formula) continue;

        const body =
          typeof rec.body_text === "string" && rec.body_text.trim()
            ? rec.body_text.trim()
            : deterministicBodyForFormula(formula, source.body_text, args.context);
        const textOnly = dest === "x" || dest === "bluesky";
        let title: string | null = textOnly ? null : source.title;
        if (!textOnly && "title" in rec) {
          title = typeof rec.title === "string" ? rec.title.trim() || null : null;
        }

        const recommended = rec.recommended === true;
        variants.push({
          id: `${dest}__${rec.formula_id}`,
          formula_id: rec.formula_id,
          recommended,
          label:
            typeof rec.label === "string" && rec.label.trim()
              ? rec.label.trim()
              : formula.label,
          fit_reason:
            typeof rec.fit_reason === "string" && rec.fit_reason.trim()
              ? rec.fit_reason.trim().slice(0, 220)
              : groundedFitReason(formula, args.findings, recommended),
          title,
          body_text: body
        });
      }

      if (variants.length === 0) continue;
      byDest[dest] = { variants: ensureOneRecommended(variants.slice(0, 4)) };
      anyOk = true;
    }

    return anyOk ? byDest : null;
  } catch {
    return null;
  }
}

async function generateProposeOutput(args: {
  pathId: CoachPathId;
  destinations: DistributionDestination[];
  goals: AssistantGoal[];
  facts: PostingAssistantFacts;
  factPack: CoachFactPack;
  context: PostingAssistantContext;
  findings: CoachFindingChip[];
  canonical: CanonicalPostCopy;
  creatorId?: string;
}): Promise<CoachProposeResult["by_destination"] | null> {
  const {
    pathId,
    destinations,
    goals,
    facts,
    factPack,
    context,
    findings,
    canonical,
    creatorId
  } = args;
  const currentVariants = destinations.map((destination) => {
    const source = variantSourceBody(canonical, destination);
    return { destination, title: source.title, body_text: source.body_text };
  });

  const result = await generateText({
    tier: "cheap",
    system: [
      "You are Relay Coach proposing copy variants for an independent artist.",
      "Use ONLY findings, fact_pack, facts, and current copy in the user message.",
      "Never invent metrics, ads, follower counts, live trends, or platform stats not present in fact_pack.",
      "If fact_pack.coverage.without_metrics lists a destination, do not claim it underperformed — there is no ingest yet.",
      "Cite only reason_codes and numbers from fact_pack when explaining fit_reason.",
      "Relay has no live external trend feed — moment facts come only from the creator note if present.",
      "Return strict JSON: { \"by_destination\": { \"<destination>\": { \"variants\": [ ... ] } } }.",
      "For each destination, return 2–4 variants. Each variant needs formula_id (from the candidate list only), recommended (boolean), label, fit_reason, title, body_text.",
      "Exactly one variant per destination must have recommended=true (prefer the highest-weight formula when unsure).",
      "fit_reason must reference only provided findings/fact_pack — keep under 220 characters.",
      "title may be null for x and bluesky."
    ].join(" "),
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          path_id: pathId,
          destinations,
          goals,
          user_notes: context.user_notes ?? null,
          trend_note: context.trend_note ?? null,
          locale: context.locale ?? null,
          findings,
          fact_pack: factPack,
          facts: {
            monthly_post_target: facts.monthly_post_target,
            posts_this_month: facts.posts_this_month,
            historical_hour_of_day: facts.historical_hour_of_day,
            sample_size: facts.sample_size,
            timezone: facts.timezone
          },
          formula_candidates: formatFormulaeForPrompt(pathId),
          current_variants: currentVariants
        })
      }
    ],
    maxOutputTokens: 2000,
    temperature: 0.5,
    metadata: {
      feature: "posting_assistant_propose",
      ...(creatorId ? { creatorId } : {})
    }
  });

  if (!result.ok) return null;
  return parseCoachProposeAiOutput(result.text, {
    pathId,
    destinations,
    canonical,
    context,
    findings
  });
}

export type ProposeCoachAttackPlansInput = {
  destinations: string[];
  assistant_by_destination?: Record<string, boolean>;
  assistant_context?: PostingAssistantContext;
};

/**
 * Gather grounded findings + per-destination copy variants (one Recommended each).
 * Does not create or mutate a distribution plan.
 */
export async function proposeCoachAttackPlans(
  prisma: PrismaClient,
  creatorId: string,
  postId: string,
  input: ProposeCoachAttackPlansInput
): Promise<CoachProposeResult> {
  if (!(await isPostingAssistantAllowedForCreator(prisma, creatorId))) {
    throw new PostDistributionValidationError("Relay Coach is not available on your plan.", [
      { field: "assistant_by_destination", issue: "tier_not_allowed" }
    ]);
  }

  const allDestinations = normalizeDistributionDestinations(input.destinations ?? []);
  if (allDestinations.length === 0) {
    throw new PostDistributionValidationError("Select at least one destination.", [
      { field: "destinations", issue: "required" }
    ]);
  }

  const coachDestinations = allDestinations.filter((d) => input.assistant_by_destination?.[d]);
  if (coachDestinations.length === 0) {
    throw new PostDistributionValidationError("Enable Coach on at least one destination.", [
      { field: "assistant_by_destination", issue: "required" }
    ]);
  }

  const context = (input.assistant_context ?? {}) as PostingAssistantContext;
  const goals = (context.goals ?? []).filter(Boolean) as AssistantGoal[];
  const pathId = resolveCoachPathId(goals);
  if (!pathId) {
    throw new PostDistributionValidationError("Select a Coach path before proposing.", [
      { field: "assistant_context.goals", issue: "required" }
    ]);
  }
  if (pathId === "trend" && !context.trend_note?.trim()) {
    throw new PostDistributionValidationError("Name the moment for the trend path.", [
      { field: "assistant_context.trend_note", issue: "required" }
    ]);
  }
  if (pathId === "localize" && !context.locale?.trim()) {
    throw new PostDistributionValidationError("Set a locale for the localize path.", [
      { field: "assistant_context.locale", issue: "required" }
    ]);
  }

  let canonical: CanonicalPostCopy;
  try {
    canonical = await loadCanonicalCopy(prisma, creatorId, postId);
  } catch (err) {
    if (err instanceof PostDistributionNotFoundError) throw err;
    throw err;
  }

  const factPack = await buildCoachFactPack({
    prisma,
    creatorId,
    postId,
    selectedDestinations: coachDestinations,
    postTags: canonical.tagLabels,
    timeZone: context.timezone ?? "UTC"
  });
  const facts = cadenceToPostingAssistantFacts(factPack.cadence);
  const findings = {
    chips: buildCoachFindings({ canonical, context, factPack })
  };

  const aiByDest = await generateProposeOutput({
    pathId,
    destinations: coachDestinations,
    goals,
    facts,
    factPack,
    context,
    findings: findings.chips,
    canonical,
    creatorId
  });

  const by_destination: CoachProposeResult["by_destination"] = {};
  for (const dest of coachDestinations) {
    const fromAi = aiByDest?.[dest]?.variants;
    if (fromAi && fromAi.length > 0) {
      by_destination[dest] = { variants: ensureOneRecommended(fromAi) };
      continue;
    }
    by_destination[dest] = {
      variants: ensureOneRecommended(
        buildDeterministicProposeVariants({
          pathId,
          destination: dest,
          canonical,
          context,
          findings: findings.chips
        })
      )
    };
  }

  return {
    path_id: pathId,
    findings,
    by_destination,
    ai_used: aiByDest != null,
    facts,
    fact_pack: factPack
  };
}
