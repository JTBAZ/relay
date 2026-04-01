import type { PatreonSyncService } from "../patreon/patreon-sync-service.js";

export type PatreonWebhookPayload = {
  creator_id?: string;
  campaign_id?: string;
  event_type?: string;
};

export function shouldProcessPatreonEvent(eventType: string | undefined): boolean {
  if (!eventType) return true;
  const normalized = eventType.trim().toLowerCase();
  return normalized === "posts:publish" || normalized === "posts:update" || normalized === "posts:delete";
}

export async function processPatreonWebhook(
  payload: PatreonWebhookPayload,
  traceId: string,
  syncService: PatreonSyncService
): Promise<{ accepted: boolean; reason?: string; sync_started?: boolean }> {
  if (!payload.creator_id || !payload.creator_id.trim()) {
    return { accepted: false, reason: "creator_id is required" };
  }
  if (!shouldProcessPatreonEvent(payload.event_type)) {
    return { accepted: true, reason: "ignored_event_type", sync_started: false };
  }

  await syncService.scrapeOrSync(payload.creator_id.trim(), traceId, {
    campaign_id: payload.campaign_id?.trim() || undefined,
    dry_run: false
  });
  return { accepted: true, sync_started: true };
}
