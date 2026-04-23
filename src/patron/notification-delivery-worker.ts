/**
 * PE-G (BO-P3-03) — Notification delivery worker.
 *
 * Consumes `OutboxEvent` rows produced by Relay services and writes one or more
 * `Notification` rows per event via `mapOutboxEventToNotifications` + `createOrClusterNotification`.
 *
 * # Architecture (single-node now, multi-node-ready)
 *
 * The worker is interface-based (`NotificationDeliveryRunner`) so we can swap implementations
 * without touching call sites:
 *
 *   - InProcessNotificationDeliveryRunner (this file): setInterval loop in the API process.
 *     Cursor stored in `NotificationDeliveryCursor`. Single-row leader; safe for single-node.
 *
 *   - Future BullMQ runner: enqueue a job per OutboxEvent at producer-side; consume with a
 *     dedicated worker process. Same `processOnce` body; storage-side idempotency comes from
 *     the (event_name, tenant_id, primary_id, occurred_at) unique constraint already present
 *     on OutboxEvent + the cluster-key dedupe in `createOrClusterNotification`. Redis adoption
 *     also unlocks distributed leader election so multi-node deploys don't double-fan-out.
 *
 * # Idempotency story
 *
 * If the worker crashes between writing notifications and bumping the cursor, the next run
 * processes the same events again. Cluster-key dedupe folds the duplicate into the same
 * notification row (count increments by 1 -> wrong count by 1). For tier_changed (no cluster
 * key) we additionally check `sourceEventId` before creating to avoid double-write. This keeps
 * the at-least-once-with-soft-dedupe semantics acceptable for v1; exact-once needs Redis +
 * BullMQ `removeOnComplete: { age: ... }` semantics.
 *
 * # Cursor advance
 *
 * After processing a batch, we update `NotificationDeliveryCursor.lastOccurredAt` to the
 * latest event in the batch. Future runs query `OutboxEvent.occurredAt > cursor.lastOccurredAt`,
 * with a tie-breaker on `eventId > cursor.lastEventId` so events sharing a timestamp don't go
 * missing across runs.
 */

import type { PrismaClient, Prisma } from "@prisma/client";

import {
  createOrClusterNotification,
  type CreateNotificationInput
} from "./notification-service.js";
import {
  mapOutboxEventToNotifications,
  PEG_NOTIFIABLE_EVENT_NAMES
} from "./notification-mapper.js";

/** Default poll interval. Overridable via `RELAY_NOTIFICATION_DELIVERY_MS`. */
export const DEFAULT_NOTIFICATION_DELIVERY_MS = 5_000;
/** Hard floor — never poll faster than this in any deploy. */
export const MIN_NOTIFICATION_DELIVERY_MS = 250;
/** Max events processed per tick. Keeps a single tick bounded. */
export const DEFAULT_NOTIFICATION_BATCH_SIZE = 100;

export interface NotificationDeliveryRunner {
  /** Begin the delivery loop (idempotent — calling start twice is a no-op). */
  start(): void;
  /** Stop the delivery loop and resolve once the in-flight tick (if any) completes. */
  stop(): Promise<void>;
  /**
   * Run a single processing tick synchronously. Exposed for tests and ops; production code
   * should rely on `start()` to schedule recurring ticks.
   */
  processOnce(): Promise<NotificationDeliveryStats>;
}

export interface NotificationDeliveryStats {
  /** Number of OutboxEvent rows examined this tick. */
  scanned: number;
  /** Number of Notification rows written or clustered. */
  written: number;
  /** Latest `occurredAt` timestamp the cursor advanced to (null if the tick was a no-op). */
  cursorAdvancedTo: Date | null;
}

const CURSOR_ID = "default";

interface OutboxRow {
  id: string;
  eventId: string;
  eventName: string;
  tenantId: string;
  primaryId: string;
  occurredAt: Date;
  payload: Prisma.JsonValue;
}

async function ensureCursorRow(prisma: PrismaClient): Promise<void> {
  await prisma.notificationDeliveryCursor.upsert({
    where: { id: CURSOR_ID },
    create: { id: CURSOR_ID, lastOccurredAt: new Date(0) },
    update: {}
  });
}

async function loadCursor(prisma: PrismaClient): Promise<{ lastOccurredAt: Date; lastEventId: string | null }> {
  const row = await prisma.notificationDeliveryCursor.findUnique({
    where: { id: CURSOR_ID },
    select: { lastOccurredAt: true, lastEventId: true }
  });
  return row ?? { lastOccurredAt: new Date(0), lastEventId: null };
}

async function fetchNextBatch(
  prisma: PrismaClient,
  cursor: { lastOccurredAt: Date; lastEventId: string | null },
  batchSize: number
): Promise<OutboxRow[]> {
  // We need rows STRICTLY after the cursor. Two-pronged predicate keeps ordering stable when
  // multiple events share occurredAt (Postgres timestamps quantize to microseconds; ties are
  // not rare in tests).
  const rows = await prisma.outboxEvent.findMany({
    where: {
      eventName: { in: PEG_NOTIFIABLE_EVENT_NAMES as string[] },
      OR: [
        { occurredAt: { gt: cursor.lastOccurredAt } },
        ...(cursor.lastEventId
          ? [
              {
                occurredAt: cursor.lastOccurredAt,
                eventId: { gt: cursor.lastEventId }
              }
            ]
          : [])
      ]
    },
    orderBy: [{ occurredAt: "asc" }, { eventId: "asc" }],
    take: batchSize,
    select: {
      id: true,
      eventId: true,
      eventName: true,
      tenantId: true,
      primaryId: true,
      occurredAt: true,
      payload: true
    }
  });
  return rows;
}

/**
 * Soft-dedupe for non-clustered kinds (`clusterKey === null`). Checks whether a notification
 * for the same `sourceEventId` already exists; skips the write if so. Cluster-keyed kinds rely
 * on the existing `findFirst` inside `createOrClusterNotification` for dedupe.
 */
async function alreadyDelivered(
  prisma: PrismaClient,
  sourceEventId: string | null
): Promise<boolean> {
  if (!sourceEventId) return false;
  const existing = await prisma.notification.findFirst({
    where: { sourceEventId },
    select: { id: true }
  });
  return existing !== null;
}

async function deliverInputsForEvent(
  prisma: PrismaClient,
  inputs: CreateNotificationInput[]
): Promise<number> {
  let written = 0;
  for (const input of inputs) {
    if (input.clusterKey === null && (await alreadyDelivered(prisma, input.sourceEventId ?? null))) {
      continue;
    }
    await createOrClusterNotification(prisma, input);
    written += 1;
  }
  return written;
}

export interface InProcessRunnerOptions {
  prisma: PrismaClient;
  /** ms between ticks. Overridden by RELAY_NOTIFICATION_DELIVERY_MS at bootstrap. */
  pollIntervalMs?: number;
  batchSize?: number;
  /** Optional logger -- we keep prod logging dependency-free. */
  log?: (msg: string, ctx?: Record<string, unknown>) => void;
}

/**
 * In-process delivery runner. setInterval loop in the API process. Safe for single-node;
 * see file header for the multi-node story.
 */
export class InProcessNotificationDeliveryRunner implements NotificationDeliveryRunner {
  private readonly prisma: PrismaClient;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly log: (msg: string, ctx?: Record<string, unknown>) => void;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight: Promise<unknown> | null = null;
  private stopping = false;

  public constructor(opts: InProcessRunnerOptions) {
    this.prisma = opts.prisma;
    this.pollIntervalMs = Math.max(
      MIN_NOTIFICATION_DELIVERY_MS,
      opts.pollIntervalMs ?? DEFAULT_NOTIFICATION_DELIVERY_MS
    );
    this.batchSize = opts.batchSize ?? DEFAULT_NOTIFICATION_BATCH_SIZE;
    this.log = opts.log ?? (() => undefined);
  }

  public start(): void {
    if (this.timer || this.stopping) return;
    this.timer = setInterval(() => {
      if (this.inFlight) return; // skip ticks that overlap an in-flight one
      this.inFlight = this.processOnce()
        .catch((err) => {
          this.log("notification-delivery: tick failed", {
            error: err instanceof Error ? err.message : String(err)
          });
        })
        .finally(() => {
          this.inFlight = null;
        });
    }, this.pollIntervalMs);
    if (typeof (this.timer as { unref?: () => void }).unref === "function") {
      (this.timer as { unref: () => void }).unref();
    }
  }

  public async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.inFlight) {
      try {
        await this.inFlight;
      } catch {
        /* swallow */
      }
    }
    this.stopping = false;
  }

  public async processOnce(): Promise<NotificationDeliveryStats> {
    await ensureCursorRow(this.prisma);
    const cursor = await loadCursor(this.prisma);
    const batch = await fetchNextBatch(this.prisma, cursor, this.batchSize);
    if (batch.length === 0) {
      return { scanned: 0, written: 0, cursorAdvancedTo: null };
    }
    let written = 0;
    let lastOccurredAt: Date | null = null;
    let lastEventId: string | null = null;
    for (const event of batch) {
      try {
        const inputs = await mapOutboxEventToNotifications(this.prisma, {
          id: event.id,
          eventName: event.eventName,
          tenantId: event.tenantId,
          primaryId: event.primaryId,
          payload: event.payload as unknown
        });
        written += await deliverInputsForEvent(this.prisma, inputs);
      } catch (err) {
        // One bad event must not stall the whole batch. Log and advance.
        this.log("notification-delivery: event failed", {
          eventId: event.eventId,
          eventName: event.eventName,
          error: err instanceof Error ? err.message : String(err)
        });
      }
      lastOccurredAt = event.occurredAt;
      lastEventId = event.eventId;
    }
    if (lastOccurredAt && lastEventId) {
      await this.prisma.notificationDeliveryCursor.update({
        where: { id: CURSOR_ID },
        data: { lastOccurredAt, lastEventId }
      });
    }
    return {
      scanned: batch.length,
      written,
      cursorAdvancedTo: lastOccurredAt
    };
  }
}

/**
 * Bootstrap helper. Returns the runner so callers can hold a stop() handle for graceful
 * shutdown. Honors `RELAY_NOTIFICATION_DELIVERY_MS` from env (with the floor + default
 * applied). Returns null when explicitly disabled with `RELAY_NOTIFICATION_DELIVERY_MS=0`.
 */
export function startNotificationDeliveryWorker(
  prisma: PrismaClient,
  log?: (msg: string, ctx?: Record<string, unknown>) => void
): NotificationDeliveryRunner | null {
  const raw = (process.env.RELAY_NOTIFICATION_DELIVERY_MS ?? "").trim();
  const parsed = raw === "" ? DEFAULT_NOTIFICATION_DELIVERY_MS : Number(raw);
  if (!Number.isFinite(parsed) || parsed === 0) {
    return null;
  }
  const runner = new InProcessNotificationDeliveryRunner({
    prisma,
    pollIntervalMs: parsed,
    log
  });
  runner.start();
  return runner;
}
