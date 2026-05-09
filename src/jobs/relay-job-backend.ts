import { getRedisConnectionOptions } from "../lib/redis.js";

export type RelayJobBackend = "memory" | "bullmq";

function relayEnvTruthy(raw: string | undefined): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * When true, [src/main.ts](../main.ts) does not start background workers; run `npm run worker` in a separate process.
 * See Phase **P1-queue-011** (pilot build plan).
 */
export function relaySplitWorkerProcessFromEnv(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return relayEnvTruthy(env.RELAY_SPLIT_WORKER_PROCESS);
}

/**
 * `RELAY_JOB_BACKEND` — `memory` (default): in-process timers in `main.ts`.
 * `bullmq`: Redis-backed workers; requires `REDIS_URL` (validated here).
 */
export function relayJobBackendFromEnv(env: NodeJS.ProcessEnv = process.env): RelayJobBackend {
  const raw = env.RELAY_JOB_BACKEND?.trim().toLowerCase();
  if (!raw || raw === "memory") return "memory";
  if (raw === "bullmq") {
    getRedisConnectionOptions(env);
    return "bullmq";
  }
  throw new Error(
    `RELAY_JOB_BACKEND must be "memory" or "bullmq" (got ${JSON.stringify(env.RELAY_JOB_BACKEND)})`
  );
}
