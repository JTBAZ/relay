import { getRedisConnectionOptions } from "../lib/redis.js";

export type RelayJobBackend = "memory" | "bullmq";

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
