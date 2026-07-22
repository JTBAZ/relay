/**
 * Typed environment contract for the generated Escape Hatch site kit (EH-020).
 *
 * Preview / `next build` succeed with empty or minimal env.
 * Runtime paths that need credentials call `requireEnv` / `requireServerEnv`
 * and fail closed — they do not invent production auth (EH-030) or signed
 * media delivery (EH-033).
 */

export type SitePublicEnv = {
  /** Public canonical origin for the site (optional for local preview). */
  NEXT_PUBLIC_SITE_URL: string | undefined;
  /** Optional display name override (falls back to bundle theme / creator). */
  NEXT_PUBLIC_SITE_NAME: string | undefined;
};

export type SiteServerEnv = {
  /** Postgres connection string — optional until EH-030/031. */
  DATABASE_URL: string | undefined;
  /** Creator-owned Supabase URL — optional placeholder for EH-030. */
  SUPABASE_URL: string | undefined;
  /** Supabase anon/publishable key name only in .env.example — never commit secrets. */
  SUPABASE_ANON_KEY: string | undefined;
  /** Supabase service role — server-only; optional until identity slice. */
  SUPABASE_SERVICE_ROLE_KEY: string | undefined;
  /** Cloudflare R2 / S3-compatible endpoint — optional until storage wiring. */
  R2_ENDPOINT: string | undefined;
  R2_BUCKET: string | undefined;
  R2_ACCESS_KEY_ID: string | undefined;
  R2_SECRET_ACCESS_KEY: string | undefined;
  R2_PUBLIC_BASE_URL: string | undefined;
  /** Stripe keys — optional placeholders for EH-050/051; not required for build. */
  STRIPE_SECRET_KEY: string | undefined;
  STRIPE_WEBHOOK_SECRET: string | undefined;
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: string | undefined;
};

export type SiteEnv = SitePublicEnv & SiteServerEnv;

/** Env var names documented for creators (names only; no secrets). */
export const SITE_ENV_NAMES = {
  requiredForProduction: [] as const,
  optionalForPreviewBuild: [
    "NEXT_PUBLIC_SITE_URL",
    "NEXT_PUBLIC_SITE_NAME"
  ] as const,
  optionalFutureAdapters: [
    "DATABASE_URL",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "R2_ENDPOINT",
    "R2_BUCKET",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_PUBLIC_BASE_URL",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
  ] as const
} as const;

export class EnvValidationError extends Error {
  readonly code = "ESCAPE_HATCH_ENV_VALIDATION";
  readonly missing: string[];

  constructor(missing: string[], context?: string) {
    const where = context ? ` (${context})` : "";
    super(
      `Missing required environment variable(s)${where}: ${missing.join(", ")}. ` +
        "See .env.example for names only — never commit secrets."
    );
    this.name = "EnvValidationError";
    this.missing = missing;
  }
}

function readOptional(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/**
 * Load the full typed env snapshot. Never throws — preview chassis may run
 * with all fields undefined.
 */
export function loadEnv(): SiteEnv {
  return {
    NEXT_PUBLIC_SITE_URL: readOptional("NEXT_PUBLIC_SITE_URL"),
    NEXT_PUBLIC_SITE_NAME: readOptional("NEXT_PUBLIC_SITE_NAME"),
    DATABASE_URL: readOptional("DATABASE_URL"),
    SUPABASE_URL: readOptional("SUPABASE_URL"),
    SUPABASE_ANON_KEY: readOptional("SUPABASE_ANON_KEY"),
    SUPABASE_SERVICE_ROLE_KEY: readOptional("SUPABASE_SERVICE_ROLE_KEY"),
    R2_ENDPOINT: readOptional("R2_ENDPOINT"),
    R2_BUCKET: readOptional("R2_BUCKET"),
    R2_ACCESS_KEY_ID: readOptional("R2_ACCESS_KEY_ID"),
    R2_SECRET_ACCESS_KEY: readOptional("R2_SECRET_ACCESS_KEY"),
    R2_PUBLIC_BASE_URL: readOptional("R2_PUBLIC_BASE_URL"),
    STRIPE_SECRET_KEY: readOptional("STRIPE_SECRET_KEY"),
    STRIPE_WEBHOOK_SECRET: readOptional("STRIPE_WEBHOOK_SECRET"),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: readOptional(
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
    )
  };
}

/** Server secret-like keys reject placeholder values in `requireEnv`. */
export function isSecretLikeEnvKey(key: keyof SiteEnv): boolean {
  const name = String(key);
  if (name === "DATABASE_URL") return true;
  if (name.startsWith("NEXT_PUBLIC_")) return false;
  return /SECRET|KEY|TOKEN|PASSWORD/i.test(name);
}

/**
 * Fail-closed helper for runtime paths that need specific vars.
 * Do not call at module top-level for preview routes — build must succeed
 * without credentials. Secret-like keys treat placeholder values as missing.
 */
export function requireEnv(
  keys: readonly (keyof SiteEnv)[],
  context?: string
): Pick<SiteEnv, (typeof keys)[number]> {
  const env = loadEnv();
  const missing: string[] = [];
  const out = {} as Pick<SiteEnv, (typeof keys)[number]>;
  for (const key of keys) {
    const value = env[key];
    if (
      value === undefined ||
      (isSecretLikeEnvKey(key) && isPlaceholderSecret(value))
    ) {
      missing.push(key);
    } else {
      out[key] = value;
    }
  }
  if (missing.length > 0) {
    throw new EnvValidationError(missing, context);
  }
  return out;
}

/** Alias for server-only adapter entrypoints. */
export function requireServerEnv(
  keys: readonly (keyof SiteServerEnv)[],
  context?: string
): Pick<SiteEnv, (typeof keys)[number]> {
  return requireEnv(keys, context);
}

/** True when a value looks like an unfilled placeholder (fail closed in prod paths). */
export function isPlaceholderSecret(value: string | undefined): boolean {
  if (value === undefined || value === null) return true;
  const lower = value.toLowerCase().trim();
  if (lower.length === 0) return true;
  // Normalize separators so replace-me / replace_me / replace.me all match.
  const normalized = lower.replace(/[-.\s]+/g, "_");
  return (
    normalized.includes("changeme") ||
    normalized.includes("your_") ||
    normalized.includes("replace_me") ||
    normalized === "todo" ||
    normalized === "xxx" ||
    // Empty-looking: only quotes / punctuation / whitespace
    /^["'`._-]+$/.test(lower)
  );
}
