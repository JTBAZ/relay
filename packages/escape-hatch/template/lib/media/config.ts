/**
 * Media mode / R2 env resolution (EH-033).
 * Fail closed when private_r2 is selected without real signing credentials.
 */

import {
  isPlaceholderSecret,
  loadEnv,
  type SiteEnv
} from "../env";
import type { MediaMode } from "./types";
import { DEFAULT_SIGNED_URL_TTL_SEC, MAX_SIGNED_URL_TTL_SEC } from "./types";

export class MediaConfigError extends Error {
  readonly code = "ESCAPE_HATCH_MEDIA_CONFIG";

  constructor(message: string) {
    super(message);
    this.name = "MediaConfigError";
  }
}

export function isPrivateMediaMode(mode: MediaMode): boolean {
  return mode === "private_r2" || mode === "local_private";
}

export function isR2SigningConfigured(env: SiteEnv = loadEnv()): boolean {
  return Boolean(
    env.R2_ENDPOINT &&
      !isPlaceholderSecret(env.R2_ENDPOINT) &&
      env.R2_BUCKET &&
      !isPlaceholderSecret(env.R2_BUCKET) &&
      env.R2_ACCESS_KEY_ID &&
      !isPlaceholderSecret(env.R2_ACCESS_KEY_ID) &&
      env.R2_SECRET_ACCESS_KEY &&
      !isPlaceholderSecret(env.R2_SECRET_ACCESS_KEY)
  );
}

/**
 * Resolve media delivery mode.
 * - Explicit `public_legacy` | `private_r2` | `local_private`
 * - Unset: prefer `private_r2` when R2 signing env is real; else `local_private`
 * - Unknown strings throw (fail closed)
 */
export function resolveMediaMode(env: SiteEnv = loadEnv()): MediaMode {
  const raw = env.ESCAPE_HATCH_MEDIA_MODE;
  if (raw === undefined) {
    return isR2SigningConfigured(env) ? "private_r2" : "local_private";
  }
  const normalized = raw.toLowerCase();
  if (normalized === "public_legacy") return "public_legacy";
  if (normalized === "private_r2") return "private_r2";
  if (normalized === "local_private") return "local_private";
  throw new MediaConfigError(
    `Unknown ESCAPE_HATCH_MEDIA_MODE "${raw}". Use public_legacy, private_r2, or local_private.`
  );
}

/** Safe resolve for request paths — invalid → fail closed as private intent. */
export function resolveMediaModeSafe(
  env: SiteEnv = loadEnv()
): MediaMode | "invalid" {
  try {
    return resolveMediaMode(env);
  } catch {
    return "invalid";
  }
}

export function resolveSignedUrlTtlSec(env: SiteEnv = loadEnv()): number {
  const raw = env.ESCAPE_HATCH_MEDIA_SIGNED_URL_TTL_SEC;
  if (raw === undefined) return DEFAULT_SIGNED_URL_TTL_SEC;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_SIGNED_URL_TTL_SEC;
  return Math.min(n, MAX_SIGNED_URL_TTL_SEC);
}

/**
 * Assert private_r2 can mint signed URLs. Call before signing.
 */
export function assertPrivateR2Ready(env: SiteEnv = loadEnv()): void {
  const mode = resolveMediaMode(env);
  if (mode !== "private_r2") return;
  if (!isR2SigningConfigured(env)) {
    throw new MediaConfigError(
      "ESCAPE_HATCH_MEDIA_MODE=private_r2 requires non-placeholder R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY."
    );
  }
}

export type R2SigningEnv = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  publicBaseUrl?: string;
};

export function loadR2SigningEnv(env: SiteEnv = loadEnv()): R2SigningEnv {
  assertPrivateR2Ready(env);
  if (!isR2SigningConfigured(env)) {
    throw new MediaConfigError("R2 signing credentials missing or placeholder.");
  }
  return {
    endpoint: env.R2_ENDPOINT!,
    bucket: env.R2_BUCKET!,
    accessKeyId: env.R2_ACCESS_KEY_ID!,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    region: env.R2_REGION?.trim() || "auto",
    publicBaseUrl: env.R2_PUBLIC_BASE_URL
  };
}
