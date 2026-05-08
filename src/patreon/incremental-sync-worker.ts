/**
 * @fileoverview T-007 / T-008 — incremental autosync worker: scheduled fallback watermark-aware `scrapeOrSync` per creator.
 * @description Interval worker complements Patreon webhooks; `runIncrementalAutosyncOnce` batches creators (alias: `runIncrementalAutosyncCycle`). Idempotent ingest via existing watermarks.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma `CreatorProfile`, ingest posts/media tiers via `PatreonSyncService`
 *
 * **T-007 / T-008 — Incremental autosync & fallback cadence**
 *
 * The interval worker (`startIncrementalAutosyncWorker`) is the **scheduled fallback** when Patreon
 * webhooks (T-006) are missed or delayed: periodic, watermark-aware `scrapeOrSync` with per-creator
 * serialization against webhook-triggered work. It **complements** webhooks; it does not replace them.
 *
 * **Idempotency:** `scrapeOrSync` advances watermarks; duplicate post IDs are not re-applied.
 * Optional probe-skip avoids redundant Patreon calls when caught up.
 */
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { PatreonTokenStore } from "../auth/token-store.js";
import {
  ensureCreatorProfilePatreonCampaignId,
  getCreatorProfilePatreonCampaignIdForRelayCreatorDb
} from "./campaign-tenant-resolve.js";
import { PatreonCampaignCreatorIndex } from "./patreon-campaign-creator-index.js";
import type { PatreonSyncHealthStoreAPI } from "./patreon-sync-health-store.js";
import type { PatreonSyncService } from "./patreon-sync-service.js";
import { classifySyncError } from "./sync-error-copy.js";

export type IncrementalAutosyncCycleResult = {
  cycle_started_at: string;
  creators_attempted: number;
  creators_succeeded: number;
  creators_failed: number;
  creators_skipped_unhealthy: number;
  creators_skipped_probe: number;
  errors: Array<{ creator_id: string; message: string }>;
};

function envTruthy(raw: string | undefined): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

/**
 * Delay before the next fallback cycle. Used by the interval worker (T-008: jitter + optional backoff).
 * Exported for unit tests.
 */
export function computeAutosyncDelayAfterCycle(args: {
  baseIntervalMs: number;
  jitterMaxMs: number;
  backoffEnabled: boolean;
  /** Number of consecutive completed cycles that had at least one creator failure (0 = last cycle clean). */
  consecutiveFailureCycles: number;
  maxBackoffMultiplier: number;
  random?: () => number;
}): number {
  const rnd = args.random ?? Math.random;
  const jitter =
    args.jitterMaxMs > 0
      ? Math.floor(rnd() * (args.jitterMaxMs + 1))
      : 0;
  let mult = 1;
  if (args.backoffEnabled && args.consecutiveFailureCycles > 0) {
    const pow = Math.min(args.consecutiveFailureCycles, 16);
    mult = Math.min(2 ** pow, args.maxBackoffMultiplier);
  }
  return Math.floor(args.baseIntervalMs * mult) + jitter;
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  const n = Math.min(Math.max(1, concurrency), items.length);
  let next = 0;
  const runOne = async () => {
    while (next < items.length) {
      const idx = next;
      next += 1;
      await worker(items[idx]!);
    }
  };
  await Promise.all(Array.from({ length: n }, () => runOne()));
}

export type RunIncrementalAutosyncCycleOptions = {
  tokenStore: PatreonTokenStore;
  patreonSyncService: PatreonSyncService;
  /**
   * When set, run the sync pass for this Relay creator id only (BullMQ targeted job).
   * Skips `listCreatorIds`; does not apply `maxCreatorsPerCycle` cap.
   */
  creatorId?: string;
  /** When set, success/failure is recorded like `POST /api/v1/patreon/scrape`. */
  syncHealthStore?: PatreonSyncHealthStoreAPI;
  /** When set, campaign id is upserted for webhook routing (same as manual scrape). */
  campaignCreatorIndex?: PatreonCampaignCreatorIndex;
  /** When set, `CreatorProfile.patreonCampaignId` is updated after a successful scrape (MIG-21). */
  prisma?: PrismaClient;
  /** Overrides `RELAY_AUTOSYNC_MAX_POST_PAGES`. */
  maxPostPages?: number;
  /** Overrides `RELAY_AUTOSYNC_CONCURRENCY`. */
  concurrency?: number;
  /** Overrides `RELAY_AUTOSYNC_MAX_CREATORS_PER_CYCLE` (`0` = no cap). */
  maxCreatorsPerCycle?: number;
  /** Overrides `RELAY_AUTOSYNC_SKIP_UNHEALTHY`. */
  skipUnhealthy?: boolean;
  /**
   * When true, call `getSyncState` with `probe_upstream` and skip scrape if watermark exists and
   * upstream shows no newer posts (saves Patreon calls; complements T-006 webhooks).
   * Overrides `RELAY_AUTOSYNC_PROBE_SKIP` (default on).
   */
  probeSkipWhenCaughtUp?: boolean;
};

type CycleOutcome =
  | { kind: "ok" }
  | { kind: "skip_unhealthy" }
  | { kind: "skip_probe" }
  | { kind: "fail"; message: string };

/**
 * One full autosync pass: watermark-aware incremental `scrapeOrSync` per creator
 * (no `force_refresh_post_access`). Failures are captured per creator.
 * Use from interval worker, CLI, or BullMQ processor.
 */
export async function runIncrementalAutosyncOnce(
  opts: RunIncrementalAutosyncCycleOptions
): Promise<IncrementalAutosyncCycleResult> {
  const started = new Date().toISOString();
  const maxPostPages = Math.min(
    Math.max(
      1,
      opts.maxPostPages ??
        parsePositiveInt(
          process.env.RELAY_PATREON_INCREMENTAL_AUTOSYNC_MAX_POST_PAGES ??
            process.env.RELAY_AUTOSYNC_MAX_POST_PAGES,
          20
        )
    ),
    100
  );
  const concurrency = Math.max(
    1,
    opts.concurrency ??
      parsePositiveInt(process.env.RELAY_AUTOSYNC_CONCURRENCY, 2)
  );
  const maxCreators =
    opts.maxCreatorsPerCycle !== undefined
      ? opts.maxCreatorsPerCycle
      : parsePositiveInt(process.env.RELAY_AUTOSYNC_MAX_CREATORS_PER_CYCLE, 0);
  const skipUnhealthy =
    opts.skipUnhealthy ?? envTruthy(process.env.RELAY_AUTOSYNC_SKIP_UNHEALTHY);
  const probeSkipWhenCaughtUp =
    opts.probeSkipWhenCaughtUp ??
    envTruthy(
      process.env.RELAY_PATREON_INCREMENTAL_AUTOSYNC_PROBE_SKIP ??
        process.env.RELAY_AUTOSYNC_PROBE_SKIP ??
        "1"
    );

  const targeted = opts.creatorId?.trim();
  let creatorIds: string[];
  if (targeted) {
    creatorIds = [targeted];
  } else {
    creatorIds = await opts.tokenStore.listCreatorIds();
    if (maxCreators > 0 && creatorIds.length > maxCreators) {
      creatorIds = creatorIds.slice(0, maxCreators);
    }
  }

  const errors: Array<{ creator_id: string; message: string }> = [];
  const outcomes: CycleOutcome[] = [];

  await runPool(creatorIds, concurrency, async (creatorId) => {
    if (skipUnhealthy) {
      const cred = await opts.tokenStore.getByCreatorId(creatorId);
      if (cred?.credential_health_status === "refresh_failed") {
        outcomes.push({ kind: "skip_unhealthy" });
        return;
      }
    }
    const traceId = `autosync:${randomUUID()}`;
    try {
      const fallbackCampaignId = opts.prisma
        ? (await getCreatorProfilePatreonCampaignIdForRelayCreatorDb(opts.prisma, creatorId)) ??
          undefined
        : undefined;
      let campaignIdForSync: string | undefined;
      if (probeSkipWhenCaughtUp) {
        const state = await opts.patreonSyncService.getSyncState(creatorId, {
          traceId,
          probe_upstream: true,
          fallback_campaign_id: fallbackCampaignId
        });
        campaignIdForSync = state.patreon_campaign_id;
        if (state.watermark_published_at && state.likely_has_newer_posts === false) {
          outcomes.push({ kind: "skip_probe" });
          return;
        }
      }

      const result = await opts.patreonSyncService.scrapeOrSync(creatorId, traceId, {
        campaign_id: campaignIdForSync,
        fallback_campaign_id: fallbackCampaignId,
        max_post_pages: maxPostPages
      });

      if (opts.syncHealthStore) {
        try {
          await opts.syncHealthStore.recordPostScrapeSuccess({
            creator_id: creatorId,
            patreon_campaign_id: result.patreon_campaign_id,
            posts_fetched: result.posts_fetched,
            posts_written: result.apply_result?.posts_written,
            warnings: result.warnings
          });
        } catch {
          /* best-effort */
        }
      }

      if (opts.campaignCreatorIndex) {
        try {
          const idx = await opts.campaignCreatorIndex.upsert(
            result.patreon_campaign_id,
            creatorId.trim()
          );
          if (!idx.ok) {
            // eslint-disable-next-line no-console -- unattended sync ops visibility
            console.warn(
              `[autosync] campaign index collision: campaign=${result.patreon_campaign_id} ` +
                `creator=${creatorId} existing_creator=${idx.existing_creator_id}`
            );
          }
        } catch {
          /* best-effort */
        }
      }

      if (opts.prisma) {
        try {
          await ensureCreatorProfilePatreonCampaignId(opts.prisma, {
            relayCreatorId: creatorId.trim(),
            patreonCampaignId: result.patreon_campaign_id
          });
        } catch {
          /* best-effort */
        }
      }

      outcomes.push({ kind: "ok" });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push({ creator_id: creatorId, message });
      outcomes.push({ kind: "fail", message });
      if (opts.syncHealthStore) {
        const classified = classifySyncError(message);
        try {
          await opts.syncHealthStore.recordPostScrapeFailure({
            creator_id: creatorId,
            error: {
              code: classified.code,
              message: message.slice(0, 400),
              hint: classified.hint
            }
          });
        } catch {
          /* best-effort */
        }
      }
    }
  });

  const creators_succeeded = outcomes.filter((o) => o.kind === "ok").length;
  const creators_skipped_unhealthy = outcomes.filter(
    (o) => o.kind === "skip_unhealthy"
  ).length;
  const creators_skipped_probe = outcomes.filter((o) => o.kind === "skip_probe").length;

  return {
    cycle_started_at: started,
    creators_attempted: creatorIds.length,
    creators_succeeded,
    creators_failed: errors.length,
    creators_skipped_unhealthy,
    creators_skipped_probe,
    errors
  };
}

/**
 * @deprecated Use {@link runIncrementalAutosyncOnce}; name retained for existing imports.
 */
export const runIncrementalAutosyncCycle = runIncrementalAutosyncOnce;

export type StartIncrementalAutosyncWorkerOptions = {
  tokenStore: PatreonTokenStore;
  patreonSyncService: PatreonSyncService;
  syncHealthStore?: PatreonSyncHealthStoreAPI;
  campaignCreatorIndex?: PatreonCampaignCreatorIndex;
  prisma?: PrismaClient;
  log?: (line: string) => void;
};

/**
 * Background **fallback cadence** (webhook safety net). Set `RELAY_AUTOSYNC_ENABLED=1` or
 * `RELAY_PATREON_INCREMENTAL_AUTOSYNC_MS` and tune interval via env.
 * Returns a disposer (clear timers).
 */
function parseAutosyncIntervalMs(): number {
  const raw = process.env.RELAY_PATREON_INCREMENTAL_AUTOSYNC_MS?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 10_000) return n;
  }
  return Math.max(
    60_000,
    parsePositiveInt(process.env.RELAY_AUTOSYNC_INTERVAL_MS, 900_000)
  );
}

function parseAutosyncFallbackBackoffEnabled(): boolean {
  return (
    envTruthy(process.env.RELAY_AUTOSYNC_FAILURE_BACKOFF) ||
    envTruthy(process.env.RELAY_PATREON_INCREMENTAL_FALLBACK_BACKOFF)
  );
}

function parseAutosyncBackoffMaxMultiplier(): number {
  return Math.max(
    2,
    parsePositiveInt(
      process.env.RELAY_AUTOSYNC_FAILURE_BACKOFF_MAX_MULTIPLIER,
      8
    )
  );
}

function parseAutosyncJitterMaxMs(): number {
  return parseNonNegativeInt(
    process.env.RELAY_AUTOSYNC_INTERVAL_JITTER_MS ??
      process.env.RELAY_PATREON_INCREMENTAL_AUTOSYNC_JITTER_MS,
    0
  );
}

/** First tick on boot: legacy `RELAY_AUTOSYNC_SKIP_INITIAL_RUN`; Patreon-prefixed interval uses `RELAY_PATREON_INCREMENTAL_AUTOSYNC_RUN_ON_START`. */
function resolveAutosyncRunOnStart(): boolean {
  if (process.env.RELAY_PATREON_INCREMENTAL_AUTOSYNC_MS?.trim()) {
    const r = process.env.RELAY_PATREON_INCREMENTAL_AUTOSYNC_RUN_ON_START?.trim();
    if (r !== undefined && r !== "") {
      return envTruthy(r);
    }
    return false;
  }
  return !envTruthy(process.env.RELAY_AUTOSYNC_SKIP_INITIAL_RUN);
}

export function startIncrementalAutosyncWorker(
  opts: StartIncrementalAutosyncWorkerOptions
): () => void {
  const log = opts.log ?? ((line: string) => console.log(line));
  const baseIntervalMs = parseAutosyncIntervalMs();
  const runOnStart = resolveAutosyncRunOnStart();
  const backoffEnabled = parseAutosyncFallbackBackoffEnabled();
  const maxBackoffMultiplier = parseAutosyncBackoffMaxMultiplier();
  const jitterMaxMs = parseAutosyncJitterMaxMs();

  let nextTimer: ReturnType<typeof setTimeout> | undefined;
  let cycleRunning = false;
  let consecutiveFailureCycles = 0;

  const scheduleAfter = (delayMs: number) => {
    if (nextTimer !== undefined) clearTimeout(nextTimer);
    nextTimer = setTimeout(() => void runTickAndSchedule(), delayMs);
  };

  const runTickAndSchedule = async () => {
    if (cycleRunning) {
      log("Relay autosync: cycle skipped (previous still running)");
      scheduleAfter(
        computeAutosyncDelayAfterCycle({
          baseIntervalMs,
          jitterMaxMs,
          backoffEnabled: false,
          consecutiveFailureCycles: 0,
          maxBackoffMultiplier
        })
      );
      return;
    }
    cycleRunning = true;
    let r: IncrementalAutosyncCycleResult | undefined;
    try {
      r = await runIncrementalAutosyncOnce({
        tokenStore: opts.tokenStore,
        patreonSyncService: opts.patreonSyncService,
        syncHealthStore: opts.syncHealthStore,
        campaignCreatorIndex: opts.campaignCreatorIndex,
        prisma: opts.prisma
      });
      if (r.creators_failed > 0) {
        consecutiveFailureCycles += 1;
      } else {
        consecutiveFailureCycles = 0;
      }
      log(
        `Relay autosync: cycle ok=${r.creators_succeeded} failed=${r.creators_failed} ` +
          `skipped_probe=${r.creators_skipped_probe} skipped_unhealthy=${r.creators_skipped_unhealthy} ` +
          `attempted=${r.creators_attempted}`
      );
      if (r.errors.length > 0) {
        const sample = r.errors
          .slice(0, 3)
          .map((e) => `${e.creator_id}: ${e.message}`)
          .join(" | ");
        log(`Relay autosync: sample errors: ${sample}`);
      }
      if (backoffEnabled && consecutiveFailureCycles > 0) {
        log(
          `Relay autosync: failure backoff streak=${consecutiveFailureCycles} ` +
            `(next delay uses multiplier up to ${maxBackoffMultiplier}x)`
        );
      }
    } catch (e) {
      consecutiveFailureCycles += 1;
      log(`Relay autosync: cycle threw ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      cycleRunning = false;
    }

    const nextDelay = computeAutosyncDelayAfterCycle({
      baseIntervalMs,
      jitterMaxMs,
      backoffEnabled,
      consecutiveFailureCycles,
      maxBackoffMultiplier
    });
    scheduleAfter(nextDelay);
  };

  if (runOnStart) {
    void runTickAndSchedule();
  } else {
    const delayMs = parsePositiveInt(process.env.RELAY_AUTOSYNC_INITIAL_DELAY_MS, 60_000);
    nextTimer = setTimeout(() => void runTickAndSchedule(), delayMs);
  }

  return () => {
    if (nextTimer !== undefined) clearTimeout(nextTimer);
  };
}
