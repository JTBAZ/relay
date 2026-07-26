/**
 * @fileoverview In-memory Relay domain event envelope + bus used for synchronous fan-out in API code.
 * @description `InMemoryEventBus` stores events for tests/observability; `DbEventBus` extends with async persistence.
 * @see ./event-bus-db.js
 * @see prisma/schema.prisma OutboxEvent (DB adapter)
 */

import { randomUUID } from "node:crypto";

/** @description Standard event envelope with versioning and tenant correlation. */
export type RelayEventEnvelope<TPayload> = {
  event_id: string;
  event_name: string;
  occurred_at: string;
  producer: string;
  version: string;
  tenant_id: string;
  trace_id: string;
  payload: TPayload;
};

/** @description Untyped stored event for aggregates / tests. */
export type StoredEvent = RelayEventEnvelope<Record<string, unknown>>;

/**
 * @description Minimal publish API for domain telemetry.
 * @security-audit-required `tenantId` partitions events; callers must align with authenticated tenant scope.
 */
export interface RelayEventBus {
  /**
   * @description Records an event envelope and returns the materialized payload for immediate use.
   * @param eventName Logical event channel name.
   * @param tenantId Tenant/creator correlation id (Relay convention).
   * @param traceId Trace id echoed across services.
   * @param payload Event body including `primary_id` for dedupe keys.
   * @param options Optional producer label override.
   * @returns Hydrated envelope.
   */
  publish<TPayload extends { primary_id: string }>(
    eventName: string,
    tenantId: string,
    traceId: string,
    payload: TPayload,
    options?: { producer?: string }
  ): RelayEventEnvelope<TPayload>;
  /**
   * @description Retrieves all envelopes published in-memory during process lifetime (tests).
   */
  getAll(): StoredEvent[];
}

/**
 * @description Default volatile bus retaining events only in heap.
 */
export class InMemoryEventBus implements RelayEventBus {
  private readonly events: StoredEvent[] = [];

  /**
   * @description Pushes to internal array snapshot.
   * @inheritdoc
   */
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
    return event;
  }

  /**
   * @description Returns cloned array of stored events.
   */
  public getAll(): StoredEvent[] {
    return [...this.events];
  }
}
