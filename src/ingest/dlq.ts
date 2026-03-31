import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { SyncBatchInput } from "./types.js";

export type DeadLetterRecord = {
  job_id: string;
  creator_id: string;
  trace_id: string;
  error_message: string;
  attempts: number;
  failed_at: string;
  batch: SyncBatchInput;
};

export class FileDeadLetterQueue {
  private readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  public async append(record: DeadLetterRecord): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    let existing: DeadLetterRecord[] = [];
    try {
      const raw = await readFile(this.filePath, "utf8");
      existing = JSON.parse(raw) as DeadLetterRecord[];
    } catch {
      existing = [];
    }
    existing.push(record);
    await writeFile(this.filePath, JSON.stringify(existing, null, 2), "utf8");
  }

  public async readAll(): Promise<DeadLetterRecord[]> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as DeadLetterRecord[];
    } catch {
      return [];
    }
  }
}
