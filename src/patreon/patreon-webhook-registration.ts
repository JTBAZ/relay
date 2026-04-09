import type { FilePatreonTokenStore } from "../auth/token-store.js";
import { pickDefaultCampaignId } from "./map-patreon-to-ingest.js";
import type { PatreonCampaignCreatorIndex } from "./patreon-campaign-creator-index.js";
import { createWebhook, listWebhooks } from "./patreon-webhook-api.js";
import type { PatreonWebhookMetadataStore } from "./patreon-webhook-metadata-store.js";
import { asDataArray, fetchCampaignsWithTiers } from "./patreon-resource-api.js";
import type { JsonApiDocument, JsonApiResource } from "./jsonapi-types.js";

/** Member + post triggers for Relay (one webhook). */
export const PATREON_PLATFORM_WEBHOOK_TRIGGERS = [
  "members:pledge:create",
  "members:pledge:update",
  "members:update",
  "members:pledge:delete",
  "members:delete",
  "posts:publish",
  "posts:update",
  "posts:delete"
] as const;

function normalizePublicWebhookBase(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

function webhookUriForBase(publicBase: string, opaqueToken: string): string {
  const base = normalizePublicWebhookBase(publicBase);
  return `${base}/api/v1/webhooks/patreon/platform/${opaqueToken}`;
}

function findWebhookResourceByUri(
  listDoc: JsonApiDocument,
  expectedUri: string
): JsonApiResource | null {
  const rows = asDataArray(listDoc.data);
  const want = expectedUri.trim();
  for (const r of rows) {
    if (r.type !== "webhook") continue;
    const uri = typeof r.attributes?.uri === "string" ? r.attributes.uri.trim() : "";
    if (uri === want) return r;
  }
  return null;
}

export type EnsureWebhookResult =
  | { ok: true; uri: string; webhook_id: string }
  | { ok: false; reason: "no_public_base" | "no_tokens" | "multi_campaign" | "api_error"; detail?: string };

/**
 * Idempotent: list webhooks; reuse matching URI or create. Persists secret + metadata.
 */
export async function ensurePatreonPlatformWebhook(args: {
  creatorId: string;
  tokenStore: FilePatreonTokenStore;
  webhookMetaStore: PatreonWebhookMetadataStore;
  campaignIndex: PatreonCampaignCreatorIndex;
  publicWebhookBaseUrl: string | undefined;
  fetchImpl: typeof fetch;
  log?: (msg: string) => void;
}): Promise<EnsureWebhookResult> {
  const log = args.log ?? (() => {});
  const baseRaw = args.publicWebhookBaseUrl?.trim();
  if (!baseRaw) {
    await args.webhookMetaStore.recordSkippedNoPublicUrl(args.creatorId);
    return { ok: false, reason: "no_public_base" };
  }

  const cred = await args.tokenStore.getByCreatorId(args.creatorId);
  if (!cred) {
    return { ok: false, reason: "no_tokens" };
  }

  const fetchOpts = { access_token: cred.access_token, fetch_impl: args.fetchImpl };

  try {
    const campaignsDoc = await fetchCampaignsWithTiers(fetchOpts);
    const campaignId = pickDefaultCampaignId(campaignsDoc);
    if (!campaignId) {
      const detail =
        "Multiple Patreon campaigns — choose a default campaign before webhooks can be registered.";
      await args.webhookMetaStore.recordRegistrationFailure(args.creatorId, detail);
      return { ok: false, reason: "multi_campaign", detail };
    }

    const opaque = await args.webhookMetaStore.ensureOpaqueToken(args.creatorId);
    const uri = webhookUriForBase(baseRaw, opaque);

    const listed = await listWebhooks(fetchOpts);
    const existing = findWebhookResourceByUri(listed, uri);

    let webhookId: string;
    let secret: string;

    if (existing?.id && typeof existing.attributes?.secret === "string") {
      webhookId = String(existing.id);
      secret = existing.attributes.secret;
      log(`Patreon webhook reuse creator=${args.creatorId} webhook_id=${webhookId}`);
    } else {
      const created = await createWebhook(fetchOpts, {
        triggers: [...PATREON_PLATFORM_WEBHOOK_TRIGGERS],
        uri,
        campaignNumericId: campaignId
      });
      const row = asDataArray(created.data)[0];
      if (!row?.id || typeof row.attributes?.secret !== "string") {
        throw new Error("Unexpected create webhook response shape");
      }
      webhookId = String(row.id);
      secret = row.attributes.secret;
      log(`Patreon webhook created creator=${args.creatorId} webhook_id=${webhookId}`);
    }

    await args.webhookMetaStore.recordRegistration({
      creator_id: args.creatorId,
      webhook_id: webhookId,
      webhook_secret: secret,
      uri,
      triggers: [...PATREON_PLATFORM_WEBHOOK_TRIGGERS],
      status: "ok"
    });

    const idx = await args.campaignIndex.upsert(campaignId, args.creatorId);
    if (!idx.ok) {
      log(
        `Patreon campaign index collision: campaign=${campaignId} wanted=${args.creatorId} has=${idx.existing_creator_id}`
      );
    }

    return { ok: true, uri, webhook_id: webhookId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await args.webhookMetaStore.recordRegistrationFailure(args.creatorId, msg);
    log(`ensurePatreonPlatformWebhook failed: ${msg}`);
    return { ok: false, reason: "api_error", detail: msg };
  }
}

export function resolvePublicWebhookBaseFromEnv(): string | undefined {
  const a = process.env.RELAY_PUBLIC_WEBHOOK_BASE_URL?.trim();
  const b = process.env.PUBLIC_WEBHOOK_BASE_URL?.trim();
  return a || b || undefined;
}
