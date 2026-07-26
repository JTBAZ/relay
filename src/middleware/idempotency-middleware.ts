/**
 * PE-K (BO-P2-05) — Idempotency middleware.
 *
 * @fileoverview Express middleware for safe retries via `Idempotency-Key` + body hash replay.
 *
 * Express middleware that wraps mutating routes so that retries with the same
 * `Idempotency-Key` header replay the original response instead of re-executing the
 * operation. Optional per-route enablement so we can opt in conservatively.
 *
 * Header contract:
 *
 *   - Caller sends `Idempotency-Key: <opaque token>`. We require <= 255 chars and require it to
 *     be ASCII-printable. We do NOT require any specific format (UUID / ULID etc.) so callers
 *     can use whatever their stack produces.
 *   - When absent, the middleware is a no-op (no behavior change). This keeps clients that
 *     don't speak the header working.
 *   - When present, the middleware reserves the key, executes the wrapped handler chain,
 *     captures the final response, and records it under the key. Concurrent retries see
 *     "in_flight" and 409. Subsequent retries see "replay" and get the cached response.
 *
 * Body-fingerprint enforcement:
 *
 *   - The first execution records a SHA-256 of the canonicalized request body.
 *   - On replay, we recompute the hash from the current request body and reject divergent
 *     bodies under the same key with 422 IDEMPOTENCY_KEY_REUSE. This surfaces client bugs
 *     (e.g. resending a different payload after a timeout) instead of silently returning the
 *     wrong cached response.
 *
 * What this middleware does NOT do:
 *
 *   - It does not capture or replay `Set-Cookie` headers. Cookie issuance is auth-scoped and
 *     should never be cached idempotently.
 *   - It does not buffer streaming responses. Patron mutating routes always emit JSON envelopes
 *     synchronously, so this is fine.
 */

import { createHash } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";

import { errorEnvelope } from "../contracts/api.js";
import type { IdempotencyResponseSnapshot, IdempotencyStore } from "./idempotency-store.js";

const HEADER = "idempotency-key";
const MAX_KEY_LEN = 255;
/** Lock TTL: short enough to recover from a crashed handler within a retry window. */
const DEFAULT_LOCK_TTL_MS = 60_000;
/** Snapshot TTL: matches the typical 24h client retry window. */
const DEFAULT_RESPONSE_TTL_MS = 24 * 60 * 60 * 1000;
/** Headers we replay verbatim on cache hit. Anything not on this allow-list is dropped. */
const REPLAY_HEADER_ALLOWLIST = new Set(["content-type", "cache-control", "x-trace-id"]);

function traceIdFromRequest(req: Request): string {
  const v = req.header("x-trace-id");
  return typeof v === "string" && v.length > 0 ? v : "trace_" + Math.random().toString(36).slice(2);
}

function canonicalBody(body: unknown): string {
  if (body === undefined || body === null) return "";
  if (typeof body === "string") return body;
  if (Buffer.isBuffer(body)) return body.toString("utf8");
  // Sort keys at every level so structurally identical objects always hash the same.
  return JSON.stringify(body, sortedReplacer());
}

function sortedReplacer(): (this: unknown, k: string, v: unknown) => unknown {
  return function replacer(_k, v) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        sorted[k] = (v as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return v;
  };
}

function hashBody(body: unknown): string {
  return createHash("sha256").update(canonicalBody(body)).digest("hex");
}

function isHeaderKeyValid(raw: string): boolean {
  if (raw.length === 0 || raw.length > MAX_KEY_LEN) return false;
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i);
    if (code < 0x20 || code > 0x7e) return false;
  }
  return true;
}

/** Namespaces the key in storage so a leak between routes is impossible. */
function storageKey(scope: string, key: string): string {
  return `${scope}\0${key}`;
}

function applyReplayHeaders(res: Response, snapshot: IdempotencyResponseSnapshot): void {
  for (const [name, value] of Object.entries(snapshot.headers)) {
    if (REPLAY_HEADER_ALLOWLIST.has(name.toLowerCase())) {
      res.setHeader(name, value);
    }
  }
  // Always re-mark the replay so caches don't hold the response.
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Idempotency-Replayed", "true");
}

export interface IdempotencyMiddlewareOptions {
  store: IdempotencyStore;
  /**
   * Logical bucket for this route, e.g. "patron-favorites-add". Storage namespaces by this
   * so two routes that happen to receive the same Idempotency-Key never collide.
   */
  scope: string;
  lockTtlMs?: number;
  responseTtlMs?: number;
}

/**
 * @description Builds middleware that gates one route; reuse `store` with distinct `scope` per path.
 * @param {IdempotencyMiddlewareOptions} options
 * @returns {import("express").RequestHandler}
 */
export function buildIdempotencyMiddleware(options: IdempotencyMiddlewareOptions): RequestHandler {
  const { store, scope } = options;
  const lockTtl = options.lockTtlMs ?? DEFAULT_LOCK_TTL_MS;
  const responseTtl = options.responseTtlMs ?? DEFAULT_RESPONSE_TTL_MS;

  return async function idempotencyMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const headerValue = req.header(HEADER);
    if (typeof headerValue !== "string" || headerValue.length === 0) {
      // Header absent: pass-through. This keeps non-idempotent-aware clients working.
      next();
      return;
    }
    if (!isHeaderKeyValid(headerValue)) {
      const traceId = traceIdFromRequest(req);
      res
        .status(400)
        .json(
          errorEnvelope(
            "VALIDATION_ERROR",
            "Idempotency-Key must be 1-255 ASCII-printable characters.",
            traceId,
            [{ field: "Idempotency-Key", issue: "invalid" }]
          )
        );
      return;
    }
    const key = storageKey(scope, headerValue);
    const bodyHash = hashBody(req.body);

    const reserve = await store.tryReserve(key, lockTtl);
    if (reserve.state === "replay") {
      const snapshot = reserve.snapshot;
      if (snapshot.bodyHash !== bodyHash) {
        const traceId = traceIdFromRequest(req);
        res
          .status(422)
          .json(
            errorEnvelope(
              "IDEMPOTENCY_KEY_REUSE",
              "Idempotency-Key was previously used with a different request body.",
              traceId,
              [{ field: "Idempotency-Key", issue: "body_mismatch" }]
            )
          );
        return;
      }
      applyReplayHeaders(res, snapshot);
      res.status(snapshot.status).json(snapshot.body);
      return;
    }
    if (reserve.state === "in_flight") {
      const traceId = traceIdFromRequest(req);
      res
        .status(409)
        .setHeader("Retry-After", "1")
        .json(
          errorEnvelope(
            "IDEMPOTENCY_IN_FLIGHT",
            "Another request with this Idempotency-Key is currently in flight. Retry shortly.",
            traceId
          )
        );
      return;
    }

    // Fresh reservation: capture the response so we can record it after the handler runs.
    let recorded = false;
    const capturedHeaders: Record<string, string> = {};
    let capturedStatus = 200;
    let capturedBody: unknown = undefined;

    const originalJson = res.json.bind(res);
    const originalStatus = res.status.bind(res);

    res.status = function patchedStatus(code: number) {
      capturedStatus = code;
      return originalStatus(code);
    };

    res.json = function patchedJson(body: unknown) {
      capturedBody = body;
      const result = originalJson(body);
      // Snapshot only allow-listed headers (anything else is intentionally dropped on replay).
      for (const name of REPLAY_HEADER_ALLOWLIST) {
        const v = res.getHeader(name);
        if (typeof v === "string") capturedHeaders[name] = v;
        else if (Array.isArray(v)) capturedHeaders[name] = v.join(", ");
        else if (typeof v === "number") capturedHeaders[name] = String(v);
      }
      // Don't await here -- recording happens off the response path. Errors are swallowed
      // because failing to cache is non-fatal; the next retry will simply re-execute.
      void store
        .recordResponse(
          key,
          {
            status: capturedStatus,
            body: capturedBody,
            headers: capturedHeaders,
            bodyHash,
            recordedAt: Date.now()
          },
          responseTtl
        )
        .catch(() => {
          /* swallow: store-write failures must not break the response */
        });
      recorded = true;
      return result;
    };

    res.on("close", () => {
      if (!recorded) {
        // Handler ended without sending a JSON body (error mid-write, client disconnect, etc.).
        // Release the lock so a retry can proceed instead of waiting for the lock TTL.
        void store.release(key).catch(() => {
          /* swallow */
        });
      }
    });

    next();
  };
}
