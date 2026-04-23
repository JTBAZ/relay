import type { RelayEventBus } from "../events/event-bus.js";
import { fetchPatreonOAuthIdentityUserId } from "../patreon/patreon-user-identity.js";
import {
  recordCreatorOAuthExchangeAttempt,
  recordCreatorOAuthExchangeFailure,
  recordCreatorOAuthExchangeSuccess,
  recordTokenRefreshAttempt,
  recordTokenRefreshFailure,
  recordTokenRefreshSuccess
} from "./part1a-gate-metrics.js";
import { PatreonClient } from "./patreon-client.js";
import type { PatreonTokenStore, PersistedPatreonTokens } from "./token-store.js";

/** Refresh access tokens this far before expiry during automated sync/scrape (ms). */
export const PATREON_PROACTIVE_REFRESH_MARGIN_MS = 15 * 60 * 1000;

/**
 * True when automated Patreon API use should call refresh first: unhealthy credential,
 * expired/invalid expiry, or access token expires within {@link PATREON_PROACTIVE_REFRESH_MARGIN_MS}.
 */
export function needsProactivePatreonRefresh(cred: PersistedPatreonTokens): boolean {
  if (cred.credential_health_status === "refresh_failed") {
    return true;
  }
  const expMs = Date.parse(cred.access_token_expires_at);
  if (!Number.isFinite(expMs)) {
    return true;
  }
  const now = Date.now();
  return expMs <= now + PATREON_PROACTIVE_REFRESH_MARGIN_MS;
}

function addSecondsToNow(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export class PatreonAuthService {
  private readonly patreonClient: PatreonClient;
  private readonly tokenStore: PatreonTokenStore;
  private readonly eventBus: RelayEventBus;
  private readonly fetchImpl: typeof fetch;

  public constructor(
    patreonClient: PatreonClient,
    tokenStore: PatreonTokenStore,
    eventBus: RelayEventBus,
    fetchImpl: typeof fetch = globalThis.fetch
  ) {
    this.patreonClient = patreonClient;
    this.tokenStore = tokenStore;
    this.eventBus = eventBus;
    this.fetchImpl = fetchImpl;
  }

  public async exchangeCodeAndPersist(
    creatorId: string,
    code: string,
    redirectUri: string,
    traceId: string
  ): Promise<{ creator_id: string; credential_health_status: "healthy" }> {
    recordCreatorOAuthExchangeAttempt();
    try {
      const tokenResponse = await this.patreonClient.exchangeCode(code, redirectUri);

      const patreonUserId = await fetchPatreonOAuthIdentityUserId(
        tokenResponse.access_token,
        this.fetchImpl
      );

      const previous = await this.tokenStore.getByCreatorId(creatorId);
      const prevPid = previous?.provider_user_id?.trim();
      if (prevPid && prevPid !== patreonUserId) {
        throw new Error(
          "The Patreon account you used doesn’t match the one already connected to this studio. " +
            "Double-check you’re logged into the correct Patreon account, then try again."
        );
      }

      await this.tokenStore.upsert({
        creator_id: creatorId,
        access_token: tokenResponse.access_token,
        refresh_token: tokenResponse.refresh_token,
        access_token_expires_at: addSecondsToNow(tokenResponse.expires_in),
        credential_health_status: "healthy",
        provider_user_id: patreonUserId
      });

      this.eventBus.publish("patreon_oauth_connected", creatorId, traceId, {
        primary_id: creatorId,
        creator_id: creatorId,
        credential_health_status: "healthy"
      });

      recordCreatorOAuthExchangeSuccess();

      return {
        creator_id: creatorId,
        credential_health_status: "healthy"
      };
    } catch (e) {
      recordCreatorOAuthExchangeFailure();
      throw e;
    }
  }

  public async refreshAndRotate(
    creatorId: string,
    traceId: string
  ): Promise<{ creator_id: string; credential_health_status: "healthy" }> {
    const current = await this.tokenStore.getByCreatorId(creatorId);
    if (!current) {
      throw new Error("Creator credentials not found.");
    }

    recordTokenRefreshAttempt();
    try {
      const refreshed = await this.patreonClient.refreshToken(current.refresh_token);

      await this.tokenStore.upsert({
        creator_id: creatorId,
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        access_token_expires_at: addSecondsToNow(refreshed.expires_in),
        credential_health_status: "healthy"
      });

      this.eventBus.publish("patreon_token_refreshed", creatorId, traceId, {
        primary_id: creatorId,
        creator_id: creatorId,
        credential_health_status: "healthy"
      });

      recordTokenRefreshSuccess();

      return {
        creator_id: creatorId,
        credential_health_status: "healthy"
      };
    } catch (e) {
      recordTokenRefreshFailure();
      throw e;
    }
  }

  /**
   * For jobs/webhooks/automated routes: refresh OAuth tokens before Patreon API calls when
   * the access token is expired, near expiry, or the store marks `refresh_failed`.
   */
  public async ensureFreshAccessForAutomation(creatorId: string, traceId: string): Promise<void> {
    const cred = await this.tokenStore.getByCreatorId(creatorId);
    if (!cred) {
      throw new Error("Creator credentials not found.");
    }
    if (!needsProactivePatreonRefresh(cred)) {
      return;
    }
    try {
      await this.refreshAndRotate(creatorId, traceId);
    } catch (err) {
      // eslint-disable-next-line no-console -- ops visibility for silent automation failures
      console.error(
        `[patreon_oauth] Proactive refresh failed creator_id=${creatorId} trace_id=${traceId}`,
        err
      );
      throw err;
    }
  }
}
