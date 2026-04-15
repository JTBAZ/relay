import {
  CredentialHealth,
  OAuthPurpose,
  type PrismaClient
} from "@prisma/client";
import { getSupabaseSyncRouteMetrics } from "./auth-route-metrics.js";

export type PlatformOperationsHealth = {
  status: "ok" | "degraded" | "limited";
  database: {
    prisma_configured: boolean;
    connectivity_ok: boolean;
    /** Connections to this database from `pg_stat_activity` (includes idle). */
    backend_connections: number | null;
    max_connections: number | null;
  };
  patreon_oauth: {
    creator_credentials_unhealthy: number;
    patron_credentials_unhealthy: number;
  };
  patron_entitlements: {
    snapshot_row_count: number;
    snapshots_past_stale_after: number;
    oldest_snapshot_as_of: string | null;
  };
  auth_routes: ReturnType<typeof getSupabaseSyncRouteMetrics>;
  alerts: string[];
  documentation: string[];
};

const DOCS = [
  "Point uptime monitors at GET /api/v1/health (liveness) and GET /api/v1/health/platform (operations).",
  "Alert on status=degraded or on non-200 from /api/v1/health/platform when DATABASE_URL is configured.",
  "Supabase Auth sync counters reset on deploy; pair with log drains for durable auth failure rates.",
  "High DB connection use: compare backend_connections to max_connections (same PostgreSQL cluster as Prisma)."
];

/**
 * Aggregates DB connectivity, OAuth credential health, patron snapshot staleness, and Supabase sync counters.
 */
export async function evaluatePlatformOperationsHealth(
  prisma: PrismaClient | undefined
): Promise<PlatformOperationsHealth> {
  const auth_routes = getSupabaseSyncRouteMetrics();
  const alerts: string[] = [];

  if (!prisma) {
    return {
      status: "limited",
      database: {
        prisma_configured: false,
        connectivity_ok: false,
        backend_connections: null,
        max_connections: null
      },
      patreon_oauth: {
        creator_credentials_unhealthy: 0,
        patron_credentials_unhealthy: 0
      },
      patron_entitlements: {
        snapshot_row_count: 0,
        snapshots_past_stale_after: 0,
        oldest_snapshot_as_of: null
      },
      auth_routes,
      alerts,
      documentation: [
        ...DOCS,
        "Prisma not passed to createApp — enable RELAY_DB_* stores and DATABASE_URL for DB-backed metrics."
      ]
    };
  }

  let connectivity_ok = false;
  let backend_connections: number | null = null;
  let max_connections: number | null = null;

  try {
    await prisma.$queryRaw`SELECT 1`;
    connectivity_ok = true;

    const connRows = await prisma.$queryRaw<{ c: number }[]>`
      SELECT count(*)::int AS c FROM pg_stat_activity WHERE datname = current_database()
    `;
    backend_connections = connRows[0]?.c ?? 0;

    const maxRows = await prisma.$queryRaw<{ setting: string }[]>`
      SELECT setting FROM pg_settings WHERE name = 'max_connections'
    `;
    const mc = maxRows[0]?.setting;
    if (mc !== undefined) {
      const n = parseInt(mc, 10);
      max_connections = Number.isFinite(n) ? n : null;
    }

    if (
      max_connections !== null &&
      backend_connections !== null &&
      max_connections > 0 &&
      backend_connections / max_connections >= 0.9
    ) {
      alerts.push(
        `high_db_connection_use: ${backend_connections}/${max_connections} connections to this database`
      );
    }
  } catch (e) {
    alerts.push(
      `database_check_failed: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  const creator_credentials_unhealthy = await prisma.oAuthCredential.count({
    where: {
      purpose: OAuthPurpose.creator_ingest,
      healthStatus: { not: CredentialHealth.healthy }
    }
  });
  const patron_credentials_unhealthy =
    await prisma.patronOAuthCredential.count({
      where: { healthStatus: { not: CredentialHealth.healthy } }
    });

  if (creator_credentials_unhealthy > 0) {
    alerts.push(
      `creator_oauth_unhealthy_count: ${creator_credentials_unhealthy}`
    );
  }
  if (patron_credentials_unhealthy > 0) {
    alerts.push(
      `patron_oauth_unhealthy_count: ${patron_credentials_unhealthy}`
    );
  }

  const now = new Date();
  const snapshot_row_count = await prisma.patronEntitlementSnapshot.count();
  const snapshots_past_stale_after = await prisma.patronEntitlementSnapshot.count(
    {
      where: { staleAfter: { lt: now } }
    }
  );
  const oldest = await prisma.patronEntitlementSnapshot.findFirst({
    orderBy: { asOf: "asc" },
    select: { asOf: true }
  });

  if (snapshots_past_stale_after > 0) {
    alerts.push(
      `patron_entitlement_snapshots_stale: ${snapshots_past_stale_after} of ${snapshot_row_count}`
    );
  }

  if (auth_routes.supabase_sync_auth_error_total > 0) {
    alerts.push(
      `supabase_sync_auth_errors_total: ${auth_routes.supabase_sync_auth_error_total} (since process start)`
    );
  }

  const status =
    alerts.length > 0 ? ("degraded" as const) : ("ok" as const);

  return {
    status,
    database: {
      prisma_configured: true,
      connectivity_ok,
      backend_connections,
      max_connections
    },
    patreon_oauth: {
      creator_credentials_unhealthy,
      patron_credentials_unhealthy
    },
    patron_entitlements: {
      snapshot_row_count,
      snapshots_past_stale_after,
      oldest_snapshot_as_of: oldest?.asOf.toISOString() ?? null
    },
    auth_routes,
    alerts,
    documentation: DOCS
  };
}
