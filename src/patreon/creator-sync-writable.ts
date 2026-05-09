/**
 * P5-sync-004 — Block creator studio mutations when Patreon sync rollup is degraded or failed.
 */

import type { Response } from "express";
import { errorEnvelope } from "../contracts/api.js";
import type { PatreonSyncHealthStoreAPI } from "./patreon-sync-health-store.js";
import { creatorSyncHealthStateToWebDto, type SyncHealthWebStatus } from "./sync-health-web-dto.js";

export function syncHealthStatusBlocksStudioWrites(status: SyncHealthWebStatus): boolean {
  return status === "failed" || status === "degraded";
}

/**
 * When last post scrape / member sync rollup is **failed** or **degraded**, respond **423** with
 * `SYNC_DEGRADED` and close the request. **unknown** and **healthy** allow writes.
 * @returns `true` if the handler should continue; `false` if `res` was already sent.
 */
export async function assertCreatorSyncWritable(
  res: Response,
  traceId: string,
  store: PatreonSyncHealthStoreAPI,
  creatorId: string
): Promise<boolean> {
  const id = creatorId.trim();
  if (!id) {
    return true;
  }
  const row = await store.getForCreator(id);
  const dto = creatorSyncHealthStateToWebDto(row ?? undefined);
  if (!syncHealthStatusBlocksStudioWrites(dto.status)) {
    return true;
  }
  res.status(423).json(
    errorEnvelope(
      "SYNC_DEGRADED",
      "Patreon sync is degraded or failed — fix sync health before editing.",
      traceId,
      [
        { field: "sync_health.status", issue: dto.status },
        { field: "sync_health.message_key", issue: dto.message_key }
      ]
    )
  );
  return false;
}
