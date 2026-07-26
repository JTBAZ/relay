/**
 * @fileoverview Legacy **unsigned** Patreon webhook stub handlers and trigger classification for the Relay API.
 * @description The `POST /api/v1/webhooks/patreon` JSON stub is not Patreon’s signed v2 delivery — it only schedules `PatreonSyncService.scrapeOrSync`. Platform-signed webhooks live under the Patreon platform path in `server.ts`.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma Rows touched indirectly via sync (`Post`, `MediaAsset`, memberships) — not written in this module.
 */
import type { PatreonSyncService } from "../patreon/patreon-sync-service.js";

/** Minimal JSON body for the legacy test stub (`creator_id`, `campaign_id`, `event_type`). */
export type PatreonWebhookStubPayload = {
  creator_id?: string;
  campaign_id?: string;
  event_type?: string;
};

/**
 * Whether a Patreon-style `event_type` should enqueue a post-shaped sync.
 * @param eventType Raw `X-Patreon-Event` or body `event_type` string.
 */
export function isPatreonPostEventTrigger(eventType: string | undefined): boolean {
  if (!eventType) return false;
  const normalized = eventType.trim().toLowerCase();
  return (
    normalized === "posts:publish" ||
    normalized === "posts:update" ||
    normalized === "posts:delete"
  );
}

/**
 * v2 member / pledge family triggers (`members:*` prefix) on `X-Patreon-Event`.
 * @param eventType Header or body event name.
 */
export function isPatreonMemberFamilyTrigger(eventType: string | undefined): boolean {
  if (!eventType) return false;
  const n = eventType.trim().toLowerCase();
  return n.startsWith("members:");
}

/**
 * Stub handler filter: empty `event_type` is processed; known post events are processed; others ignored by policy in {@link processPatreonWebhookStub}.
 * @param eventType Optional event type string.
 */
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
 * Handles the legacy JSON stub webhook: validates `creator_id`, optionally filters by `event_type`, then kicks Patreon sync/scrape.
 * @async
 * @throws {Error} Propagates from {@link PatreonSyncService.scrapeOrSync} (Patreon HTTP, DB, ingest).
 * @param payload Stub body (unsigned).
 * @param traceId Correlation id for logs.
 * @param syncService Wired `PatreonSyncService` instance.
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

/**
 * @deprecated No in-repo importers; prefer {@link processPatreonWebhookStub}. Alias preserved for external scripts.
 */
export const processPatreonWebhook = processPatreonWebhookStub;

/**
 * Invokes sync after platform verification (caller attests signature) — thin wrapper over `scrapeOrSync`.
 * @async
 * @throws {Error} Propagates from Patreon sync/scrape or persistence.
 * @param syncService Patreon sync coordinator.
 * @param creatorId Relay creator id (`creator_id` trim applied).
 * @param traceId Log correlation.
 * @param opts Optional `campaign_id`.
 */
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
