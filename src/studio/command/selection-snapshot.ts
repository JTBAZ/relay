/**
 * Complete selection snapshot helpers (RC-P5-T04).
 * Checksum is over ordered post_ids only — never media URLs.
 */
import { createHash } from "node:crypto";
import { CommandContractError } from "./contracts.js";

export function selectionChecksum(postIds: readonly string[]): string {
  return createHash("sha256").update(postIds.join("\n"), "utf8").digest("hex");
}

export function assertCatalogComplete(catalogComplete: boolean): void {
  if (catalogComplete) return;
  throw new CommandContractError(
    "COMMAND_VALIDATION",
    "Selection catalog is truncated; a complete snapshot is required.",
    [{ field: "complete", issue: "false" }]
  );
}

export function assertSelectionRevision(
  expectedRevision: string,
  postIds: readonly string[]
): void {
  const actual = selectionChecksum(postIds);
  if (actual !== expectedRevision.trim()) {
    throw new CommandContractError(
      "COMMAND_STALE_SELECTION",
      "Selection revision no longer matches the frozen snapshot.",
      [{ field: "revision", issue: "stale" }]
    );
  }
}
