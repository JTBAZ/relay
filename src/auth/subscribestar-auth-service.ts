/**
 * SubscribeStar OAuth for creators: code exchange, refresh, identity via GraphQL.
 */

import type { PrismaClient } from "@prisma/client";
import type { RelayEventBus } from "../events/event-bus.js";
import { fetchSubscribeStarCreatorProviderUserId } from "../subscribestar/subscribestar-identity.js";
import type { SubscribeStarOAuthClient } from "../subscribestar/subscribestar-client.js";
import type {
  SubscribeStarCreatorPersistedTokens,
  SubscribeStarCreatorTokenStore
} from "./subscribestar-token-store.js";

const SUBSCRIBESTAR_PROACTIVE_REFRESH_MARGIN_MS = 15 * 60 * 1000;

function needsProactiveSubscribeStarRefresh(cred: SubscribeStarCreatorPersistedTokens): boolean {
  if (cred.credential_health_status === "refresh_failed") {
    return true;
  }
  const expMs = Date.parse(cred.access_token_expires_at);
  if (!Number.isFinite(expMs)) {
    return true;
  }
  return expMs <= Date.now() + SUBSCRIBESTAR_PROACTIVE_REFRESH_MARGIN_MS;
}

function addSecondsToNow(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export class SubscribeStarCreatorAuthService {
  public constructor(
    private readonly client: SubscribeStarOAuthClient,
    private readonly tokenStore: SubscribeStarCreatorTokenStore,
    private readonly eventBus: RelayEventBus,
    private readonly fetchImpl: typeof fetch,
    private readonly graphqlUrl: string,
    private readonly prisma: PrismaClient | null
  ) {}

  public async exchangeCodeAndPersist(
    creatorId: string,
    code: string,
    redirectUri: string,
    traceId: string
  ): Promise<{ creator_id: string; credential_health_status: "healthy"; subscribestar_profile_id: string }> {
    const tokenResponse = await this.client.exchangeCode(code, redirectUri);

    const providerUserId = await fetchSubscribeStarCreatorProviderUserId(
      tokenResponse.access_token,
      this.fetchImpl,
      this.graphqlUrl
    );

    const previous = await this.tokenStore.getByCreatorId(creatorId);
    const prevPid = previous?.provider_user_id?.trim();
    if (prevPid && prevPid !== providerUserId) {
      throw new Error(
        "The SubscribeStar account you used doesn’t match the one already connected to this studio. " +
          "Double-check you’re logged into the correct SubscribeStar account, then try again."
      );
    }

    await this.tokenStore.upsert({
      creator_id: creatorId,
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token,
      access_token_expires_at: addSecondsToNow(tokenResponse.expires_in),
      credential_health_status: "healthy",
      provider_user_id: providerUserId
    });

    if (this.prisma) {
      await this.prisma.creatorProfile.updateMany({
        where: { tenant: { relayCreatorId: creatorId } },
        data: { subscribestarProfileId: providerUserId }
      });
    }

    this.eventBus.publish("subscribestar_oauth_connected", creatorId, traceId, {
      primary_id: creatorId,
      creator_id: creatorId,
      credential_health_status: "healthy",
      subscribestar_profile_id: providerUserId
    });

    return {
      creator_id: creatorId,
      credential_health_status: "healthy",
      subscribestar_profile_id: providerUserId
    };
  }

  public async refreshAndRotate(
    creatorId: string,
    traceId: string
  ): Promise<{ creator_id: string; credential_health_status: "healthy" }> {
    const current = await this.tokenStore.getByCreatorId(creatorId);
    if (!current) {
      throw new Error("Creator SubscribeStar credentials not found.");
    }

    const refreshed = await this.client.refreshToken(current.refresh_token);

    await this.tokenStore.upsert({
      creator_id: creatorId,
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      access_token_expires_at: addSecondsToNow(refreshed.expires_in),
      credential_health_status: "healthy",
      provider_user_id: current.provider_user_id
    });

    this.eventBus.publish("subscribestar_token_refreshed", creatorId, traceId, {
      primary_id: creatorId,
      creator_id: creatorId,
      credential_health_status: "healthy"
    });

    return {
      creator_id: creatorId,
      credential_health_status: "healthy"
    };
  }

  /**
   * Proactive OAuth refresh prior to SubscribeStar GraphQL sync (parity with Patreon automation margins).
   */
  public async ensureFreshAccessForAutomation(creatorId: string, traceId: string): Promise<void> {
    const cred = await this.tokenStore.getByCreatorId(creatorId);
    if (!cred) {
      throw new Error("Creator SubscribeStar credentials not found.");
    }
    if (!needsProactiveSubscribeStarRefresh(cred)) {
      return;
    }
    try {
      await this.refreshAndRotate(creatorId, traceId);
    } catch (err) {
      // eslint-disable-next-line no-console -- mirror Patreon proactive refresh visibility
      console.error(
        `[subscribestar_oauth] Proactive refresh failed creator_id=${creatorId} trace_id=${traceId}`,
        err
      );
      throw err;
    }
  }

  /**
   * @returns Decrypted Bearer access token suitable for SubscribeStar `/api/graphql/v1` requests.
   */
  public async resolveAccessTokenForGraphqlApi(
    creatorId: string,
    traceId: string
  ): Promise<string> {
    await this.ensureFreshAccessForAutomation(creatorId, traceId);
    const latest = await this.tokenStore.getByCreatorId(creatorId);
    const tok = latest?.access_token?.trim();
    if (!tok) {
      throw new Error("SubscribeStar access_token missing after refresh.");
    }
    return tok;
  }

  /** Relay `creator_id`s with stored SubscribeStar OAuth (autosync ticks iterate this list). */
  public listStoredCreatorIds(): Promise<string[]> {
    return this.tokenStore.listCreatorIds();
  }
}
