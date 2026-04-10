import type { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type {
  RelayEventBus,
  RelayEventEnvelope,
  StoredEvent
} from "./event-bus.js";

/**
 * Persists each publish to `outbox_events` (best-effort async) while keeping an in-memory
 * copy for `getAll()` so existing tests and callers stay synchronous.
 * Dedupe collisions on `(event_name, tenant_id, primary_id, occurred_at)` are ignored (P2002).
 */
export class DbEventBus implements RelayEventBus {
  private readonly events: StoredEvent[] = [];

  public constructor(private readonly prisma: PrismaClient) {}

  public publish<TPayload extends { primary_id: string }>(
    eventName: string,
    tenantId: string,
    traceId: string,
    payload: TPayload,
    options?: { producer?: string }
  ): RelayEventEnvelope<TPayload> {
    const event: RelayEventEnvelope<TPayload> = {
      event_id: `evt_${randomUUID()}`,
      event_name: eventName,
      occurred_at: new Date().toISOString(),
      producer: options?.producer ?? "relay-api",
      version: "1.0",
      tenant_id: tenantId,
      trace_id: traceId,
      payload
    };

    this.events.push(event as StoredEvent);

    const occurredAt = new Date(event.occurred_at);
    void this.prisma.outboxEvent
      .create({
        data: {
          eventId: event.event_id,
          eventName: event.event_name,
          tenantId: event.tenant_id,
          primaryId: payload.primary_id,
          occurredAt,
          traceId: event.trace_id,
          producer: event.producer,
          version: event.version,
          payload: event.payload as Prisma.InputJsonValue
        }
      })
      .catch((err: unknown) => {
        if (
          typeof err === "object" &&
          err !== null &&
          "code" in err &&
          (err as { code: string }).code === "P2002"
        ) {
          return;
        }
        // eslint-disable-next-line no-console -- surfaced when DB write fails unexpectedly
        console.error("DbEventBus: outbox insert failed", err);
      });

    return event;
  }

  public getAll(): StoredEvent[] {
    return [...this.events];
  }
}
