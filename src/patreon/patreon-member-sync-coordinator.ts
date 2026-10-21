/**
 * @fileoverview Member sync execution and health reporting for durable Patreon change workers.
 * @description Scheduling and coalescing belong to the shared change work store.
 * @async Internal `runMemberSync` awaits Patreon + DB.
 * @throws Sync failures propagate so durable work remains retryable.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma Identity / membership targets inside `PatreonSyncService.syncMembers`
 */
import type { PatreonSyncHealthStoreAPI } from "./patreon-sync-health-store.js";
import type { PatreonSyncService } from "./patreon-sync-service.js";
import { classifySyncError } from "./sync-error-copy.js";

/**
 * Runs member sync after a durable work claim.
 */
export class PatreonMemberSyncCoordinator {
  public constructor(
    private readonly syncService: PatreonSyncService,
    private readonly healthStore?: PatreonSyncHealthStoreAPI
  ) {}

  public async runMemberSync(creatorId: string, campaignId: string | undefined): Promise<void> {
    try {
      const result = await this.syncService.syncMembers(creatorId, {
        ...(campaignId ? { campaign_id: campaignId } : {}),
        max_pages: 2,
        traceId: `patreon_webhook_member_sync:${creatorId}`
      });
      if (result.coverage && result.coverage !== "complete") throw new Error(`Patreon member roster remains ${result.coverage}; continuation retained.`);
      try {
        await this.healthStore?.recordMemberSyncSuccess({
          creator_id: creatorId,
          patreon_campaign_id: result.patreon_campaign_id,
          members_synced: result.members_synced
        });
      } catch {
        /* best-effort */
      }
    } catch (err: unknown) {
      const msg = (err as Error).message;
      const classified = classifySyncError(msg);
      try {
        await this.healthStore?.recordMemberSyncFailure({
          creator_id: creatorId,
          patreon_campaign_id: campaignId ?? undefined,
          error: {
            code: classified.code,
            message: msg.slice(0, 400),
            hint: classified.hint
          }
        });
      } catch {
        /* best-effort */
      }
      throw err;
    }
  }
}
