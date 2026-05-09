/**
 * @fileoverview Patreon OAuth orchestration for creators: code exchange, token rotation, proactive refresh signals.
 * @description Wraps `PatreonClient`, `PatreonTokenStore`, and telemetry hooks for Part 1A gates.
 * @see ./patreon-client.js
 * @see ./token-store.js
 * @see ../patreon/patreon-user-identity.js
 * @see src/jsdoc-core-entities.ts Artist (creator identity linkage)
 */

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

/** @description Refresh access tokens this far before expiry during automated sync/scrape (ms). */
export const PATREON_PROACTIVE_REFRESH_MARGIN_MS = 15 * 60 * 1000;

/**
 * @description True when automated Patreon API use should call refresh first: unhealthy credential,
 * expired/invalid expiry, or access token expires within {@link PATREON_PROACTIVE_REFRESH_MARGIN_MS}.
 * @param cred Persisted token envelope including expiry and health flags.
 * @returns Whether proactive refresh should run before Patreon calls.
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

/**
 * @description Lifecycle service coordinating Patreon OAuth token exchange and refresh with persistence and domain events.
 * @security-audit-required Handles OAuth secrets and Patreon provider user IDs; callers must bind HTTP routes to authenticated creator sessions.
 */
export class PatreonAuthService {
  private readonly patreonClient: PatreonClient;
  private readonly tokenStore: PatreonTokenStore;
  private readonly eventBus: RelayEventBus;
  private readonly fetchImpl: typeof fetch;

  /**
   * @description Constructs the service with injectable `fetch` for tests.
   * @param patreonClient Patreon token HTTP client.
   * @param tokenStore Encrypted token persistence.
   * @param eventBus Domain event publisher.
   * @param fetchImpl Optional `fetch` implementation (defaults `globalThis.fetch`).
   */
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

  /**
   * @description Exchanges an authorization code for tokens, binds Patreon identity, upserts credentials, and emits `patreon_oauth_connected`.
   * @param creatorId Relay creator scope.
   * @param code OAuth authorization code.
   * @param redirectUri Registered redirect URI echoed to Patreon.
   * @param traceId Correlation id for events/logs.
   * @returns Healthy credential marker for the creator.
   * @async
   * @throws {Error} Patreon token or identity API failures, mismatched prior `provider_user_id`, or persistence errors.
   */
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

  /**
   * @description Uses the refresh token to rotate access/refresh tokens and persists healthy status.
   * @param creatorId Creator scope with stored refresh token.
   * @param traceId Correlation id.
   * @returns Healthy credential summary.
   * @async
   * @throws {Error} When no credentials exist, Patreon refresh fails, or persistence fails.
   */
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
   * @description For jobs/webhooks/automated routes: refresh OAuth tokens before Patreon API calls when
   * the access token is expired, near expiry, or the store marks `refresh_failed`.
   * @param creatorId Creator scope.
   * @param traceId Correlation id for logs on failure.
   * @async
   * @throws {Error} Missing credentials, refresh/network failures from Patreon, or persistence errors after refresh.
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
