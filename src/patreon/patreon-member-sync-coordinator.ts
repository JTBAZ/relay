/**
 * @fileoverview Debounced scheduler coalescing Patreon `members:*` webhook bursts into one `syncMembers` call per creator/campaign key.
 * @description In-memory timers; records health via `PatreonSyncHealthStoreAPI`.
 * @async Internal `runMemberSync` awaits Patreon + DB.
 * @throws Errors swallowed per design — classified into health store failures best-effort.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma Identity / membership targets inside `PatreonSyncService.syncMembers`
 */
import type { PatreonSyncHealthStoreAPI } from "./patreon-sync-health-store.js";
import type { PatreonSyncService } from "./patreon-sync-service.js";
import { classifySyncError } from "./sync-error-copy.js";

/**
 * Debounces member sync webhook bursts into a single `syncMembers` per (creator, campaign).
 */
export class PatreonMemberSyncCoordinator {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly debounceMs: number;

  public constructor(
    private readonly syncService: PatreonSyncService,
    private readonly healthStore: PatreonSyncHealthStoreAPI,
    debounceMs = 60_000
  ) {
    this.debounceMs = debounceMs;
  }

  private key(creatorId: string, campaignId: string | undefined): string {
    return `${creatorId.trim()}\t${campaignId ?? ""}`;
  }

  /**
   * Schedule a member roster sync after the debounce window. Multiple calls coalesce.
   * When `campaignId` is omitted, `syncMembers` picks the default campaign (single-campaign tokens).
   */
  public scheduleMemberSync(creatorId: string, campaignId?: string): void {
    const k = this.key(creatorId, campaignId);
    const prev = this.timers.get(k);
    if (prev) {
      clearTimeout(prev);
    }
    const t = setTimeout(() => {
      this.timers.delete(k);
      void this.runMemberSync(creatorId, campaignId ?? undefined);
    }, this.debounceMs);
    this.timers.set(k, t);
  }

  private async runMemberSync(creatorId: string, campaignId: string | undefined): Promise<void> {
    try {
      const result = await this.syncService.syncMembers(creatorId, {
        ...(campaignId ? { campaign_id: campaignId } : {}),
        max_pages: 100,
        traceId: `patreon_webhook_member_sync:${creatorId}`
      });
      try {
        await this.healthStore.recordMemberSyncSuccess({
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
        await this.healthStore.recordMemberSyncFailure({
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
    }
  }
}
