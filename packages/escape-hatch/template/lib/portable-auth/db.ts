/**
 * Portable Postgres access (EH-031). Dynamic `pg` import — kit builds without
 * a live DATABASE_URL. Service/connection role may bypass RLS for login
 * bootstrap; after session validate, SET LOCAL eh.user_id inside the
 * withPortableClient transaction for RLS queries (eh_app / FORCE policies).
 */

import {
  isPlaceholderSecret,
  loadEnv,
  type SiteEnv
} from "../env";

export type PortableQueryResult<T = Record<string, unknown>> = {
  rows: T[];
  rowCount: number | null;
};

export type PortableDbClient = {
  query: <T = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ) => Promise<PortableQueryResult<T>>;
  /** SET LOCAL eh.user_id for RLS (must be inside a transaction). */
  setAppUserId: (userId: string | null) => Promise<void>;
  release: () => void;
};

type PgPoolLike = {
  connect: () => Promise<{
    query: (
      text: string,
      params?: unknown[]
    ) => Promise<{ rows: unknown[]; rowCount: number | null }>;
    release: () => void;
  }>;
  end: () => Promise<void>;
};

let pool: PgPoolLike | null = null;
let poolUrl: string | null = null;

async function loadPgPool(databaseUrl: string): Promise<PgPoolLike> {
  if (pool && poolUrl === databaseUrl) return pool;
  if (pool && poolUrl !== databaseUrl) {
    try {
      await pool.end();
    } catch {
      // ignore
    }
    pool = null;
    poolUrl = null;
  }
  // Dynamic import so `next build` / typecheck without pg installed still works
  // when portable path is unused. Template package.json lists `pg` as optional runtime dep.
  const pg = (await import("pg")) as {
    default?: { Pool: new (c: { connectionString: string }) => PgPoolLike };
    Pool: new (c: { connectionString: string }) => PgPoolLike;
  };
  const PoolCtor = pg.Pool ?? pg.default?.Pool;
  if (!PoolCtor) {
    throw new Error("pg Pool constructor unavailable.");
  }
  pool = new PoolCtor({ connectionString: databaseUrl });
  poolUrl = databaseUrl;
  return pool;
}

export function resolvePortableDatabaseUrl(
  env: SiteEnv = loadEnv()
): string | undefined {
  const url = env.DATABASE_URL;
  if (!url || isPlaceholderSecret(url)) return undefined;
  return url;
}

/**
 * Acquire a client inside a transaction so `set_config(..., is_local=true)`
 * (SET LOCAL eh.user_id) survives for the duration of the callback.
 * Without BEGIN, each statement is its own transaction and the claim vanishes
 * before the next query — breaking RLS for `eh_app` / FORCE policies.
 * Returns null when DATABASE_URL unset or the work fails (CI-safe fail-closed).
 */
export async function withPortableClient<T>(
  fn: (client: PortableDbClient) => Promise<T>
): Promise<T | null> {
  const url = resolvePortableDatabaseUrl();
  if (!url) return null;

  let pgClient: Awaited<ReturnType<PgPoolLike["connect"]>> | null = null;
  let begun = false;
  try {
    const p = await loadPgPool(url);
    pgClient = await p.connect();
    await pgClient.query("BEGIN");
    begun = true;
    const client: PortableDbClient = {
      async query<R = Record<string, unknown>>(text: string, params?: unknown[]) {
        const result = await pgClient!.query(text, params);
        return {
          rows: result.rows as R[],
          rowCount: result.rowCount
        };
      },
      async setAppUserId(userId: string | null) {
        if (userId) {
          await pgClient!.query("SELECT set_config('eh.user_id', $1, true)", [
            userId
          ]);
        } else {
          await pgClient!.query("SELECT set_config('eh.user_id', '', true)");
        }
      },
      release() {
        // Ownership stays with withPortableClient — do not release early.
      }
    };
    try {
      const result = await fn(client);
      await pgClient.query("COMMIT");
      begun = false;
      return result;
    } catch (err) {
      if (begun) {
        try {
          await pgClient.query("ROLLBACK");
        } catch {
          // ignore
        }
        begun = false;
      }
      throw err;
    } finally {
      pgClient.release();
      pgClient = null;
    }
  } catch {
    if (pgClient) {
      if (begun) {
        try {
          await pgClient.query("ROLLBACK");
        } catch {
          // ignore
        }
      }
      try {
        pgClient.release();
      } catch {
        // ignore
      }
    }
    return null;
  }
}

/** Test/helper: reset pooled connection between CI cases. */
export async function resetPortablePoolForTests(): Promise<void> {
  if (pool) {
    try {
      await pool.end();
    } catch {
      // ignore
    }
  }
  pool = null;
  poolUrl = null;
}
