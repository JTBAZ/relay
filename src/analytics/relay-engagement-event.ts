/**
 * P5a-ins-011 — append-only first-party engagement rows for visitor-facing gallery APIs.
 * @see prisma/schema.prisma RelayEngagementEvent
 */
import type { PrismaClient, RelayEngagementEventType } from "@prisma/client";

export type RelayEngagementWriterConfig = {
  prisma?: PrismaClient | null;
  relay_db_store_analytics?: boolean;
};

function relayEnvTruthy(raw: string | undefined): boolean {
  if (raw == null || raw === "") {
    return false;
  }
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function analyticsWritesEnabled(cfg: RelayEngagementWriterConfig): boolean {
  if (typeof cfg.relay_db_store_analytics === "boolean") {
    return cfg.relay_db_store_analytics;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_ANALYTICS);
}

/**
 * Fire-and-forget insert; never throws to callers. Skips when Prisma is missing or analytics DB writes are off.
 */
export function enqueueRelayEngagementEvent(
  cfg: RelayEngagementWriterConfig,
  input: {
    creatorId: string;
    eventType: RelayEngagementEventType;
    postId?: string | null;
    mediaId?: string | null;
    sessionKey?: string | null;
    occurredAt?: Date;
  }
): void {
  const prisma = cfg.prisma;
  if (!prisma || !analyticsWritesEnabled(cfg)) {
    return;
  }
  const occurredAt = input.occurredAt ?? new Date();
  void prisma.relayEngagementEvent
    .create({
      data: {
        creatorId: input.creatorId,
        eventType: input.eventType,
        occurredAt,
        postId: input.postId ?? null,
        mediaId: input.mediaId ?? null,
        sessionKey: input.sessionKey?.trim() || null
      }
    })
    .catch(() => {});
}
