/**
 * PE-H — Interval worker: refresh patron entitlement snapshots past `staleAfter` using stored
 * Patreon OAuth (no BullMQ; same operational pattern as `incremental-sync-worker`).
 */
import { EntitlementSource, type PrismaClient } from "@prisma/client";
import type { PatreonClient } from "../auth/patreon-client.js";
import type { TokenEncryption } from "../lib/crypto.js";
import { refreshPatronEntitlementSnapshotFromPatreon } from "./patron-entitlement-refresh.js";

export type PatronEntitlementStaleCycleResult = {
  cycle_started_at: string;
  rows_scanned: number;
  refreshed: number;
  skipped: number;
  failed: number;
};

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

export async function runPatronEntitlementStaleRefreshCycle(args: {
  prisma: PrismaClient;
  encryption: TokenEncryption;
  patreonClient: PatreonClient;
  fetchImpl: typeof fetch;
  batchSize: number;
  now?: Date;
}): Promise<PatronEntitlementStaleCycleResult> {
  const now = args.now ?? new Date();
  const rows = await args.prisma.patronEntitlementSnapshot.findMany({
    where: {
      staleAfter: { lt: now }
    },
    take: args.batchSize,
    orderBy: { staleAfter: "asc" }
  });

  let refreshed = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const r = await refreshPatronEntitlementSnapshotFromPatreon({
      prisma: args.prisma,
      encryption: args.encryption,
      patreonClient: args.patreonClient,
      fetchImpl: args.fetchImpl,
      patronMembershipId: row.patronMembershipId,
      relayCreatorId: row.relayCreatorId,
      snapshotCampaignId: row.campaignId,
      source: EntitlementSource.scheduled_refresh
    });
    if (r.ok) {
      refreshed += 1;
    } else if (r.reason === "no_credential" || r.reason === "no_campaign_id") {
      skipped += 1;
    } else {
      failed += 1;
    }
  }

  return {
    cycle_started_at: now.toISOString(),
    rows_scanned: rows.length,
    refreshed,
    skipped,
    failed
  };
}

/**
 * @param intervalMs Minimum 60_000. When 0 or env unset at call site, do not start.
 */
export function startPatronEntitlementStaleRefreshWorker(args: {
  prisma: PrismaClient;
  encryption: TokenEncryption;
  patreonClient: PatreonClient;
  fetchImpl: typeof fetch;
  intervalMs: number;
  batchSize: number;
}): () => void {
  const intervalMs = Math.max(60_000, args.intervalMs);
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopped = false;

  const tick = (): void => {
    if (stopped) return;
    void runPatronEntitlementStaleRefreshCycle({
      prisma: args.prisma,
      encryption: args.encryption,
      patreonClient: args.patreonClient,
      fetchImpl: args.fetchImpl,
      batchSize: args.batchSize
    }).catch((err: unknown) => {
      // eslint-disable-next-line no-console -- background worker diagnostics
      console.error("Relay: patron entitlement stale refresh cycle error", err);
    });
  };

  timer = setInterval(tick, intervalMs);
  tick();

  return () => {
    stopped = true;
    if (timer !== undefined) clearInterval(timer);
  };
}

export function patronEntitlementStaleRefreshIntervalFromEnv(): number {
  const raw = process.env.RELAY_PATRON_ENTITLEMENT_REFRESH_MS?.trim();
  if (!raw) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 60_000) return 0;
  return Math.floor(n);
}

export function patronEntitlementStaleRefreshBatchFromEnv(): number {
  return parsePositiveInt(process.env.RELAY_PATRON_ENTITLEMENT_REFRESH_BATCH?.trim(), 20);
}
