/**
 * Job trace ids for BullMQ payloads (Phase P1-queue-014).
 * When a producer has no HTTP/request context, workers synthesize `job_<uuid>`.
 */

import { randomUUID } from "node:crypto";
import type { RelayJobTraceFields } from "./queue-names.js";

export function newRelayJobTraceId(): string {
  return `job_${randomUUID()}`;
}

/**
 * Prefer non-empty `data.traceId`; otherwise generate a fresh id for this execution
 * (repeat ticks ship empty payloads from the scheduler).
 */
export function relayJobTraceIdForProcessing(
  data: RelayJobTraceFields | undefined
): string {
  const t = data?.traceId?.trim();
  if (t) return t;
  return newRelayJobTraceId();
}
