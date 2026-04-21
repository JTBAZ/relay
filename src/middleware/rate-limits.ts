import { randomUUID } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import rateLimit from "express-rate-limit";
import { errorEnvelope } from "../contracts/api.js";

/*
 * In-memory limiter — counters are per-process. For multi-node deploys, swap
 * the store for `rate-limit-redis` and wire REDIS_URL. See AGENTS.md.
 */

function traceIdFromRateLimit(req: Request): string {
  const headerValue = req.header("x-trace-id");
  return headerValue ?? `trace_${randomUUID()}`;
}

type RequestWithRelayKey = Request & { relayRateLimitKey?: string };

function relayRateLimitJsonHandler(req: Request, res: Response): void {
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
