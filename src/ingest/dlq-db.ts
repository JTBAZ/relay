import type { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { DeadLetterQueue, DeadLetterRecord } from "./dlq.js";
import type { SyncBatchInput } from "./types.js";

const DLQ_KIND = "ingest_dlq";
const DLQ_STATUS = "dead_letter";

function rowToRecord(row: {
  id: string;
  creatorId: string;
  traceId: string;
  error: string | null;
  attemptCount: number;
  finishedAt: Date | null;
  dlqBatch: Prisma.JsonValue | null;
}): DeadLetterRecord {
  return {
    job_id: row.id,
    creator_id: row.creatorId,
    trace_id: row.traceId,
    error_message: row.error ?? "",
    attempts: row.attemptCount,
    failed_at: row.finishedAt?.toISOString() ?? new Date().toISOString(),
    batch: (row.dlqBatch ?? {}) as SyncBatchInput
  };
}

/**
 * Postgres-backed ingest DLQ (`job_runs` with `kind = ingest_dlq`). `append` upserts by `job_id`.
 */
export class DbDeadLetterQueue implements DeadLetterQueue {
  public constructor(private readonly prisma: PrismaClient) {}

  public async append(record: DeadLetterRecord): Promise<void> {
    const finishedAt = new Date(record.failed_at);
    await this.prisma.jobRun.upsert({
      where: { id: record.job_id },
      create: {
        id: record.job_id,
        kind: DLQ_KIND,
        creatorId: record.creator_id,
        status: DLQ_STATUS,
        traceId: record.trace_id,
        error: record.error_message,
        attemptCount: record.attempts,
        finishedAt,
        dlqBatch: record.batch as Prisma.InputJsonValue,
        startedAt: null
      },
      update: {
        traceId: record.trace_id,
        error: record.error_message,
        attemptCount: record.attempts,
        finishedAt,
        dlqBatch: record.batch as Prisma.InputJsonValue
      }
    });
  }

  public async readAll(): Promise<DeadLetterRecord[]> {
    const rows = await this.prisma.jobRun.findMany({
      where: { kind: DLQ_KIND },
      orderBy: { finishedAt: "desc" }
    });
    return rows.map((r) =>
      rowToRecord({
        id: r.id,
        creatorId: r.creatorId,
        traceId: r.traceId,
        error: r.error,
        attemptCount: r.attemptCount,
        finishedAt: r.finishedAt,
        dlqBatch: r.dlqBatch
      })
    );
  }

  public async count(): Promise<number> {
    return this.prisma.jobRun.count({ where: { kind: DLQ_KIND } });
  }
}
