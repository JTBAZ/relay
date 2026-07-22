/**
 * Adapter bundle for the generated kit (EH-030).
 * Auth/DB report readiness only when env is real and non-placeholder;
 * detail still labels preview until EH-033 private media and broader gates.
 * productionSafe remains false.
 */

import {
  EnvValidationError,
  isPlaceholderSecret,
  isPlaceholderSupabaseUrl,
  isSupabaseIdentityConfigured,
  isSupabaseServiceRoleConfigured,
  loadEnv,
  requireServerEnv,
  resolveSupabaseUrl
} from "../env";
import { getServerAuthSession } from "../identity/session";
import type { SiteAuthSession } from "../identity/types";
import type {
  AuthProvider,
  BillingProvider,
  DatabaseProvider,
  DeploymentProvider,
  PatreonVerificationProvider,
  SiteAdapters,
  StorageProvider,
  TransactionalEmailProvider
} from "./types";

const PREVIEW_UNTIL_MEDIA =
  "Preview identity path — not production-safe until EH-033 private media and broader gates.";

const stubAuth: AuthProvider = {
  id: "auth",
  implementation: "stub",
  async health() {
    return {
      ok: false,
      reason:
        "Auth adapter is a typed stub/local-preview until Supabase URL + anon key are configured (EH-030)."
    };
  },
  async getSession() {
    return null;
  }
};

const supabaseAuth: AuthProvider = {
  id: "auth",
  implementation: "supabase",
  async health() {
    const env = loadEnv();
    if (!isSupabaseIdentityConfigured(env)) {
      return {
        ok: false,
        reason:
          "Supabase identity env missing or placeholder. Local-preview mode — soft personas are non-authoritative."
      };
    }
    return {
      ok: true,
      detail: `Supabase Auth env configured. ${PREVIEW_UNTIL_MEDIA}`
    };
  },
  async getSession(siteId?: string): Promise<SiteAuthSession | null> {
    return getServerAuthSession(siteId);
  }
};

const stubDatabase: DatabaseProvider = {
  id: "database",
  implementation: "stub",
  async health() {
    const env = loadEnv();
    if (!env.DATABASE_URL && !isSupabaseIdentityConfigured(env)) {
      return {
        ok: false,
        reason:
          "DATABASE_URL / Supabase not set. Preview chassis uses JSON under data/; SQL migrations live in db/."
      };
    }
    if (env.DATABASE_URL && isPlaceholderSecret(env.DATABASE_URL)) {
      return {
        ok: false,
        reason: "DATABASE_URL is a placeholder — not ready."
      };
    }
    return {
      ok: false,
      reason:
        "Database adapter is still a stub (set Supabase identity env for the EH-030 data path)."
    };
  },
  async migrate() {
    try {
      requireServerEnv(["DATABASE_URL"], "database.migrate");
    } catch (err) {
      if (err instanceof EnvValidationError) {
        return {
          applied: [],
          skipped: true,
          reason:
            "No DATABASE_URL — apply SQL under db/migrations via Supabase SQL editor (see scripts/bootstrap-identity.md)."
        };
      }
      throw err;
    }
    return {
      applied: [],
      skipped: true,
      reason:
        "DATABASE_URL set but live migrate runner is not executed in-process; apply db/migrations/0001 and 0002 via psql or Supabase dashboard."
    };
  }
};

const supabaseDatabase: DatabaseProvider = {
  id: "database",
  implementation: "supabase",
  async health() {
    const env = loadEnv();
    if (!isSupabaseIdentityConfigured(env)) {
      return {
        ok: false,
        reason: "Supabase identity env missing or placeholder."
      };
    }
    const url = resolveSupabaseUrl(env);
    if (!url || isPlaceholderSupabaseUrl(url)) {
      return { ok: false, reason: "Supabase URL is placeholder." };
    }
    const serviceNote = isSupabaseServiceRoleConfigured(env)
      ? "Service role present (server-only)."
      : "Service role unset (user-scoped RLS path only).";
    return {
      ok: true,
      detail: `Supabase Postgres path configured. ${serviceNote} ${PREVIEW_UNTIL_MEDIA}`
    };
  },
  async migrate() {
    return {
      applied: [],
      skipped: true,
      reason:
        "Apply db/migrations/0001_preview_chassis.sql then 0002_identity_rls.sql in the creator Supabase project (see scripts/bootstrap-identity.md). No live network apply from this kit."
    };
  }
};

const stubStorage: StorageProvider = {
  id: "storage",
  implementation: "stub",
  async health() {
    const env = loadEnv();
    if (!env.R2_BUCKET || !env.R2_ENDPOINT) {
      return {
        ok: false,
        reason:
          "R2 env not configured. Soft-preview still serves public/media (known prototype leakage until EH-033)."
      };
    }
    return {
      ok: false,
      reason:
        "R2 env names may be present, but storage remains stub/preview-only — private signed delivery is EH-033."
    };
  },
  async signGetObject(_key: string) {
    return {
      url: null,
      reason: "Signed object delivery is not implemented (EH-033)."
    };
  }
};

const stubBilling: BillingProvider = {
  id: "billing",
  implementation: "stub",
  async health() {
    return {
      ok: false,
      reason: "Billing adapter is a typed stub/preview-only until EH-050/051."
    };
  }
};

const stubPatreon: PatreonVerificationProvider = {
  id: "patreon",
  implementation: "stub",
  async health() {
    return {
      ok: false,
      reason:
        "Patreon verification adapters are stub/preview-only until EH-040/041."
    };
  }
};

const stubEmail: TransactionalEmailProvider = {
  id: "email",
  implementation: "stub",
  async health() {
    return {
      ok: false,
      reason:
        "Transactional email adapter is stub/preview-only until EH-072."
    };
  }
};

const manifestDeployment: DeploymentProvider = {
  id: "deployment",
  implementation: "manifest",
  listTargets() {
    return ["vercel", "docker"];
  },
  async health() {
    return {
      ok: false,
      reason:
        "vercel.json / Dockerfile manifests are present but do not prove a healthy production deploy (EH-070/071). Shipping public/media in the image remains prototype leakage until EH-033."
    };
  }
};

function createAuthProvider(): AuthProvider {
  return isSupabaseIdentityConfigured(loadEnv()) ? supabaseAuth : stubAuth;
}

function createDatabaseProvider(): DatabaseProvider {
  return isSupabaseIdentityConfigured(loadEnv())
    ? supabaseDatabase
    : stubDatabase;
}

/** Factory for the env-aware adapter set (no live network probes). */
export function createSiteAdapters(): SiteAdapters {
  return {
    auth: createAuthProvider(),
    database: createDatabaseProvider(),
    storage: stubStorage,
    billing: stubBilling,
    patreon: stubPatreon,
    email: stubEmail,
    deployment: manifestDeployment
  };
}

/**
 * Explicit stub bundle — always degraded. Used by tests that assert stub honesty.
 */
export function createStubAdapters(): SiteAdapters {
  return {
    auth: stubAuth,
    database: stubDatabase,
    storage: stubStorage,
    billing: stubBilling,
    patreon: stubPatreon,
    email: stubEmail,
    deployment: manifestDeployment
  };
}

export type {
  AuthProvider,
  BillingProvider,
  DatabaseProvider,
  DeploymentProvider,
  PatreonVerificationProvider,
  SiteAdapters,
  StorageProvider,
  TransactionalEmailProvider,
  AdapterHealth
} from "./types";
