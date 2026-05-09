/**
 * @fileoverview Express rate-limit presets for consent, cookies, patron/creator mutations.
 * @description In-memory per-process counters; swap store for Redis in multi-node deploys.
 * @see AGENTS.md
 */

import { randomUUID } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import rateLimit from "express-rate-limit";
import { errorEnvelope } from "../contracts/api.js";
import { getRegisteredUsagePrisma, scheduleRateLimit429ForRequest } from "../usage/usage-events.js";

function traceIdFromRateLimit(req: Request): string {
  const headerValue = req.header("x-trace-id");
  return headerValue ?? `trace_${randomUUID()}`;
}

type RequestWithRelayKey = Request & { relayRateLimitKey?: string };

function relayRateLimitJsonHandler(req: Request, res: Response): void {
  scheduleRateLimit429ForRequest(getRegisteredUsagePrisma() ?? null, req);
  const traceId = traceIdFromRateLimit(req);
  res
    .status(429)
    .json(errorEnvelope("RATE_LIMITED", "Too many requests for this endpoint.", traceId));
}

const sharedHeaders = {
  standardHeaders: "draft-6" as const,
  legacyHeaders: false,
  handler: relayRateLimitJsonHandler
};

/** 60 req / 5 min per IP — unauthenticated extension consent exchange. */
export const consentExchange: RequestHandler = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  ...sharedHeaders
});

/**
 * 30 req / 5 min per Account — requires prior middleware to set `relayRateLimitKey`
 * (see `POST /api/v1/auth/extension/consent/start`).
 */
export const consentStart: RequestHandler = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => {
    const key = (req as RequestWithRelayKey).relayRateLimitKey;
    if (!key) {
      throw new Error("consentStart rate limit: relayRateLimitKey must be set by prior middleware");
    }
    return key;
  },
  ...sharedHeaders
});

/**
 * 60 req / hour per Account — Patreon cookie mutations; prior middleware must set `relayRateLimitKey`.
 */
export const cookieWrite: RequestHandler = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => {
    const key = (req as RequestWithRelayKey).relayRateLimitKey;
    if (!key) {
      throw new Error("cookieWrite rate limit: relayRateLimitKey must be set by prior middleware");
    }
    return key;
  },
  ...sharedHeaders
});

/**
 * PE-C — 120 mutations / 15 min per Account — follow/unfollow; prior middleware must set
 * `relayRateLimitKey` (see POST/DELETE `/api/v1/patron/follows`).
 */
export const patronFollowMutate: RequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  keyGenerator: (req) => {
    const key = (req as RequestWithRelayKey).relayRateLimitKey;
    if (!key) {
      throw new Error(
        "patronFollowMutate rate limit: relayRateLimitKey must be set by prior middleware"
      );
    }
    return key;
  },
  ...sharedHeaders
});

function relayKeyOrThrow(name: string) {
  return (req: Request) => {
    const key = (req as RequestWithRelayKey).relayRateLimitKey;
    if (!key) {
      throw new Error(`${name} rate limit: relayRateLimitKey must be set by prior middleware`);
    }
    return key;
  };
}

/**
 * PE-E — 30 comment writes per 5 min per Account. Comments are cheap to type but moderation
 * cost is real, so we throttle comment creates / patches independently from follow / favorite
 * mutation traffic.
 */
export const patronCommentMutate: RequestHandler = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  keyGenerator: relayKeyOrThrow("patronCommentMutate"),
  ...sharedHeaders
});

/**
 * PE-E — 60 reactions per 5 min per Account. Toggling reactions is intentionally noisy in
 * normal use; the cap is high enough not to break power-users while still limiting spam loops.
 */
export const patronReactionMutate: RequestHandler = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  keyGenerator: relayKeyOrThrow("patronReactionMutate"),
  ...sharedHeaders
});

/**
 * PE-E — 10 reports per hour per Account. Tighter cap because each report queues moderator
 * work; abusive reporters should hit this fast.
 */
export const patronReportMutate: RequestHandler = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: relayKeyOrThrow("patronReportMutate"),
  ...sharedHeaders
});

/**
 * PE-E — 30 block / unblock toggles per hour per Account. Blocks are stateful and should not
 * be flicked rapidly; this cap discourages accidental loops while still allowing genuine
 * bulk-cleanup sessions.
 */
export const patronBlockMutate: RequestHandler = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyGenerator: relayKeyOrThrow("patronBlockMutate"),
  ...sharedHeaders
});

/**
 * PE-K (BO-P2-05) — 60 favorites/collections mutations per 5 min per Account. Covers
 * favorite add/remove, collection create/patch/delete, and entry add/remove. Like-button-style
 * traffic; cap allows genuine browsing flurries without enabling spam loops.
 */
export const patronCollectionMutate: RequestHandler = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  keyGenerator: relayKeyOrThrow("patronCollectionMutate"),
  ...sharedHeaders
});

/**
 * PE-K (BO-P2-05) — 12 profile updates per 5 min per Account. Profile edits are rare; this is
 * a low cap to discourage abuse on a high-leverage surface (display name, handle, bio).
 */
export const patronProfileMutate: RequestHandler = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 12,
  keyGenerator: relayKeyOrThrow("patronProfileMutate"),
  ...sharedHeaders
});

/**
 * APD-S1 — 12 creator profile updates per 5 min per Account. Same cadence as patron profile
 * mutations; creator identity edits are equally rare in normal usage.
 */
export const creatorProfileMutate: RequestHandler = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 12,
  keyGenerator: relayKeyOrThrow("creatorProfileMutate"),
  ...sharedHeaders
});
