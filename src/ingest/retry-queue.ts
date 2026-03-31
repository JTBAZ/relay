import type { FileDeadLetterQueue } from "./dlq.js";
import type { SyncBatchInput } from "./types.js";

export type IngestJob = {
  id: string;
  creator_id: string;
  trace_id: string;
  batch: SyncBatchInput;
  attempts: number;
};

export type RetryPolicy = {
  max_attempts: number;
  base_delay_ms: number;
};

export class IngestRetryQueue {
  private readonly pending: IngestJob[] = [];
  private readonly policy: RetryPolicy;
  private readonly runBatch: (
    batch: SyncBatchInput,
    traceId: string,
    jobId: string
  ) => Promise<void>;
  private readonly dlq: FileDeadLetterQueue;
  private readonly sleepFn: (ms: number) => Promise<void>;

  public constructor(
    policy: RetryPolicy,
    runBatch: (batch: SyncBatchInput, traceId: string, jobId: string) => Promise<void>,
    dlq: FileDeadLetterQueue,
    sleepFn?: (ms: number) => Promise<void>
  ) {
    this.policy = policy;
    this.runBatch = runBatch;
    this.dlq = dlq;
    this.sleepFn = sleepFn ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  public enqueue(job: IngestJob): void {
    this.pending.push(job);
  }

  public pendingCount(): number {
    return this.pending.length;
  }

  public async drain(): Promise<void> {
    while (this.pending.length > 0) {
      const job = this.pending.shift();
      if (!job) {
        return;
      }
      await this.runWithRetry(job);
    }
  }

  private async runWithRetry(job: IngestJob): Promise<void> {
    let attempt = 0;
    while (attempt < this.policy.max_attempts) {
      try {
        await this.runBatch(job.batch, job.trace_id, job.id);
        return;
      } catch (err) {
        attempt += 1;
        job.attempts = attempt;
        const message = err instanceof Error ? err.message : String(err);
        if (attempt >= this.policy.max_attempts) {
          await this.dlq.append({
            job_id: job.id,
            creator_id: job.creator_id,
            trace_id: job.trace_id,
            error_message: message,
            attempts: job.attempts,
            failed_at: new Date().toISOString(),
            batch: job.batch
          });
          return;
        }
        const delay = Math.min(
          60_000,
          this.policy.base_delay_ms * Math.pow(2, attempt - 1)
        );
        await this.sleepFn(delay);
      }
    }
  }
}
