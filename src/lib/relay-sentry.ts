/**
 * Optional Sentry reporting for the Relay API / worker (Phase P2-obs-003).
 * No-ops when `SENTRY_DSN` is unset so local/dev runs stay telemetry-free by default.
 */
import type { Application } from "express";
import {
  captureException,
  init,
  isInitialized,
  setupExpressErrorHandler,
  type ErrorEvent
} from "@sentry/node";
import { redactSensitiveKeysInObject, scrubRequestHeaders, scrubTokenSubstrings } from "./pii-scrub.js";

function parseRate(raw: string | undefined, defaultValue: number): number {
  if (raw === undefined || raw.trim() === "") return defaultValue;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) return defaultValue;
  return n;
}

/**
 * Applies PII / token scrubbing for Sentry payloads (used by `beforeSend`).
 * Exported for unit tests.
 */
export function applyRelaySentryPiiScrub(event: ErrorEvent): ErrorEvent | null {
  if (event.request?.headers) {
    const h = scrubRequestHeaders(
      event.request.headers as Record<string, string | string[] | undefined>
    ) as Record<string, string>;
    event.request.headers = h;
  }
  if (event.request?.cookies) {
    delete event.request.cookies;
  }
  if (event.user?.email) {
    event.user = { ...event.user, email: "[Redacted]" };
  }
  if (event.user?.ip_address) {
    event.user = { ...event.user, ip_address: "[Redacted]" };
  }

  if (typeof event.message === "string") {
    event.message = scrubTokenSubstrings(event.message);
  }
  if (event.logentry && typeof event.logentry.message === "string") {
    event.logentry.message = scrubTokenSubstrings(event.logentry.message);
  }
  if (event.extra) {
    event.extra = redactSensitiveKeysInObject(event.extra) as typeof event.extra;
  }
  if (event.contexts) {
    event.contexts = redactSensitiveKeysInObject(event.contexts) as typeof event.contexts;
  }

  return event;
}

/**
 * Call once per process after `loadEnv`, before creating the Express app.
 * Safe to call multiple times; only the first non-empty `SENTRY_DSN` wins.
 */
export function initRelaySentry(): void {
  if (isInitialized()) return;

  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;

  const sampleRate = parseRate(process.env.SENTRY_SAMPLE_RATE, 1);
  const tracesSampleRate = parseRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0);

  init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
    sampleRate,
    tracesSampleRate,
    beforeSend(event, _hint) {
      return applyRelaySentryPiiScrub(event);
    }
  });
}

export function isRelaySentryEnabled(): boolean {
  return isInitialized();
}

/**
 * Register Sentry's Express error handler after all routes (captures `next(err)` errors).
 */
export function attachRelaySentryExpressErrorHandler(app: Application): void {
  if (!isRelaySentryEnabled()) return;
  setupExpressErrorHandler(app);
}

/**
 * Report an error to Sentry when the SDK is active (e.g. unhandled rejections).
 */
export function captureRelaySentryException(reason: unknown): void {
  if (!isRelaySentryEnabled()) return;
  captureException(reason);
}
