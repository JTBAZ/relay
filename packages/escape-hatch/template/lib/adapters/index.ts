/**
 * Adapter bundle for the generated kit (EH-040).
 * Auth/DB report readiness only when env is real and non-placeholder;
 * storage signs private GETs when private_r2 credentials are real;
 * Patreon creator_oauth when fully configured (EH-040); relay_managed is EH-041.
 * productionSafe remains false (Milestone 3 UX/security gate + deploy/billing open).
 */

import {
  EnvValidationError,
  isPlaceholderSecret,
  isPlaceholderSupabaseUrl,
  isPortableIdentityConfigured,
  isSupabaseIdentityConfigured,
  isSupabaseServiceRoleConfigured,
  loadEnv,
  requireServerEnv,
  resolveIdentityProviderSafe,
  resolveSupabaseUrl
} from "../env";
import type { SiteAuthSession } from "../identity/types";
import {
  isR2SigningConfigured,
  resolveMediaModeSafe
} from "../media/config";
import { createMockMediaSigner, createR2MediaSigner } from "../media/sign";
import {
  isCreatorOAuthConfigured,
  loadCreatorOAuthConfig,
  resolvePatreonMode
} from "../patreon/config";
import {
  buildAuthorizeUrl,
  linkFromAuthorizationCode,
  refreshAndRelink
} from "../patreon/link";
import { createMemoryPatreonLinkStore } from "../patreon/store";
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

/** Process-local link store for preview/tests until SQL-backed store is wired. */
const previewPatreonStore = createMemoryPatreonLinkStore();

const PREVIEW_OVERALL =
  "Preview path — productionSafe remains false until Milestone 3 security/browser gate and deploy/billing close.";

const stubAuth: AuthProvider = {
  id: "auth",
  implementation: "stub",
  async health() {
    return {
      ok: false,
      reason:
        "Auth adapter is a typed stub/local-preview until ESCAPE_HATCH_IDENTITY_PROVIDER=supabase|portable is configured with real env (EH-030/031)."
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
      detail: `Supabase Auth env configured (Path A). ${PREVIEW_OVERALL}`
    };
  },
  async getSession(siteId?: string): Promise<SiteAuthSession | null> {
    const { getServerAuthSession } = await import("../identity/session");
    return getServerAuthSession(siteId);
  }
};

const portableAuth: AuthProvider = {
  id: "auth",
  implementation: "portable",
  async health() {
    const env = loadEnv();
    if (!isPortableIdentityConfigured(env)) {
      return {
        ok: false,
        reason:
          "Portable identity requires DATABASE_URL + ESCAPE_HATCH_SESSION_SECRET (non-placeholder) with ESCAPE_HATCH_IDENTITY_PROVIDER=portable."
      };
    }
    return {
      ok: true,
      detail: `Portable app-managed auth env configured (Path B). ${PREVIEW_OVERALL}`
    };
  },
  async getSession(siteId?: string): Promise<SiteAuthSession | null> {
    const { getServerAuthSession } = await import("../identity/session");
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
        "Database adapter is still a stub (set ESCAPE_HATCH_IDENTITY_PROVIDER=supabase|portable with real env for Path A/B)."
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
            "No DATABASE_URL — apply SQL under db/migrations via Supabase SQL editor (Path A) or docker compose --profile db (Path B). See scripts/bootstrap-identity.md."
        };
      }
      throw err;
    }
    return {
      applied: [],
      skipped: true,
      reason:
        "DATABASE_URL set but live migrate runner is not executed in-process; apply db/migrations via psql (Path A: 0001+0002; Path B: 0001+0003)."
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
      detail: `Supabase Postgres path configured (Path A). ${serviceNote} ${PREVIEW_OVERALL}`
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

const portableDatabase: DatabaseProvider = {
  id: "database",
  implementation: "postgres",
  async health() {
    const env = loadEnv();
    if (!isPortableIdentityConfigured(env)) {
      return {
        ok: false,
        reason:
          "Portable Postgres path needs DATABASE_URL + ESCAPE_HATCH_SESSION_SECRET (non-placeholder)."
      };
    }
    return {
      ok: true,
      detail: `Portable Postgres path configured (Path B). Apply 0001+0003. ${PREVIEW_OVERALL}`
    };
  },
  async migrate() {
    return {
      applied: [],
      skipped: true,
      reason:
        "Apply db/migrations/0001_preview_chassis.sql then 0003_portable_identity.sql via psql or docker compose --profile db (see scripts/bootstrap-identity.md). Do not apply 0002 (auth.users) on Path B."
    };
  }
};

const stubStorage: StorageProvider = {
  id: "storage",
  implementation: "stub",
  async health() {
    return {
      ok: false,
      reason:
        "Storage adapter stub — set ESCAPE_HATCH_MEDIA_MODE=local_private (default) or private_r2 with R2 env for signed delivery."
    };
  },
  async signGetObject(_key: string) {
    return {
      url: null,
      reason: "Storage adapter is stub — no signed URL."
    };
  }
};

const localPrivateStorage: StorageProvider = {
  id: "storage",
  implementation: "local_private",
  async health() {
    return {
      ok: true,
      detail: `local_private media mode — authenticated proxy from data/private-media after evaluateAccess. ${PREVIEW_OVERALL}`
    };
  },
  async signGetObject(_key: string) {
    return {
      url: null,
      reason:
        "local_private streams via /api/media (no R2 signed URL). Use private_r2 for object signing."
    };
  }
};

const r2Storage: StorageProvider = {
  id: "storage",
  implementation: "r2",
  async health() {
    const env = loadEnv();
    if (!isR2SigningConfigured(env)) {
      return {
        ok: false,
        reason:
          "private_r2 selected but R2 signing env is missing or placeholder — fail closed."
      };
    }
    return {
      ok: true,
      detail: `R2 signing env configured for short-lived GET URLs after evaluateAccess. ${PREVIEW_OVERALL}`
    };
  },
  async signGetObject(key: string) {
    const env = loadEnv();
    if (!isR2SigningConfigured(env)) {
      return {
        url: null,
        reason: "R2 signing credentials missing or placeholder."
      };
    }
    try {
      const signer =
        process.env.ESCAPE_HATCH_MEDIA_SIGNER === "mock"
          ? createMockMediaSigner()
          : createR2MediaSigner();
      const signed = await signer.signGetObject(key);
      return { url: signed.url, expiresAt: signed.expiresAt };
    } catch {
      return { url: null, reason: "Failed to mint signed GET URL." };
    }
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
    const mode = resolvePatreonMode(loadEnv());
    if (mode === "stub" && loadEnv().ESCAPE_HATCH_PATREON_MODE?.toLowerCase() === "relay_managed") {
      return {
        ok: false,
        reason:
          "Relay-managed Patreon verification (relay_managed) belongs to EH-041 — not implemented in this kit."
      };
    }
    return {
      ok: false,
      reason:
        "Patreon verification is stub until ESCAPE_HATCH_PATREON_MODE=creator_oauth with real non-placeholder credentials (EH-040). Relay-managed path is EH-041."
    };
  },
  async buildAuthorizeUrl() {
    return {
      ok: false,
      reason: "Patreon creator_oauth is not configured (stub)."
    };
  },
  async handleCallback() {
    return {
      ok: false,
      redirectTo: "/account?patreon=error&reason=not_configured",
      reason: "not_configured"
    };
  },
  async refreshAndRelink() {
    return { ok: false, reason: "not_configured" };
  }
};

const creatorOAuthPatreon: PatreonVerificationProvider = {
  id: "patreon",
  implementation: "creator_oauth",
  async health() {
    const env = loadEnv();
    if (!isCreatorOAuthConfigured(env)) {
      return {
        ok: false,
        reason:
          "ESCAPE_HATCH_PATREON_MODE=creator_oauth but client id/secret/redirect/campaign/token key/state secret are missing or placeholders."
      };
    }
    return {
      ok: true,
      detail: `Creator-owned Patreon OAuth env configured. ${PREVIEW_OVERALL}`
    };
  },
  async buildAuthorizeUrl(args) {
    try {
      const config = loadCreatorOAuthConfig();
      const built = buildAuthorizeUrl({
        config,
        siteId: args.siteId,
        accountId: args.accountId,
        returnPath: args.returnPath
      });
      return {
        ok: true,
        url: built.url,
        state: built.state,
        expiresAtIso: built.expiresAtIso
      };
    } catch {
      return { ok: false, reason: "authorize_build_failed" };
    }
  },
  async handleCallback(args) {
    const returnPath =
      args.returnPath && args.returnPath.startsWith("/") && !args.returnPath.startsWith("//")
        ? args.returnPath
        : "/account";
    try {
      const config = loadCreatorOAuthConfig();
      const result = await linkFromAuthorizationCode({
        config,
        store: previewPatreonStore,
        code: args.code,
        codeVerifier: args.codeVerifier,
        siteId: args.siteId,
        accountId: args.accountId
      });
      if (!result.ok) {
        return {
          ok: false,
          redirectTo: `${returnPath}?patreon=error&reason=${encodeURIComponent(result.reason)}`,
          reason: result.reason
        };
      }
      return {
        ok: true,
        redirectTo: `${returnPath.split("?")[0]}?patreon=linked`,
        patreonUserId: result.patreonUserId,
        tierIds: result.tierIds
      };
    } catch {
      return {
        ok: false,
        redirectTo: `${returnPath}?patreon=error&reason=callback_failed`,
        reason: "callback_failed"
      };
    }
  },
  async refreshAndRelink(args) {
    try {
      const config = loadCreatorOAuthConfig();
      return await refreshAndRelink({
        config,
        store: previewPatreonStore,
        siteId: args.siteId,
        accountId: args.accountId
      });
    } catch {
      return { ok: false, reason: "refresh_failed" };
    }
  }
};

function createPatreonProvider(): PatreonVerificationProvider {
  const env = loadEnv();
  if (isCreatorOAuthConfigured(env)) {
    return creatorOAuthPatreon;
  }
  return stubPatreon;
}

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
        "vercel.json / Dockerfile manifests are present but do not prove a healthy production deploy (EH-070/071). Prefer private media layout so premium bytes are not shipped under public/media."
    };
  }
};

function createAuthProvider(): AuthProvider {
  const mode = resolveIdentityProviderSafe(loadEnv());
  if (mode === "portable") return portableAuth;
  if (mode === "supabase") return supabaseAuth;
  return stubAuth;
}

function createDatabaseProvider(): DatabaseProvider {
  const mode = resolveIdentityProviderSafe(loadEnv());
  if (mode === "portable") return portableDatabase;
  if (mode === "supabase") return supabaseDatabase;
  return stubDatabase;
}

function createStorageProvider(): StorageProvider {
  const mode = resolveMediaModeSafe(loadEnv());
  if (mode === "private_r2") return r2Storage;
  if (mode === "local_private") return localPrivateStorage;
  if (mode === "public_legacy") return stubStorage;
  return stubStorage;
}

/** Factory for the env-aware adapter set (no live network probes). */
export function createSiteAdapters(): SiteAdapters {
  return {
    auth: createAuthProvider(),
    database: createDatabaseProvider(),
    storage: createStorageProvider(),
    billing: stubBilling,
    patreon: createPatreonProvider(),
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
