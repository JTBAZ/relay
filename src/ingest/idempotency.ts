import { createHash } from "node:crypto";

export function ingestIdempotencyKey(parts: string[]): string {
  return createHash("sha256").update(parts.join("|"), "utf8").digest("hex");
}
