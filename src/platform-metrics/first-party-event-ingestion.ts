/**
 * PMD-041 — first-party telemetry ingestion service.
 * @see docs/platform-first-party-event-contract.md
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  type NormalizedFirstPartyIngest,
  validateFirstPartyIngestRequest
} from "./first-party-event-contract.js";

export type FirstPartyIngestWriterConfig = {
  prisma?: PrismaClient | null;
  relay_db_store_analytics?: boolean;
};

export type FirstPartyIngestSuccess = {
  accepted: true;
  event_id: string;
  event_name: string;
  storage: "platform_telemetry_events" | "relay_engagement_events";
  occurred_at: string;
  ingested_at: string;
};

export type FirstPartyIngestFailureCode =
  | "VALIDATION_ERROR"
  | "EVENT_NOT_ACCEPTED"
  | "STORAGE_UNAVAILABLE";

export type FirstPartyIngestOutcome =
  | { ok: true; result: FirstPartyIngestSuccess }
  | {
      ok: false;
      code: FirstPartyIngestFailureCode;
      message: string;
      errors: string[];
    };

function relayEnvTruthy(raw: string | undefined): boolean {
  if (raw == null || raw === "") return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function analyticsWritesEnabled(cfg: FirstPartyIngestWriterConfig): boolean {
  if (typeof cfg.relay_db_store_analytics === "boolean") {
    return cfg.relay_db_store_analytics;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_ANALYTICS);
}

function readOptionalId(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

async function persistNormalizedEvent(
  prisma: PrismaClient,
  normalized: NormalizedFirstPartyIngest,
  traceId?: string | null
): Promise<FirstPartyIngestSuccess> {
  const ingestedAt = new Date();

  if (normalized.definition.storage === "relay_engagement_events") {
    const legacyType = normalized.definition.legacyRelayEngagementType;
    if (!legacyType || !normalized.creatorId) {
      throw new Error("relay engagement event missing creator_id or legacy mapping");
    }

    const row = await prisma.relayEngagementEvent.create({
      data: {
        creatorId: normalized.creatorId,
        eventType: legacyType,
        occurredAt: normalized.occurredAt,
        postId: readOptionalId(normalized.payload, "post_id"),
        mediaId: readOptionalId(normalized.payload, "media_id"),
        sessionKey: normalized.sessionKey
      }
    });

    return {
      accepted: true,
      event_id: row.id,
      event_name: normalized.eventName,
      storage: "relay_engagement_events",
      occurred_at: normalized.occurredAt.toISOString(),
      ingested_at: ingestedAt.toISOString()
    };
  }

  const row = await prisma.platformTelemetryEvent.create({
    data: {
      eventName: normalized.eventName,
      version: normalized.version,
      producer: normalized.producer,
      occurredAt: normalized.occurredAt,
      sessionKey: normalized.sessionKey,
      actorKey: normalized.actorKey,
      creatorId: normalized.creatorId,
      payload: normalized.payload as Prisma.InputJsonValue,
      traceId: traceId?.trim() || null
    }
  });

  return {
    accepted: true,
    event_id: row.id,
    event_name: normalized.eventName,
    storage: "platform_telemetry_events",
    occurred_at: normalized.occurredAt.toISOString(),
    ingested_at: ingestedAt.toISOString()
  };
}

export async function ingestFirstPartyEvent(
  cfg: FirstPartyIngestWriterConfig,
  body: unknown,
  traceId?: string | null
): Promise<FirstPartyIngestOutcome> {
  const validation = validateFirstPartyIngestRequest(body);
  if (!validation.valid || !validation.normalized) {
    const domainRejected = validation.errors.some((error) =>
      error.includes("domain-sourced")
    );
    return {
      ok: false,
      code: domainRejected ? "EVENT_NOT_ACCEPTED" : "VALIDATION_ERROR",
      message: domainRejected
        ? "This event is derived from domain tables and cannot be posted here."
        : "Invalid first-party event payload.",
      errors: validation.errors
    };
  }

  const prisma = cfg.prisma;
  if (!prisma || !analyticsWritesEnabled(cfg)) {
    return {
      ok: false,
      code: "STORAGE_UNAVAILABLE",
      message:
        "Telemetry storage is unavailable. Configure Prisma and set RELAY_DB_STORE_ANALYTICS=1.",
      errors: []
    };
  }

  try {
    const result = await persistNormalizedEvent(prisma, validation.normalized, traceId);
    return { ok: true, result };
  } catch (err) {
    return {
      ok: false,
      code: "STORAGE_UNAVAILABLE",
      message: err instanceof Error ? err.message : String(err),
      errors: []
    };
  }
}
