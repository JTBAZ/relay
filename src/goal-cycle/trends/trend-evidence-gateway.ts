/**
 * Trend evidence gateway (VS3-T01–T03).
 * Fixture-mode composition, provenance, and optional run persistence/cache.
 */

import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { getGoalCycleFeatureFlags } from "../contracts.js";
import {
  sanitizePromptSafeSummary,
  sanitizeTrendResearchRequest,
  trendUsageSafeMeta
} from "./evidence-sanitizer.js";
import { resolveTrendProviders } from "./provider-registry.js";
import type {
  CreatorHistoryEvidence,
  EvidenceProvenance,
  InterestSeriesProvider,
  InterestSeriesResult,
  TrendConfidence,
  TrendEvidence,
  TrendEvidenceGateway,
  TrendEvidenceStrength,
  TrendProgressCode,
  TrendResearchRequest,
  WebDiscoveryProvider,
  WebDiscoveryResult
} from "./provider-types.js";
import { TREND_PROVIDER_CONTRACT_VERSION, validateTrendResearchRequest } from "./provider-types.js";
import {
  buildTrendCacheKey,
  buildTrendQueryHash,
  cachePartsFromRequest,
  completeTrendRun,
  createPendingTrendRun,
  evidenceFromStoredJson,
  failTrendRun,
  findFreshTrendCacheHit,
  findTrendRunByRequestId,
  isTrendCacheFresh,
  materializeCompleteTrendRunForRequest,
  resolveTrendCacheTtlSeconds,
  stripRawFromEvidence
} from "./trend-evidence-store.js";

export { TREND_PROVIDER_CONTRACT_VERSION };

export type TrendProgressHandler = (
  code: TrendProgressCode,
  meta?: Record<string, string | number | boolean>
) => void | Promise<void>;

export type TrendEvidenceGatewayDeps = {
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  createRunId?: () => string;
  /** When set, runs are persisted and cache/idempotency apply (VS3-T03). */
  prisma?: PrismaClient;
  cacheTtlSeconds?: number;
  /** Provider call timeout (VS3-T04/T06). */
  timeoutMs?: number;
  /** Fixed progress codes for the Goal Cycle stream (VS3-T04). */
  onProgress?: TrendProgressHandler;
  /** Test/override hooks — prefer registry in production. */
  interestProvider?: InterestSeriesProvider | null;
  webProvider?: WebDiscoveryProvider | null;
};

const DEFAULT_PROVIDER_TIMEOUT_MS = 15_000;

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`trend_provider_timeout:${label}`)), ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function resolveProviderTimeoutMs(env: NodeJS.ProcessEnv, override?: number): number {
  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    return Math.floor(override);
  }
  const raw = env.RELAY_GOAL_CYCLE_TREND_PROVIDER_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_PROVIDER_TIMEOUT_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_PROVIDER_TIMEOUT_MS;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function historyFromContext(
  context: Record<string, unknown>,
  collectedAt: string
): CreatorHistoryEvidence {
  const windowMonths =
    typeof context.window_months === "number" && context.window_months > 0
      ? Math.min(24, Math.floor(context.window_months))
      : 6;
  const posts = Array.isArray(context.posts) ? context.posts : [];
  const topSignals = Array.isArray(context.top_signals)
    ? context.top_signals.map(String).slice(0, 8)
    : posts
        .slice(0, 3)
        .map((p) => (isRecord(p) && typeof p.title === "string" ? p.title : null))
        .filter((t): t is string => Boolean(t));

  const prompt =
    typeof context.prompt_safe_summary === "string" && context.prompt_safe_summary.trim()
      ? sanitizePromptSafeSummary(context.prompt_safe_summary)
      : sanitizePromptSafeSummary(
          topSignals.length > 0
            ? `Creator history over ${windowMonths} months includes: ${topSignals.join("; ")}.`
            : `Creator history over ${windowMonths} months is available for planning.`
        );

  return {
    window_months: windowMonths,
    post_count: typeof context.post_count === "number" ? Math.max(0, Math.floor(context.post_count)) : posts.length,
    top_signals: topSignals,
    prompt_safe_summary: prompt,
    freshness_seconds:
      typeof context.freshness_seconds === "number" ? Math.max(0, Math.floor(context.freshness_seconds)) : null,
    confidence: "medium"
  };
}

function emptyHistory(collectedAt: string): CreatorHistoryEvidence {
  return historyFromContext({}, collectedAt);
}

function composeStrength(input: {
  mode: string;
  interest: InterestSeriesResult | null;
  web: WebDiscoveryResult | null;
  quarantined: boolean;
}): TrendEvidenceStrength {
  if (input.mode === "history_only" || input.mode === "disabled") {
    return "history_only";
  }
  if (!input.interest && !input.web) {
    return "history_only";
  }
  if (input.quarantined) {
    return "weak";
  }
  const interestStrength = input.interest?.evidence_strength ?? "unavailable";
  const webCount = input.web?.items.length ?? 0;

  if (interestStrength === "strong" && webCount > 0) {
    return "strong";
  }
  if (interestStrength === "strong" && webCount === 0) {
    return "strong";
  }
  if (interestStrength === "weak" || (webCount > 0 && webCount <= 1 && interestStrength !== "strong")) {
    return "weak";
  }
  if (interestStrength === "unavailable" && webCount === 0) {
    return "history_only";
  }
  if (interestStrength === "unavailable" && webCount > 0) {
    return "weak";
  }
  return "weak";
}

function composeConfidence(
  strength: TrendEvidenceStrength,
  interest: InterestSeriesResult | null,
  web: WebDiscoveryResult | null
): TrendConfidence {
  if (strength === "history_only") return interest?.confidence ?? "medium";
  if (strength === "strong") return "high";
  if (interest?.confidence === "low" || web?.confidence === "low") return "low";
  if (interest?.confidence === "unknown" && (!web || web.items.length === 0)) return "unknown";
  return "low";
}

function composeSummary(input: {
  strength: TrendEvidenceStrength;
  quarantined: boolean;
  interest: InterestSeriesResult | null;
  web: WebDiscoveryResult | null;
  history: CreatorHistoryEvidence;
}): string {
  if (input.quarantined) {
    return "Provider text contained instruction-shaped fragments and was quarantined.";
  }
  if (input.strength === "history_only") {
    if (input.interest?.evidence_strength === "unavailable") {
      return "No approved interest series returned for this query.";
    }
    return sanitizePromptSafeSummary(
      `External trend sources were not used; ${input.history.prompt_safe_summary}`
    );
  }
  if (input.strength === "strong") {
    const fromInterest =
      input.interest?.disclaimers.find((d) => /elevated/i.test(d)) ??
      input.interest?.disclaimers.find(
        (d) => /interest/i.test(d) && !/^Fixture interest series/i.test(d)
      );
    return sanitizePromptSafeSummary(
      fromInterest ??
        "Interest signals and fresh public references support planning from current evidence."
    );
  }
  const fromInterest = input.interest?.disclaimers.find(
    (d) => /limited|niche|history/i.test(d) && !/^Fixture interest series/i.test(d)
  );
  return sanitizePromptSafeSummary(
    fromInterest ??
      "External evidence is limited for this niche topic; continue from creator history."
  );
}

function buildProvenance(input: {
  interest: InterestSeriesResult | null;
  web: WebDiscoveryResult | null;
  history: CreatorHistoryEvidence;
  collectedAt: string;
  mode: string;
}): EvidenceProvenance[] {
  const rows: EvidenceProvenance[] = [
    {
      source_tier: "creator_history",
      source_id: "creator_history",
      method: "creator_context",
      collected_at: input.collectedAt,
      approval_state: "fixture",
      freshness_seconds: input.history.freshness_seconds
    }
  ];
  if (input.interest) {
    rows.push({
      source_tier: input.mode === "fixture" ? "fixture" : "interest_series",
      source_id: input.interest.provider_id,
      method: input.interest.method,
      collected_at: input.interest.collected_at,
      approval_state: input.mode === "fixture" ? "fixture" : "unapproved",
      freshness_seconds: input.interest.freshness_seconds
    });
  }
  if (input.web) {
    rows.push({
      source_tier: input.mode === "fixture" ? "fixture" : "web_discovery",
      source_id: input.web.provider_id,
      method: input.web.method,
      collected_at: input.web.collected_at,
      approval_state: input.mode === "fixture" ? "fixture" : "unapproved",
      freshness_seconds: input.web.freshness_seconds
    });
  }
  return rows;
}

/**
 * Assert prompt_safe_summary and usage meta never carry raw provider excerpts.
 * Used by tests and as a runtime guard before returning evidence.
 */
export function assertEvidencePromptSafe(evidence: TrendEvidence): void {
  const blob = JSON.stringify({
    summary: evidence.prompt_safe_summary,
    human: evidence.human_context,
    history: evidence.creator_history.prompt_safe_summary
  });
  if (/ignore previous instructions|grant unlimited|<\/?\s*system/i.test(blob)) {
    throw new Error("prompt_safe_fields_contain_raw_provider_text");
  }
  const raws = [
    evidence.interest_series?.raw_provider_excerpt,
    evidence.web_discovery?.raw_provider_excerpt
  ].filter(Boolean);
  for (const raw of raws) {
    if (raw && evidence.prompt_safe_summary.includes(raw)) {
      throw new Error("raw_excerpt_leaked_into_prompt_safe_summary");
    }
  }
}

function disabledEvidence(
  request: TrendResearchRequest,
  runId: string,
  collectedAt: string
): TrendEvidence {
  const history = emptyHistory(collectedAt);
  return {
    run_id: runId,
    creator_id: request.creator_id,
    human_context: {
      topic: request.topic,
      locale: request.locale,
      trend_note: "Trend research is disabled."
    },
    interest_series: null,
    web_discovery: null,
    creator_history: history,
    composite_strength: "history_only",
    confidence: "unknown",
    prompt_safe_summary: "Trend research is disabled; no external or history research was performed.",
    provenance: []
  };
}

export function createTrendEvidenceGateway(
  deps: TrendEvidenceGatewayDeps = {}
): TrendEvidenceGateway {
  const env = deps.env ?? process.env;
  const now = deps.now ?? (() => new Date());
  const createRunId = deps.createRunId ?? (() => `trend_run_${randomUUID()}`);
  const prisma = deps.prisma;
  const onProgress = deps.onProgress;
  const timeoutMs = resolveProviderTimeoutMs(env, deps.timeoutMs);
  const cacheTtlSeconds =
    deps.cacheTtlSeconds ??
    (() => {
      const raw = env.RELAY_GOAL_CYCLE_TREND_CACHE_TTL_SECONDS?.trim();
      if (!raw) return undefined;
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
    })();

  const emit = async (
    code: TrendProgressCode,
    meta?: Record<string, string | number | boolean>
  ) => {
    if (onProgress) await onProgress(code, meta);
  };

  return {
    async research(rawRequest: TrendResearchRequest): Promise<TrendEvidence> {
      const validated = validateTrendResearchRequest(rawRequest);
      if (!validated.ok) {
        throw new Error(`invalid_trend_research_request:${validated.details.map((d) => d.field).join(",")}`);
      }
      const { request, sanitize } = sanitizeTrendResearchRequest(validated.value);
      const flags = getGoalCycleFeatureFlags(env);
      const resolvedBase = resolveTrendProviders(env);
      const resolved = {
        ...resolvedBase,
        interest:
          deps.interestProvider !== undefined ? deps.interestProvider : resolvedBase.interest,
        web: deps.webProvider !== undefined ? deps.webProvider : resolvedBase.web
      };
      const at = now();
      const collectedAt = at.toISOString();

      const providerMeta = {
        interest_provider_id: resolved.interest?.provider_id ?? null,
        interest_provider_version: resolved.interest?.provider_version ?? null,
        web_provider_id: resolved.web?.provider_id ?? null,
        web_provider_version: resolved.web?.provider_version ?? null
      };
      const cacheParts = cachePartsFromRequest(request, flags.trend_mode, providerMeta);
      const queryHash = buildTrendQueryHash(cacheParts);
      const cacheKey = buildTrendCacheKey(cacheParts);
      const providerIds = [providerMeta.interest_provider_id, providerMeta.web_provider_id].filter(
        (id): id is string => Boolean(id)
      );
      const providerVersions: Record<string, string> = {};
      if (providerMeta.interest_provider_id && providerMeta.interest_provider_version) {
        providerVersions[providerMeta.interest_provider_id] = providerMeta.interest_provider_version;
      }
      if (providerMeta.web_provider_id && providerMeta.web_provider_version) {
        providerVersions[providerMeta.web_provider_id] = providerMeta.web_provider_version;
      }

      if (prisma) {
        const byRequest = await findTrendRunByRequestId(prisma, request.creator_id, request.request_id);
        if (byRequest?.status === "complete") {
          const cached = evidenceFromStoredJson(byRequest.evidenceJson);
          if (cached) {
            assertEvidencePromptSafe(cached);
            return cached;
          }
        }
        if (flags.trend_mode !== "disabled") {
          const hit = await findFreshTrendCacheHit(prisma, request.creator_id, cacheKey, at);
          if (hit && isTrendCacheFresh(hit, at)) {
            const cached = evidenceFromStoredJson(hit.evidenceJson);
            if (cached) {
              assertEvidencePromptSafe(cached);
              // Cache hits must still leave a complete row for THIS request_id —
              // clients poll by request_id and treat "not_started" as incomplete.
              if (hit.requestId !== request.request_id) {
                try {
                  await materializeCompleteTrendRunForRequest(prisma, {
                    id: createRunId(),
                    creatorId: request.creator_id,
                    cycleId: request.cycle_id ?? null,
                    requestId: request.request_id,
                    queryHash,
                    cacheKey,
                    mode: flags.trend_mode,
                    providerIds,
                    providerVersions,
                    evidence: cached,
                    expiresAt: hit.expiresAt ?? new Date(at.getTime() + 3600_000),
                    startedAt: at,
                    completedAt: at
                  });
                } catch {
                  /* concurrent materialize — status lookup may still succeed */
                }
              }
              void trendUsageSafeMeta({
                provider_id: providerIds[0] ?? "history_only",
                cache_hit: true,
                strength: cached.composite_strength
              });
              return cached;
            }
          }
        }
      }

      const runId = createRunId();

      if (flags.trend_mode === "disabled") {
        const evidence = disabledEvidence(request, runId, collectedAt);
        assertEvidencePromptSafe(evidence);
        if (prisma) {
          try {
            await createPendingTrendRun(prisma, {
              id: runId,
              creatorId: request.creator_id,
              cycleId: request.cycle_id ?? null,
              requestId: request.request_id,
              queryHash,
              cacheKey,
              mode: flags.trend_mode,
              providerIds: [],
              providerVersions: {},
              startedAt: at
            });
            const ttl = resolveTrendCacheTtlSeconds({ evidence, defaultTtlSeconds: cacheTtlSeconds });
            await completeTrendRun(prisma, runId, {
              evidence,
              expiresAt: new Date(at.getTime() + ttl * 1000),
              completedAt: at
            });
          } catch (err) {
            const existing = await findTrendRunByRequestId(prisma, request.creator_id, request.request_id);
            const recovered = existing ? evidenceFromStoredJson(existing.evidenceJson) : null;
            if (recovered) return recovered;
            throw err;
          }
        }
        return evidence;
      }

      let pendingCreated = false;
      if (prisma) {
        try {
          await createPendingTrendRun(prisma, {
            id: runId,
            creatorId: request.creator_id,
            cycleId: request.cycle_id ?? null,
            requestId: request.request_id,
            queryHash,
            cacheKey,
            mode: flags.trend_mode,
            providerIds,
            providerVersions,
            startedAt: at
          });
          pendingCreated = true;
        } catch (err) {
          const existing = await findTrendRunByRequestId(prisma, request.creator_id, request.request_id);
          if (existing?.status === "complete") {
            const recovered = evidenceFromStoredJson(existing.evidenceJson);
            if (recovered) return recovered;
          }
          throw err;
        }
      }

      try {
        await emit("history_loaded");
        const history = historyFromContext(request.creator_context, collectedAt);
        let interest: InterestSeriesResult | null = null;
        let web: WebDiscoveryResult | null = null;

        if (flags.trend_mode === "fixture" || flags.trend_mode === "live") {
          if (resolved.interest) {
            await emit("interest_started", { provider_id: resolved.interest.provider_id });
            interest = await withTimeout(
              resolved.interest.search(request),
              timeoutMs,
              "interest"
            );
            await emit("interest_complete", {
              provider_id: resolved.interest.provider_id,
              strength: interest.evidence_strength
            });
          }
          if (resolved.web) {
            await emit("web_started", { provider_id: resolved.web.provider_id });
            web = await withTimeout(resolved.web.search(request), timeoutMs, "web");
            await emit("web_complete", { provider_id: resolved.web.provider_id });
          }
        }

        const strength = composeStrength({
          mode: flags.trend_mode,
          interest,
          web,
          quarantined: sanitize.quarantined
        });
        const confidence = composeConfidence(strength, interest, web);
        const prompt_safe_summary = composeSummary({
          strength,
          quarantined: sanitize.quarantined,
          interest,
          web,
          history
        });

        const evidence: TrendEvidence = {
          run_id: runId,
          creator_id: request.creator_id,
          human_context: {
            topic: request.topic,
            locale: request.locale,
            trend_note:
              strength === "weak" || strength === "history_only"
                ? "External evidence is limited; planning continues from your history."
                : null
          },
          interest_series: interest,
          web_discovery: web,
          creator_history: history,
          composite_strength: strength,
          confidence,
          prompt_safe_summary,
          provenance: buildProvenance({
            interest,
            web,
            history,
            collectedAt,
            mode: flags.trend_mode
          })
        };

        assertEvidencePromptSafe(evidence);

        void trendUsageSafeMeta({
          provider_id: interest?.provider_id ?? web?.provider_id ?? "history_only",
          cache_hit: false,
          strength,
          quarantined: sanitize.quarantined
        });

        if (prisma && pendingCreated) {
          const ttl = resolveTrendCacheTtlSeconds({ evidence, defaultTtlSeconds: cacheTtlSeconds });
          await completeTrendRun(prisma, runId, {
            evidence: stripRawFromEvidence(evidence),
            expiresAt: new Date(at.getTime() + ttl * 1000),
            completedAt: now()
          });
        }

        return evidence;
      } catch (err) {
        if (prisma && pendingCreated) {
          await failTrendRun(prisma, runId, err instanceof Error ? err.message : "research_failed", now());
        }
        throw err;
      }
    }
  };
}
