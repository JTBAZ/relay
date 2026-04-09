import type { JsonApiDocument } from "./jsonapi-types.js";
import type { PatreonFetchOptions } from "./patreon-resource-api.js";

const API_ROOT = "https://www.patreon.com/api/oauth2/v2";

async function patreonJson(
  method: "GET" | "POST",
  url: string,
  opts: PatreonFetchOptions,
  body?: unknown
): Promise<JsonApiDocument> {
  const res = await opts.fetch_impl(url, {
    method,
    headers: {
      authorization: `Bearer ${opts.access_token}`,
      ...(body !== undefined ? { "content-type": "application/json" } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Patreon webhooks API ${res.status}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text) as JsonApiDocument;
}

const WEBHOOK_FIELDS =
  "fields[webhook]=last_attempted_at,num_consecutive_times_failed,paused,secret,triggers,uri";

export async function listWebhooks(opts: PatreonFetchOptions): Promise<JsonApiDocument> {
  const url = `${API_ROOT}/webhooks?${WEBHOOK_FIELDS}`;
  return patreonJson("GET", url, opts);
}

export type CreateWebhookInput = {
  triggers: string[];
  uri: string;
  campaignNumericId: string;
};

/**
 * POST /api/oauth2/v2/webhooks — create a webhook on the given campaign.
 */
export async function createWebhook(
  opts: PatreonFetchOptions,
  input: CreateWebhookInput
): Promise<JsonApiDocument> {
  const url = `${API_ROOT}/webhooks?${WEBHOOK_FIELDS}`;
  const body = {
    data: {
      type: "webhook",
      attributes: {
        triggers: input.triggers,
        uri: input.uri
      },
      relationships: {
        campaign: {
          data: { type: "campaign", id: input.campaignNumericId }
        }
      }
    }
  };
  return patreonJson("POST", url, opts, body);
}
