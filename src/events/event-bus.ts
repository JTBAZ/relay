import { randomUUID } from "node:crypto";

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

type StoredEvent = RelayEventEnvelope<Record<string, unknown>>;

export class InMemoryEventBus {
  private readonly events: StoredEvent[] = [];

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

  public getAll(): StoredEvent[] {
    return [...this.events];
  }
}
