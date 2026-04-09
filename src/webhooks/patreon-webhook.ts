import type { PatreonSyncService } from "../patreon/patreon-sync-service.js";

export type PatreonWebhookStubPayload = {
  creator_id?: string;
  campaign_id?: string;
  event_type?: string;
};

export function isPatreonPostEventTrigger(eventType: string | undefined): boolean {
  if (!eventType) return false;
  const normalized = eventType.trim().toLowerCase();
  return (
    normalized === "posts:publish" ||
    normalized === "posts:update" ||
    normalized === "posts:delete"
  );
}

/** v2 member / pledge triggers (header `X-Patreon-Event`). */
export function isPatreonMemberFamilyTrigger(eventType: string | undefined): boolean {
  if (!eventType) return false;
  const n = eventType.trim().toLowerCase();
  return n.startsWith("members:");
}

export function shouldProcessPatreonStubEvent(eventType: string | undefined): boolean {
  if (!eventType) return true;
  const normalized = eventType.trim().toLowerCase();
  return (
    normalized === "posts:publish" ||
    normalized === "posts:update" ||
    normalized === "posts:delete"
  );
}

/**
 * Legacy JSON stub (`creator_id`, `campaign_id`, `event_type`) used by
 * `POST /api/v1/webhooks/patreon` — not Patreon’s signed delivery.
 */
export async function processPatreonWebhookStub(
  payload: PatreonWebhookStubPayload,
  traceId: string,
  syncService: PatreonSyncService
): Promise<{ accepted: boolean; reason?: string; sync_started?: boolean }> {
  if (!payload.creator_id || !payload.creator_id.trim()) {
    return { accepted: false, reason: "creator_id is required" };
  }
  if (!shouldProcessPatreonStubEvent(payload.event_type)) {
    return { accepted: true, reason: "ignored_event_type", sync_started: false };
  }

  await syncService.scrapeOrSync(payload.creator_id.trim(), traceId, {
    campaign_id: payload.campaign_id?.trim() || undefined,
    dry_run: false
  });
  return { accepted: true, sync_started: true };
}

/** @deprecated Use `processPatreonWebhookStub` — alias for older imports. */
export const processPatreonWebhook = processPatreonWebhookStub;

export async function scrapeOrSyncFromVerifiedPlatform(
  syncService: PatreonSyncService,
  creatorId: string,
  traceId: string,
  opts: { campaign_id?: string }
): Promise<void> {
  await syncService.scrapeOrSync(creatorId.trim(), traceId, {
    campaign_id: opts.campaign_id?.trim() || undefined,
    dry_run: false
  });
}
