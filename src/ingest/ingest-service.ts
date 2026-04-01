import { randomUUID } from "node:crypto";
import type { InMemoryEventBus } from "../events/event-bus.js";
import { applySyncBatchToSnapshot } from "./apply-batch.js";
import { enrichBatch } from "./auto-enrich.js";
import type { FileCanonicalStore } from "./canonical-store.js";
import type { ApplyBatchResult, SyncBatchInput } from "./types.js";

export class IngestService {
  private readonly store: FileCanonicalStore;
  private readonly eventBus: InMemoryEventBus;

  public constructor(store: FileCanonicalStore, eventBus: InMemoryEventBus) {
    this.store = store;
    this.eventBus = eventBus;
  }

  public async runBatch(
    batch: SyncBatchInput,
    traceId: string,
    jobId?: string
  ): Promise<ApplyBatchResult> {
    const id = jobId ?? `job_${randomUUID()}`;
    const enriched = enrichBatch(batch);
    let result!: ApplyBatchResult;
    await this.store.mutate((snapshot) => {
      result = applySyncBatchToSnapshot(snapshot, enriched, id, traceId, this.eventBus);
    });
    return result!;
  }
}
