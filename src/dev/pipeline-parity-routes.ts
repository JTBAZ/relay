import type { Request, Response } from "express";
import type { PrismaClient } from "@prisma/client";
import { OAuthPurpose, UserKind } from "@prisma/client";
import { errorEnvelope, successEnvelope } from "../contracts/api.js";
import { resolvePatreonWebhookCampaignOwnership } from "../patreon/campaign-tenant-resolve.js";
import type { PatreonCampaignCreatorIndex } from "../patreon/patreon-campaign-creator-index.js";
import type { AppConfig } from "../server.js";
import { buildRelayRuntimeManifest } from "./relay-runtime-manifest.js";

const PARITY_HEADER = "x-relay-pipeline-parity-secret";

function traceIdFrom(req: Request): string {
  return req.header("x-trace-id") ?? `trace_parity_${Date.now()}`;
}

function pipelineParityAuthorized(req: Request): boolean {
  const expected = process.env.RELAY_PIPELINE_PARITY_SECRET?.trim();
  if (!expected) {
    return false;
  }
  return req.header(PARITY_HEADER)?.trim() === expected;
}

function sendParityDisabled(res: Response, traceId: string): void {
  res.status(404).json(
    errorEnvelope(
      "NOT_FOUND",
      "Pipeline parity API disabled (set RELAY_PIPELINE_PARITY_SECRET and send X-Relay-Pipeline-Parity-Secret).",
      traceId
    )
  );
}

export type PipelineParityRouteContext = {
  config: AppConfig;
  prisma: PrismaClient | undefined;
  patreonCampaignCreatorIndex: PatreonCampaignCreatorIndex;
  credentialStorePath: string;
  cookieStorePath: string;
  patreonWebhookMetadataPath: string;
  patreonCampaignIndexPath: string;
  ingestCanonicalPath: string;
};

/**
 * Dev-only: account list + runtime manifest + per-creator diagnostic snapshot for pipeline parity UI.
 * Requires `RELAY_PIPELINE_PARITY_SECRET` and matching `X-Relay-Pipeline-Parity-Secret` header.
 */
export function registerPipelineParityRoutes(
  app: import("express").Application,
  ctx: PipelineParityRouteContext
): void {
  app.get("/api/dev/pipeline-parity/runtime-manifest", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!pipelineParityAuthorized(req)) {
      return sendParityDisabled(res, traceId);
    }
    const manifest = buildRelayRuntimeManifest(ctx.config);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(successEnvelope(manifest, traceId));
  });

  app.get("/api/dev/pipeline-parity/accounts", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!pipelineParityAuthorized(req)) {
      return sendParityDisabled(res, traceId);
    }
    if (!ctx.prisma) {
      return res
        .status(503)
        .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }

    const accounts = await ctx.prisma.account.findMany({
      where: {
        OR: [{ supabaseUserId: { not: null } }, { primaryRelayCreatorId: { not: null } }]
      },
      select: {
        id: true,
        emailNorm: true,
        supabaseUserId: true,
        primaryRelayCreatorId: true
      },
      orderBy: { createdAt: "desc" },
      take: 200
    });

    const studios: Array<{
      account_id: string;
      relay_creator_id: string;
      patreon_campaign_id: string | null;
      public_slug: string | null;
    }> = [];

    for (const a of accounts) {
      const rid = a.primaryRelayCreatorId?.trim();
      if (!rid) {
        continue;
      }
      const tenant = await ctx.prisma!.tenant.findUnique({
        where: { relayCreatorId: rid },
        select: {
          id: true,
          creators: {
            take: 1,
            select: {
              patreonCampaignId: true,
              publicSlug: true
            }
          }
        }
      });
      const prof = tenant?.creators[0];
      studios.push({
        account_id: a.id,
        relay_creator_id: rid,
        patreon_campaign_id: prof?.patreonCampaignId ?? null,
        public_slug: prof?.publicSlug ?? null
      });
    }

    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(
      successEnvelope(
        {
          accounts: accounts.map((a) => ({
            id: a.id,
            email_norm: a.emailNorm,
            supabase_user_id: a.supabaseUserId,
            primary_relay_creator_id: a.primaryRelayCreatorId
          })),
          studios
        },
        traceId
      )
    );
  });

  app.get("/api/dev/pipeline-parity/snapshot", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!pipelineParityAuthorized(req)) {
      return sendParityDisabled(res, traceId);
    }

    const creatorId =
      typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    if (!creatorId) {
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", "Missing creator_id query parameter.", traceId, [
          { field: "creator_id", issue: "required" }
        ])
      );
    }

    const accountId =
      typeof req.query.account_id === "string" ? req.query.account_id.trim() : undefined;
    const campaignIdArg =
      typeof req.query.campaign_id === "string" ? req.query.campaign_id.trim() : undefined;

    const runtime_manifest = buildRelayRuntimeManifest(ctx.config);

    const paths = {
      credential_store_file: ctx.credentialStorePath,
      cookie_store_file: ctx.cookieStorePath,
      webhook_metadata_file: ctx.patreonWebhookMetadataPath,
      campaign_creator_index_file: ctx.patreonCampaignIndexPath,
      canonical_ingest_file: ctx.ingestCanonicalPath
    };

    if (!ctx.prisma) {
      return res.status(200).json(
        successEnvelope(
          {
            runtime_manifest,
            paths,
            account: null,
            studio: { relay_creator_id: creatorId },
            creator_profile: null,
            oauth_credential_db: null,
            sync_cursor: null,
            creator_sync_state: null,
            webhook_endpoint_db: null,
            canonical_counts_db: null,
            patron_entitlement_row: null,
            isolation: {
              campaign_numeric_id: campaignIdArg ?? null,
              file_index_maps_to_creator_id: null,
              webhook_ownership: { ok: true as const }
            }
          },
          traceId
        )
      );
    }

    const prisma = ctx.prisma;

    let account: {
      id: string;
      email_norm: string | null;
      supabase_user_id: string | null;
      primary_relay_creator_id: string | null;
    } | null = null;

    if (accountId) {
      const row = await prisma.account.findUnique({
        where: { id: accountId },
        select: {
          id: true,
          emailNorm: true,
          supabaseUserId: true,
          primaryRelayCreatorId: true
        }
      });
      if (row) {
        account = {
          id: row.id,
          email_norm: row.emailNorm,
          supabase_user_id: row.supabaseUserId,
          primary_relay_creator_id: row.primaryRelayCreatorId
        };
      }
    }

    const tenant = await prisma.tenant.findUnique({
      where: { relayCreatorId: creatorId },
      select: { id: true }
    });

    const profile = tenant
      ? await prisma.creatorProfile.findFirst({
          where: { tenantId: tenant.id },
          select: {
            publicSlug: true,
            patreonCampaignId: true
          }
        })
      : null;

    const campaignForIsolation = campaignIdArg ?? profile?.patreonCampaignId?.trim() ?? null;

    let fileIndexCreator: string | null = null;
    if (campaignForIsolation) {
      fileIndexCreator = await ctx.patreonCampaignCreatorIndex.getCreatorId(campaignForIsolation);
    }

    const webhook_ownership = await resolvePatreonWebhookCampaignOwnership({
      creatorIdFromRoute: creatorId,
      campaignNumericId: campaignForIsolation,
      fileIndexGetCreatorId: (id) => ctx.patreonCampaignCreatorIndex.getCreatorId(id),
      prisma
    });

    const oauthRow =
      runtime_manifest.relay_db_store.creator_oauth.effective
        ? await prisma.oAuthCredential.findFirst({
            where: {
              purpose: OAuthPurpose.creator_ingest,
              providerAccount: {
                user: {
                  kind: UserKind.creator,
                  tenant: { relayCreatorId: creatorId }
                }
              }
            },
            orderBy: { updatedAt: "desc" },
            select: {
              healthStatus: true,
              expiresAtHint: true,
              lastSuccessAt: true,
              lastFailureAt: true,
              lastFailureCode: true,
              updatedAt: true
            }
          })
        : null;

    const syncCursor =
      campaignForIsolation && runtime_manifest.relay_db_store.watermark.effective
        ? await prisma.syncCursor.findUnique({
            where: {
              creatorId_campaignId: { creatorId, campaignId: campaignForIsolation }
            },
            select: {
              lastSyncedAt: true,
              updatedAt: true
            }
          })
        : null;

    const creatorSyncState = runtime_manifest.relay_db_store.sync_health.effective
      ? await prisma.creatorSyncState.findUnique({
          where: { creatorId },
          select: {
            lastPostScrape: true,
            lastMemberSync: true,
            updatedAt: true
          }
        })
      : null;

    const webhookEndpointDb = await prisma.webhookEndpoint.findFirst({
      where: { relayCreatorId: creatorId },
      select: {
        id: true,
        relayCreatorId: true,
        patreonCampaignNumericId: true,
        opaqueDeliveryToken: true,
        patreonWebhookId: true,
        uriRegistered: true,
        registrationStatus: true,
        triggers: true,
        keyId: true,
        encryptedSecret: true,
        createdAt: true,
        updatedAt: true
      }
    });

    let canonical_counts_db: { posts: number; media_assets: number } | null = null;
    if (
      campaignForIsolation &&
      runtime_manifest.relay_db_store.canonical.effective &&
      tenant
    ) {
      const [posts, media] = await Promise.all([
        prisma.post.count({
          where: { creatorId, campaignId: campaignForIsolation }
        }),
        prisma.mediaAsset.count({ where: { creatorId } })
      ]);
      canonical_counts_db = { posts, media_assets: media };
    }

    let patron_entitlement_row: {
      as_of: string;
      stale_after: string | null;
      entitled_tier_ids: string[];
      active: boolean;
    } | null = null;
    if (accountId && runtime_manifest.relay_db_store.identity.effective) {
      const snap = await prisma.patronEntitlementSnapshot.findFirst({
        where: {
          relayCreatorId: creatorId,
          membership: { accountId }
        },
        select: {
          asOf: true,
          staleAfter: true,
          entitledTierIds: true,
          active: true
        },
        orderBy: { asOf: "desc" }
      });
      if (snap) {
        patron_entitlement_row = {
          as_of: snap.asOf.toISOString(),
          stale_after: snap.staleAfter?.toISOString() ?? null,
          entitled_tier_ids: snap.entitledTierIds,
          active: snap.active
        };
      }
    }

    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(
      successEnvelope(
        {
          runtime_manifest,
          paths,
          account,
          studio: { relay_creator_id: creatorId, tenant_id: tenant?.id ?? null },
          creator_profile: profile
            ? {
                public_slug: profile.publicSlug,
                patreon_campaign_id: profile.patreonCampaignId
              }
            : null,
          oauth_credential_db: oauthRow
            ? {
                health_status: oauthRow.healthStatus,
                expires_at_hint: oauthRow.expiresAtHint?.toISOString() ?? null,
                last_success_at: oauthRow.lastSuccessAt?.toISOString() ?? null,
                last_failure_at: oauthRow.lastFailureAt?.toISOString() ?? null,
                last_failure_code: oauthRow.lastFailureCode,
                updated_at: oauthRow.updatedAt.toISOString()
              }
            : null,
          sync_cursor: syncCursor
            ? {
                last_synced_at: syncCursor.lastSyncedAt.toISOString(),
                updated_at: syncCursor.updatedAt.toISOString()
              }
            : null,
          creator_sync_state: creatorSyncState
            ? {
                last_post_scrape: creatorSyncState.lastPostScrape,
                last_member_sync: creatorSyncState.lastMemberSync,
                updated_at: creatorSyncState.updatedAt.toISOString()
              }
            : null,
          webhook_endpoint_db: webhookEndpointDb
            ? {
                id: webhookEndpointDb.id,
                relay_creator_id: webhookEndpointDb.relayCreatorId,
                patreon_campaign_numeric_id: webhookEndpointDb.patreonCampaignNumericId,
                opaque_delivery_token: webhookEndpointDb.opaqueDeliveryToken,
                patreon_webhook_id: webhookEndpointDb.patreonWebhookId,
                uri_registered: webhookEndpointDb.uriRegistered,
                registration_status: webhookEndpointDb.registrationStatus,
                triggers: webhookEndpointDb.triggers,
                key_id: webhookEndpointDb.keyId,
                has_encrypted_secret: Boolean(
                  webhookEndpointDb.encryptedSecret &&
                    webhookEndpointDb.encryptedSecret.length > 0
                ),
                created_at: webhookEndpointDb.createdAt.toISOString(),
                updated_at: webhookEndpointDb.updatedAt.toISOString()
              }
            : null,
          canonical_counts_db,
          patron_entitlement_row,
          isolation: {
            campaign_numeric_id: campaignForIsolation,
            file_index_maps_to_creator_id: fileIndexCreator,
            webhook_ownership
          }
        },
        traceId
      )
    );
  });
}
