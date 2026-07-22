/**
 * Default stub adapter bundle for Milestone 2 chassis.
 * productionSafe remains false — no hard paywall or EH-033 delivery.
 * Runtime health always reports degraded/stub until EH-030/033/050/070.
 */

import { loadEnv, requireServerEnv, EnvValidationError } from "../env";
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

const stubAuth: AuthProvider = {
  id: "auth",
  implementation: "stub",
  async health() {
    return {
      ok: false,
      reason:
        "Auth adapter is a typed stub/preview-only until EH-030 (Supabase identity)."
    };
  },
  async getSession() {
    return null;
  }
};

const stubDatabase: DatabaseProvider = {
  id: "database",
  implementation: "stub",
  async health() {
    const env = loadEnv();
    if (!env.DATABASE_URL) {
      return {
        ok: false,
        reason:
          "DATABASE_URL not set. Preview chassis uses JSON under data/; SQL migrations live in db/ for creator-owned deploy (EH-030)."
      };
    }
    return {
      ok: false,
      reason:
        "DATABASE_URL may be present, but the database adapter is still a stub/preview-only surface until EH-030/031 (no live connection probe)."
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
            "No DATABASE_URL — SQL files under db/migrations are portable stubs; apply when wiring EH-030/031."
        };
      }
      throw err;
    }
    return {
      applied: [],
      skipped: true,
      reason:
        "DATABASE_URL set but preview chassis does not run live migrations (EH-030 owns apply + RLS)."
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
      reason:
        "Billing adapter is a typed stub/preview-only until EH-050/051."
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

/** Factory for the default stub adapter set (no live network). */
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
