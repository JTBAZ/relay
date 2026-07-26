/**
 * @fileoverview Orchestrates enriched ingest batches against a `CanonicalStore` + event bus.
 * @description Single entry for `runBatch` with health metric recording.
 * @see ./apply-batch.js
 * @see ./canonical-store.js
 */

import { randomUUID } from "node:crypto";
import type { RelayEventBus } from "../events/event-bus.js";
import { applySyncBatchToSnapshot } from "./apply-batch.js";
import { enrichBatch } from "./auto-enrich.js";
import type { CanonicalStore } from "./canonical-store.js";
import { recordIngestBatchResult } from "./ingest-health-metrics.js";
import type { ApplyBatchResult, SyncBatchInput } from "./types.js";

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
   * @returns {Promise<import("./types.js").ApplyBatchResult>}
   * @async
   */
  public async runBatch(
    batch: SyncBatchInput,
    traceId: string,
    jobId?: string
  ): Promise<ApplyBatchResult> {
    const id = jobId ?? `job_${randomUUID()}`;
    const creatorId = batch.creator_id;
    const { batch: enriched, notes } = enrichBatch(batch);
    let result!: ApplyBatchResult;
    await this.store.mutateForCreator(creatorId, (snapshot) => {
      result = applySyncBatchToSnapshot(snapshot, enriched, id, traceId, this.eventBus);
    });
    if (notes.length > 0) {
      result = { ...result, ingest_notes: notes };
    }
    recordIngestBatchResult(result);
    return result;
  }
}
