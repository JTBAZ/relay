/**
 * @fileoverview Orchestrates enriched ingest batches against a `CanonicalStore` + event bus.
 * @description Single entry for `runBatch` with health metric recording.
 * @see ./apply-batch.js
 * @see ./canonical-store.js
 */

import { randomUUID } from "node:crypto";
import { InMemoryEventBus, type RelayEventBus } from "../events/event-bus.js";
import { applySyncBatchToSnapshot } from "./apply-batch.js";
import { enrichBatch } from "./auto-enrich.js";
import type { CanonicalStore } from "./canonical-store.js";
import { recordIngestBatchResult } from "./ingest-health-metrics.js";
import type { ApplyBatchResult, SyncBatchInput } from "./types.js";
import type { ReplayResolution } from "./replay-compatibility.js";

export class IngestService {
  private readonly store: CanonicalStore;
  private readonly eventBus: RelayEventBus;

  public constructor(store: CanonicalStore, eventBus: RelayEventBus) {
    this.store = store;
    this.eventBus = eventBus;
  }

  /**
   * @description Applies one sync batch with optional stable `jobId`.
   * @param {import("./types.js").SyncBatchInput} batch
   * @param {string} traceId
   * @param {string} [jobId]
   * @param {ReplayResolution[]} [resolutions] Operator-only exact identity decisions.
   * @returns {Promise<import("./types.js").ApplyBatchResult>}
   * @async
   */
  public async runBatch(
    batch: SyncBatchInput,
    traceId: string,
    jobId?: string,
    resolutions: ReplayResolution[] = []
  ): Promise<ApplyBatchResult> {
    const id = jobId ?? `job_${randomUUID()}`;
    const creatorId = batch.creator_id;
    const { batch: enriched, notes } = enrichBatch(batch);
    const pendingEvents = new InMemoryEventBus();
    let result!: ApplyBatchResult;
    await this.store.mutateForCreator(creatorId, (snapshot) => {
      result = applySyncBatchToSnapshot(snapshot, enriched, id, traceId, pendingEvents, resolutions);
    });
    // shortcut: a process crash after commit can lose these events; durable delivery needs an atomic outbox.
    for (const event of pendingEvents.getAll()) {
      this.eventBus.publish(event.event_name, event.tenant_id, event.trace_id,
        event.payload as { primary_id: string }, { producer: event.producer });
    }
    if (notes.length > 0) {
      result = { ...result, ingest_notes: notes };
    }
    recordIngestBatchResult(result);
    return result;
  }
}
