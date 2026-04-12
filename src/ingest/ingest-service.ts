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

  public async runBatch(
    batch: SyncBatchInput,
    traceId: string,
    jobId?: string
  ): Promise<ApplyBatchResult> {
    const id = jobId ?? `job_${randomUUID()}`;
    const { batch: enriched, notes } = enrichBatch(batch);
    let result!: ApplyBatchResult;
    await this.store.mutate((snapshot) => {
      result = applySyncBatchToSnapshot(snapshot, enriched, id, traceId, this.eventBus);
    });
    if (notes.length > 0) {
      result = { ...result, ingest_notes: notes };
    }
    recordIngestBatchResult(result);
    return result;
  }
}
