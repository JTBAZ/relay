/**
 * @fileoverview Patron experience module patron-entitlement-stale-worker.ts — see exported symbols.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma Account, TenantMembership, and related patron tables
 * @security-audit-required Patron PII or entitlement paths — audit responses and logs.
 */
/**
 * PE-H — Interval worker: refresh patron entitlement snapshots past `staleAfter` using stored
 * Patreon OAuth (no BullMQ; same operational pattern as `incremental-sync-worker`).
 */
import { EntitlementSource, type PrismaClient } from "@prisma/client";
import type { SubscribeStarOAuthClient } from "../subscribestar/subscribestar-client.js";
import { getPatronOAuthTokensForAccount } from "../auth/patron-oauth-credential-store.js";
import { getPatronSubscribestarOAuthTokensForAccount } from "../auth/patron-subscribestar-oauth-credential-store.js";
import type { PatreonClient } from "../auth/patreon-client.js";
import type { TokenEncryption } from "../lib/crypto.js";
import {
  refreshPatronEntitlementSnapshotFromPatreon,
  refreshPatronEntitlementSnapshotFromSubscribeStar
} from "./patron-entitlement-refresh.js";

export type PatronEntitlementStaleCycleResult = {
  cycle_started_at: string;
  rows_scanned: number;
  refreshed: number;
  skipped: number;
  failed: number;
};

export type RunPatronEntitlementStaleRefreshOnceArgs = {
  prisma: PrismaClient;
  encryption: TokenEncryption;
  patreonClient: PatreonClient;
  fetchImpl: typeof fetch;
  batchSize: number;
  now?: Date;
  /**
   * When set, only consider this `PatronEntitlementSnapshot.patronMembershipId` (BullMQ targeted job).
   * Still requires `staleAfter < now` to match batch semantics.
   */
  patronMembershipId?: string;
  /** Optional SubscribeStar subscriber OAuth client for dual-provider refresh. */
  subscribeStarPatronOAuthClient?: SubscribeStarOAuthClient;
  /** e.g. `https://subscribestar.adult/api/graphql/v1`; required when `subscribeStarPatronOAuthClient` is set. */
  subscribeStarPatronGraphqlUrl?: string;
};

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

/**
 * One batch: load stale entitlement snapshots (optional single membership), refresh each via Patreon OAuth.
 */
export async function runPatronEntitlementStaleRefreshOnce(
  args: RunPatronEntitlementStaleRefreshOnceArgs
): Promise<PatronEntitlementStaleCycleResult> {
  const now = args.now ?? new Date();
  const targeted = args.patronMembershipId?.trim();
  const rows = await args.prisma.patronEntitlementSnapshot.findMany({
    where: {
      staleAfter: { lt: now },
      ...(targeted ? { patronMembershipId: targeted } : {})
    },
    take: args.batchSize,
    orderBy: { staleAfter: "asc" }
  });

  let refreshed = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const m = await args.prisma.tenantMembership.findUnique({
      where: { id: row.patronMembershipId },
      select: { accountId: true }
    });
    if (!m) {
      failed += 1;
      continue;
    }

    const patreonTok = await getPatronOAuthTokensForAccount(
      args.prisma,
      m.accountId,
      args.encryption
    );
    const substarTok = await getPatronSubscribestarOAuthTokensForAccount(
      args.prisma,
      m.accountId,
      args.encryption
    );

    let anyOk = false;

    if (patreonTok?.access_token?.trim()) {
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
      if (r.ok) anyOk = true;
    }

    if (
      substarTok?.access_token?.trim() &&
      args.subscribeStarPatronOAuthClient &&
      args.subscribeStarPatronGraphqlUrl?.trim()
    ) {
      const sr = await refreshPatronEntitlementSnapshotFromSubscribeStar({
        prisma: args.prisma,
        encryption: args.encryption,
        subscribeStarOAuthClient: args.subscribeStarPatronOAuthClient,
        fetchImpl: args.fetchImpl,
        graphqlUrl: args.subscribeStarPatronGraphqlUrl.trim(),
        patronMembershipId: row.patronMembershipId,
        relayCreatorId: row.relayCreatorId,
        snapshotCampaignId: row.campaignId,
        source: EntitlementSource.scheduled_refresh
      });
      if (sr.ok) anyOk = true;
    }

    if (anyOk) {
      refreshed += 1;
    } else if (!patreonTok?.access_token?.trim() && !substarTok?.access_token?.trim()) {
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
 * @deprecated Use {@link runPatronEntitlementStaleRefreshOnce}; retained for existing imports.
 */
export const runPatronEntitlementStaleRefreshCycle = runPatronEntitlementStaleRefreshOnce;

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
  subscribeStarPatronOAuthClient?: SubscribeStarOAuthClient;
  subscribeStarPatronGraphqlUrl?: string;
}): () => void {
  const intervalMs = Math.max(60_000, args.intervalMs);
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopped = false;

  const tick = (): void => {
    if (stopped) return;
    void runPatronEntitlementStaleRefreshOnce({
      prisma: args.prisma,
      encryption: args.encryption,
      patreonClient: args.patreonClient,
      fetchImpl: args.fetchImpl,
      batchSize: args.batchSize,
      subscribeStarPatronOAuthClient: args.subscribeStarPatronOAuthClient,
      subscribeStarPatronGraphqlUrl: args.subscribeStarPatronGraphqlUrl
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

export function patronEntitlementStaleRefreshIntervalFromEnv(
  env: NodeJS.ProcessEnv = process.env
): number {
  const raw = env.RELAY_PATRON_ENTITLEMENT_REFRESH_MS?.trim();
  if (!raw) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 60_000) return 0;
  return Math.floor(n);
}

export function patronEntitlementStaleRefreshBatchFromEnv(): number {
  return parsePositiveInt(process.env.RELAY_PATRON_ENTITLEMENT_REFRESH_BATCH?.trim(), 20);
}
